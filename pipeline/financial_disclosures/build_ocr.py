"""Phase 2 orchestrator: OCR pass over the ``unparseable_scanned`` rows left
by Phase 1 (``build.py``).

Loads the existing ``pipeline/output/financial_disclosures.json``, finds
every row with ``parse_confidence == "unparseable_scanned"``, ensures its PDF
is downloaded (reusing ``fetch.py``'s cache), runs it through
``extract_ocr.extract_ocr_text()`` + the SAME, unchanged ``columns.extract()``
Phase 1 uses, and updates that row in place. Every other row (all
``digital_text`` rows, plus any other ``parse_confidence`` value) is left
byte-for-byte untouched.

One exception to "only re-extracts the document already selected as
``source_doc_id``": if OCR confirms that document has zero Schedule A/D
content (and it isn't the checkbox-grid legacy form -- see
``scan_checkbox_form_v2.py``), ``_resolve_row()`` re-derives the member-
year's other candidate filings (via ``match.rank_filings()``, same matching
Phase 1 did) and tries them instead -- see
``docs/FINANCIAL_DISCLOSURES_ARCHITECTURE.md`` and this component's own
plan history for why: the Clerk's ``filing_type`` code alone can't be
trusted to mean "this is the annual report."

A separate exception, run as its own phase before the OCR pass described
above: any target document confirmed to be the checkbox-grid legacy form
(``checkbox_form_hits()``) is tried first through ``_apply_checkbox_grid()``
(``checkbox_grid.py``'s ruled-line/mark-geometry extraction, not text
recognition), regardless of ``--statuses`` scoping -- see that function's
own docstring for what it can and can't resolve (Liabilities on such a
document is deliberately left unresolved rather than guessed).

Usage:
    python build_ocr.py                 # full run over all unparseable_scanned rows
    python build_ocr.py --limit 10       # process only the first N (testing)
    python build_ocr.py --bioguide A000055 B001257  # restrict to specific members (testing)
"""

from __future__ import annotations

import argparse
import json
import os
import resource
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import requests
from pdf2image import convert_from_path, pdfinfo_from_path

import checkbox_grid
import columns
import fetch
import match
import roster
from bands import ASSET_BANDS, value_total
from extract_ocr import DOC_LOW_CONFIDENCE_THRESHOLD, MAX_OCR_PAGES, extract_ocr_text
from extract_text import extract_digital_text
from schema import validate_record
from scan_checkbox_form_v2 import CHECKBOX_HIT_THRESHOLD, checkbox_form_hits, find_page_titled
from senate_html import SPOUSAL_INDEPENDENT_FLOOR

# checkbox_grid.py's row/column geometry was validated at this DPI -- use
# the same one here rather than extract_ocr.OCR_DPI, which is tuned for
# Tesseract's whole-page text recognition, a different problem with
# different resolution needs.
_CHECKBOX_GRID_DPI = 200

# Best-effort backstop, on top of extract_ocr.py's page-by-page streaming and
# MAX_OCR_PAGES guard: cap each worker process's own address space so a case
# neither of those anticipates (e.g. an anomalously huge single page) fails
# that one worker rather than exhausting the whole machine, which is what
# happened before those fixes (one 333-page filing alone used ~15GB; several
# landing on concurrent workers hit 88GB and crashed). RLIMIT_AS enforcement
# is weaker on macOS than Linux, so treat this as a safety net, not the fix.
_WORKER_MEMORY_LIMIT_BYTES = 4 * 1024 ** 3  # 4 GB per worker process


def _worker_init() -> None:
    """ProcessPoolExecutor initializer: cap Tesseract's own internal OpenMP
    thread pool to 1 per worker process. Without this, each of N worker
    processes would *also* try to multi-thread its own Tesseract call,
    oversubscribing the machine's cores (N worker processes x M threads
    each) and slowing everything down rather than speeding it up -- the
    parallelism this script wants is "N documents at once", not
    "N processes each racing for all cores"."""
    os.environ["OMP_THREAD_LIMIT"] = "1"
    try:
        resource.setrlimit(resource.RLIMIT_AS, (_WORKER_MEMORY_LIMIT_BYTES, _WORKER_MEMORY_LIMIT_BYTES))
    except (ValueError, OSError):
        pass

OUT_DIR = Path(__file__).resolve().parents[1] / "output"
DATA_PATH = OUT_DIR / "financial_disclosures.json"
REPORT_PATH = OUT_DIR / "financial_disclosures_report.json"

# Per-year (bioguide_id -> ranked candidate FilingRows), built lazily and
# reused across every row that needs it -- fetch.fetch_year_index() already
# caches the raw index to disk, so this only costs re-matching in memory,
# not a new network call, and only for years actually touched by a
# no_schedule_found retry (a handful, not all of 2013-2026).
_year_matches_cache: dict[int, dict[str, list]] = {}
_roster_index_cache = None


def _roster_index():
    global _roster_index_cache
    if _roster_index_cache is None:
        members = roster.load_current_house_members()
        _roster_index_cache = roster.build_index(members)
    return _roster_index_cache


def _candidates_for(bioguide_id: str, year: int, session: requests.Session) -> list:
    """All ranked O/A candidates for a member-year, re-derived from the
    Clerk's year index -- the same matching build.py's Phase 1 pass already
    did, just re-run here (cheap: cached index, in-memory matching) so this
    phase can see candidates Phase 1 didn't select."""
    if year not in _year_matches_cache:
        rows = fetch.fetch_year_index(year, session)
        idx = _roster_index()
        matched: dict[str, list] = {}
        for row in rows:
            if row.filing_type not in ("O", "A"):
                continue
            res = match.match_row(row, idx)
            if res.bioguide_id:
                matched.setdefault(res.bioguide_id, []).append(row)
        _year_matches_cache[year] = matched
    return match.rank_filings(_year_matches_cache[year].get(bioguide_id, []))


def _ocr_and_extract(pdf_path: str, max_pages: int = MAX_OCR_PAGES) -> dict:
    """Run in a worker process: OCR the PDF and run it through the
    unchanged `columns.extract()`. Returns a plain (picklable) dict rather
    than the dataclasses themselves -- simpler than teaching the parent
    process to pickle `OcrDocWords`, and this is all the parent needs.

    Kept as a standalone, top-level function (not a closure/method) because
    `ProcessPoolExecutor` pickles the callable to ship it to the worker.
    """
    doc = extract_ocr_text(pdf_path, max_pages=max_pages)
    if doc.oversized:
        return {"oversized": True, "page_count": doc.page_count}
    if doc.is_scanned:
        return {"is_scanned": True, "mean_word_confidence": doc.mean_word_confidence}
    ext = columns.extract(doc)
    return {
        "is_scanned": False,
        "mean_word_confidence": doc.mean_word_confidence,
        "asset_pages": ext.asset_pages,
        "liability_pages": ext.liability_pages,
        "asset_header_found_pages": ext.asset_header_found_pages,
        "liability_header_found_pages": ext.liability_header_found_pages,
        "asset_line_count": ext.asset_line_count,
        "liability_line_count": ext.liability_line_count,
        "assets_total": ext.assets_total,
        "liabilities_total": ext.liabilities_total,
        "has_open_ended_asset": ext.has_open_ended_asset,
        "asset_band_counts": ext.asset_band_counts,
        "liability_band_counts": ext.liability_band_counts,
    }


def _apply_checkbox_grid(rec: dict, pdf_path: str) -> bool:
    """Try the checkbox-grid legacy-form extraction path (see
    checkbox_grid.py) for a document already confirmed to contain that
    form. Returns True if `rec` was resolved this way (caller should skip
    the generic OCR/columns.py path entirely for it), False if it wasn't
    (checkbox_grid.py's geometry search found nothing usable on any page --
    "flag rather than guess": falls through to the existing generic path
    unchanged, same as it already does for every other unresolved case).

    Does NOT use `checkbox_grid.checkbox_form_pages()`/whole-page title
    search to decide WHICH pages to try -- confirmed live those miss real
    pages (Tesseract's whole-page segmentation struggles unpredictably with
    this dense layout, differently on different pages of the *same*
    document), so this tries every page and keeps whatever resolves. Slower
    but correct; a silent undercount of a filer's real assets would be
    worse than the extra runtime.

    Liabilities: does not call `checkbox_grid.extract_liability_blocks()`
    to produce a trusted figure -- its own docstring documents why not (the
    unsolved "Example column" problem). If no page in the document is
    titled "Schedule D" at all, liabilities are confidently zero; otherwise
    `liabilities_total`/`net_worth` are left null and the row is flagged
    for review rather than guessed -- assets can still be presented with
    confidence even though the full net-worth picture isn't complete."""
    page_count = pdfinfo_from_path(pdf_path).get("Pages", 0)
    marks: list[checkbox_grid.ColumnMark] = []
    for pg in range(1, page_count + 1):
        image = convert_from_path(pdf_path, dpi=_CHECKBOX_GRID_DPI, first_page=pg, last_page=pg)[0]
        page_marks = checkbox_grid.extract_asset_blocks(image)
        if page_marks:
            marks.extend(page_marks)
    if not marks:
        return False

    summary = checkbox_grid.summarize_marks(marks)
    assets_total, has_open = value_total(summary.band_counts, ASSET_BANDS)
    spousal_n = summary.band_counts.get(checkbox_grid.SPOUSAL_INDEPENDENT, 0)
    if spousal_n:
        assets_total += SPOUSAL_INDEPENDENT_FLOOR * spousal_n
        has_open = True

    liability_pages = find_page_titled(pdf_path, r"SCHEDULE\s*D\b")
    liabilities_resolved = not liability_pages

    rec["extraction_method"] = "checkbox_grid"
    rec["assets_total"] = round(assets_total, 2)
    rec["has_open_ended_asset"] = has_open
    rec["asset_line_count"] = summary.line_count
    rec["asset_band_counts"] = summary.band_counts
    rec["liability_band_counts"] = {}
    if liabilities_resolved:
        rec["liabilities_total"] = 0.0
        rec["liability_line_count"] = 0
        rec["net_worth"] = round(assets_total, 2)
    else:
        rec["liabilities_total"] = None
        rec["liability_line_count"] = None
        rec["net_worth"] = None

    confident = summary.ambiguous_count == 0 and liabilities_resolved
    rec["parse_confidence"] = "high" if confident else "low"
    rec["needs_review"] = not confident
    note = (
        f"checkbox-grid extraction: {len(marks)} marked asset column(s) found, "
        f"{summary.ambiguous_count} ambiguous"
    )
    if not liabilities_resolved:
        note += (
            f"; Schedule D present as checkbox-grid form on page(s) {liability_pages}, "
            "not auto-extracted (see checkbox_grid.extract_liability_blocks docstring) "
            "-- assets_total is confident, net_worth is not"
        )
    rec["extra_note"] = note
    return True


def _apply_result(rec: dict, result: dict | None, error: str | None, *, is_checkbox_form: bool = False) -> str:
    """Mutate `rec` in place from a worker's `_ocr_and_extract` result (or
    an error string), per the same confidence model build.py uses for
    digital_text rows, plus the OCR-specific `ocr_low_confidence` value.
    Never touches fields outside the value-payload + provenance set a
    Phase 1 row already has.

    Returns "resolved" (rec is in a final state) or "needs_retry" -- the
    latter only for a confirmed-wrong, non-checkbox-form document (see
    `_resolve_row`), so the caller can try the member-year's next-best
    candidate instead of accepting this as final."""
    rec["extraction_method"] = "ocr"

    if error is not None:
        rec["parse_confidence"] = "download_failed"
        rec["needs_review"] = True
        rec["extra_note"] = f"OCR extract error: {error}"
        return "resolved"

    if result.get("oversized"):
        # Page count exceeded extract_ocr.MAX_OCR_PAGES -- deliberately not
        # OCR'd (see that constant's docstring for why: this is the exact
        # failure mode that caused the 88GB crash). Flag for a human rather
        # than a full Tesseract run over hundreds of pages.
        rec["parse_confidence"] = "ocr_skipped_oversized"
        rec["needs_review"] = True
        rec["extra_note"] = f"OCR pass: skipped, {result['page_count']} pages exceeds cap"
        return "resolved"

    if result["is_scanned"]:
        # Tesseract recovered essentially no text at all (e.g. a blank or
        # fully illegible page) -- stays exactly what Phase 1 already had it
        # as, just now confirmed by an actual OCR attempt rather than only
        # pdfplumber's char count.
        rec["parse_confidence"] = "unparseable_scanned"
        rec["needs_review"] = True
        rec["extra_note"] = "OCR pass: no recoverable text"
        return "resolved"

    no_schedule_found = result["asset_pages"] == 0 and result["liability_pages"] == 0
    if no_schedule_found:
        if is_checkbox_form:
            # Confirmed checkbox-grid legacy form (band-boundary header
            # signature) -- OCR simply failed to recognize its own header
            # text, the real filing IS this document. Retrying against a
            # different candidate would misrepresent "wrong document" as
            # the cause and, since there's usually no better alternate,
            # would relabel this "no_schedule_content_found" ("no real
            # filing exists") when the correct read is "pending the
            # checkbox-grid extraction work" -- stays exactly as before.
            rec["parse_confidence"] = "unparseable_scanned"
            rec["needs_review"] = True
            rec["extra_note"] = (
                "OCR pass: no Schedule A/D content found -- confirmed checkbox-grid "
                "legacy form (band-boundary header signature); pending separate "
                "extraction work, not a wrong-document case"
            )
            return "resolved"
        # OCR produced real text, but none of it matches Schedule A/D's
        # literal header phrases anywhere in the document, and this isn't
        # the checkbox-grid form either -- this is not an OCR-quality
        # problem, it means the selected document genuinely isn't a
        # Schedule A/D disclosure (confirmed on samples: several
        # "unparseable_scanned" rows' source_doc_id turned out to be scanned
        # cover letters, e.g. an extension request, picked by match.py's
        # "latest FilingDate wins" tie-break over an actual digital filing
        # for the same member-year). Caller retries the next-best candidate
        # rather than accepting this as final.
        rec["extra_note"] = "OCR pass: no Schedule A/D content found in this document"
        return "needs_retry"

    no_value_data = (
        result["asset_line_count"] == 0
        and result["liability_line_count"] == 0
        and (result["asset_pages"] > 0 or result["liability_pages"] > 0)
    )
    header_incomplete = (
        (result["asset_pages"] > 0 and result["asset_header_found_pages"] < result["asset_pages"])
        or (result["liability_pages"] > 0 and result["liability_header_found_pages"] < result["liability_pages"])
    )

    mean_conf = result["mean_word_confidence"]
    if mean_conf < DOC_LOW_CONFIDENCE_THRESHOLD:
        # Mirrors columns.py's own "flag rather than guess" principle: a
        # document whose OCR quality itself was measured (via Tesseract's
        # per-word confidence) as unreliable does not get its extracted
        # figures presented at the same trust level as a clean OCR read or a
        # digital_text row, even if columns.extract() found *something* --
        # a mean confidence this low (observed on real hand-filled
        # cursive-written filings in this dataset) means individual digits
        # in a band string could easily be misreads that happened to still
        # form a valid-looking literal band label.
        rec["parse_confidence"] = "ocr_low_confidence"
        rec["needs_review"] = True
        rec["extra_note"] = (
            f"OCR pass: mean word confidence {mean_conf:.1f} "
            f"< threshold {DOC_LOW_CONFIDENCE_THRESHOLD}"
        )
        # Leave the value-payload fields null -- do not present a number we
        # don't trust -- but still record the band counts found, for audit.
        rec["asset_band_counts"] = result["asset_band_counts"]
        rec["liability_band_counts"] = result["liability_band_counts"]
        return "resolved"

    confidence = "high"
    if header_incomplete or no_value_data:
        confidence = "low"

    rec["assets_total"] = round(result["assets_total"], 2)
    rec["liabilities_total"] = round(result["liabilities_total"], 2)
    rec["net_worth"] = round(result["assets_total"] - result["liabilities_total"], 2)
    rec["has_open_ended_asset"] = result["has_open_ended_asset"]
    rec["asset_line_count"] = result["asset_line_count"]
    rec["liability_line_count"] = result["liability_line_count"]
    rec["asset_band_counts"] = result["asset_band_counts"]
    rec["liability_band_counts"] = result["liability_band_counts"]
    rec["parse_confidence"] = confidence
    rec["needs_review"] = confidence == "low"
    rec["extra_note"] = f"OCR pass: mean word confidence {mean_conf:.1f}"
    return "resolved"


def _ensure_downloaded(rec: dict, session: requests.Session) -> str | None:
    """Download (or reuse cached) the PDF for `rec`. Returns the path as a
    str, or None if download failed / no doc_id was ever matched."""
    year = rec["year"]
    doc_id = rec["source_doc_id"]
    if not doc_id:
        return None
    pdf_path = fetch.download_pdf(year, doc_id, session)
    return str(pdf_path) if pdf_path else None


def _resolve_row(
    rec: dict,
    session: requests.Session,
    result: dict | None,
    error: str | None,
    pdf_path: str | None,
    max_pages: int,
) -> None:
    """Apply the first (already-computed) OCR attempt via `_apply_result`;
    if that comes back "needs_retry" (confirmed wrong document, not the
    checkbox-grid form), try the member-year's remaining ranked candidates
    -- digital extraction first (cheap, no OCR needed if it works), OCR
    fallback if a candidate is itself scanned -- until one has real
    Schedule A/D content or the list is exhausted. Runs serially regardless
    of --workers: this only fires for the rare no_schedule_found case (a
    handful of rows), so it isn't worth complicating the worker-pool
    dispatch for the common case, which is unaffected."""
    is_checkbox = bool(pdf_path) and checkbox_form_hits(pdf_path) >= CHECKBOX_HIT_THRESHOLD
    outcome = _apply_result(rec, result, error, is_checkbox_form=is_checkbox)
    if outcome == "resolved":
        return

    tried_doc_ids = [rec["source_doc_id"]]
    tried_ids = {rec["source_doc_id"]}
    year = rec["year"]
    remaining = [c for c in _candidates_for(rec["bioguide_id"], year, session) if c.doc_id not in tried_ids]

    for cand in remaining:
        tried_ids.add(cand.doc_id)
        cand_path = fetch.download_pdf(year, cand.doc_id, session)
        if cand_path is None:
            tried_doc_ids.append(f"{cand.doc_id}(download_failed)")
            continue
        cand_path = str(cand_path)

        try:
            doc = extract_digital_text(cand_path)
        except Exception as e:
            tried_doc_ids.append(f"{cand.doc_id}(extract_error: {e})")
            continue

        if not doc.is_scanned:
            ext = columns.extract(doc)
            tried_doc_ids.append(cand.doc_id)
            if not columns.has_schedule_content(ext):
                continue  # confirmed empty digital candidate, try next
            rec["source_doc_id"] = cand.doc_id
            rec["filing_type"] = cand.filing_type
            rec["filing_date"] = cand.filing_date
            rec["extraction_method"] = "digital_text"
            columns.apply_extraction(rec, ext)
            rec.pop("extra_note", None)
            return

        # Candidate is itself scanned -- OCR it, same acceptance rule.
        cand_is_checkbox = checkbox_form_hits(cand_path) >= CHECKBOX_HIT_THRESHOLD
        try:
            cand_result = _ocr_and_extract(cand_path, max_pages=max_pages)
            cand_error = None
        except Exception as e:
            cand_result, cand_error = None, str(e)

        rec["source_doc_id"] = cand.doc_id
        rec["filing_type"] = cand.filing_type
        rec["filing_date"] = cand.filing_date
        outcome = _apply_result(rec, cand_result, cand_error, is_checkbox_form=cand_is_checkbox)
        tried_doc_ids.append(cand.doc_id)
        if outcome == "resolved":
            return

    # Every remaining candidate tried (or none existed): the original
    # candidate was already confirmed (via OCR) to have zero Schedule A/D
    # content, and so was every alternate that could be checked -- this is
    # the terminal "no real filing to find" state, not a scan-quality gap.
    rec["parse_confidence"] = "no_schedule_content_found"
    rec["needs_review"] = True
    rec["extra_note"] = f"checked {len(tried_doc_ids)} candidate filing(s), none contain Schedule A/D content: {tried_doc_ids}"


def _process_row_serial(rec: dict, session: requests.Session, max_pages: int = MAX_OCR_PAGES) -> None:
    """Single-process fallback path (used for --workers 1 / small test runs):
    download then OCR+extract in this same process."""
    pdf_path = _ensure_downloaded(rec, session)
    if pdf_path is None:
        rec["extraction_method"] = "ocr"
        rec["parse_confidence"] = "download_failed"
        rec["needs_review"] = True
        rec["extra_note"] = "OCR pass: PDF download failed"
        return

    try:
        result = _ocr_and_extract(pdf_path, max_pages=max_pages)
        error = None
    except Exception as e:  # pytesseract/pdf2image failure on a malformed/corrupt PDF
        result = None
        error = str(e)
    _resolve_row(rec, session, result, error, pdf_path, max_pages)


def _write_output(records: list[dict]) -> None:
    """Validate + write `financial_disclosures.json`. Called both as a
    mid-run checkpoint and at the very end -- a run that gets killed partway
    through (long OCR runs over ~400 filings are exactly the kind of job
    that can get interrupted) leaves the file in a valid, already-partially-
    updated state, and a rerun's `targets_idx` filter (only rows still
    `unparseable_scanned`) automatically skips whatever a prior run already
    finished, rather than starting over or leaving a half-written file."""
    for i, rec in enumerate(records):
        validate_record(rec, i)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    lines = [json.dumps(rec, separators=(",", ":")) for rec in records]
    body = "[\n" + ",\n".join(lines) + "\n]\n" if lines else "[]\n"
    DATA_PATH.write_text(body)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None, help="process only the first N target rows (testing)")
    ap.add_argument("--bioguide", type=str, nargs="*", default=None, help="restrict to specific bioguide_ids (testing)")
    ap.add_argument("--workers", type=int, default=1, help="parallel worker processes for the OCR+extract step (download stays serial/rate-limited)")
    ap.add_argument("--checkpoint-every", type=int, default=10, help="write financial_disclosures.json after every N completions, so a long run is resumable if interrupted")
    ap.add_argument(
        "--max-pages", type=int, default=MAX_OCR_PAGES,
        help=f"override extract_ocr.MAX_OCR_PAGES (default {MAX_OCR_PAGES}) for this run. "
             "Safe to raise for a targeted re-run (e.g. via --bioguide) against known members "
             "whose filings are legitimately long -- the page-by-page streaming fix means "
             "memory no longer scales with page count, so this only costs wall-clock time. "
             "Leave at the default for a general/unfiltered run.",
    )
    ap.add_argument(
        "--statuses", type=str, nargs="*", default=["unparseable_scanned"],
        help="parse_confidence values to reprocess (default: unparseable_scanned only). "
             "Pass e.g. --statuses unparseable_scanned ocr_low_confidence to also retry "
             "rows an earlier OCR pass flagged low-confidence -- worth doing after a fix "
             "to extract_ocr.py's OCR logic itself (e.g. the rotation-corroboration fix), "
             "since those rows may improve on a rerun even though nothing about the row's "
             "own data changed.",
    )
    args = ap.parse_args()

    records: list[dict] = json.loads(DATA_PATH.read_text())
    print(f"[build_ocr] loaded {len(records)} existing records", file=sys.stderr)

    targets_idx = [
        i for i, r in enumerate(records)
        if r.get("chamber") == "house"  # this module is entirely House-specific
        # (Clerk PDFs, House roster/matching) -- Senate rows can carry the
        # same parse_confidence values (e.g. "unparseable_scanned" for a
        # paper filing) since Phase 3a, and must never reach this pipeline.
        and r["parse_confidence"] in args.statuses
        and (args.bioguide is None or r["bioguide_id"] in args.bioguide)
    ]
    if args.limit is not None:
        targets_idx = targets_idx[: args.limit]
    print(f"[build_ocr] {len(targets_idx)} unparseable_scanned rows to OCR", file=sys.stderr)

    session = requests.Session()
    before_counts: dict[str, int] = {}
    after_counts: dict[str, int] = {}
    t0 = time.time()
    all_target_idx = list(targets_idx)  # kept for after_counts/rows_processed -- targets_idx itself shrinks after Phase 0

    for i in targets_idx:
        before_counts[records[i]["parse_confidence"]] = before_counts.get(records[i]["parse_confidence"], 0) + 1

    # Phase 0: checkbox-grid legacy-form resolution. Runs before, and
    # independent of, --workers -- this is a different technique
    # (checkbox_grid.py's geometry search), not the OCR+columns.py pass
    # below, so it isn't threaded through that pass's ProcessPoolExecutor
    # dispatch. A row resolved here is removed from `targets_idx` so the
    # generic OCR pass never re-processes it (also saves a wasted whole-
    # document Tesseract run on a form that pass can't read anyway).
    remaining_idx = []
    resolved_count = 0
    total_phase0 = len(targets_idx)
    for n, i in enumerate(targets_idx, 1):
        rec = records[i]
        pdf_path = _ensure_downloaded(rec, session)
        if pdf_path is None:
            remaining_idx.append(i)  # let the generic path's own download-failed handling apply
            continue
        try:
            is_checkbox = checkbox_form_hits(pdf_path) >= CHECKBOX_HIT_THRESHOLD
            resolved = is_checkbox and _apply_checkbox_grid(rec, pdf_path)
        except Exception as e:
            # A single malformed page/document must not abort the whole
            # batch -- same "one bad doc, not the whole run" principle the
            # OCR pass below already applies via its own try/except.
            print(f"[build_ocr] checkbox-grid phase error on {rec['bioguide_id']} {rec['year']} doc={rec['source_doc_id']}: {e}", file=sys.stderr)
            resolved = False
        if resolved:
            resolved_count += 1
            print(
                f"[build_ocr] checkbox-grid {n}/{total_phase0} {rec['bioguide_id']} {rec['year']} "
                f"doc={rec['source_doc_id']} -> {rec['parse_confidence']}",
                file=sys.stderr,
            )
        else:
            remaining_idx.append(i)
        if n % args.checkpoint_every == 0:
            _write_output(records)
            print(f"[build_ocr] checkbox-grid phase checkpoint ({n}/{total_phase0})", file=sys.stderr)
    if resolved_count:
        _write_output(records)
        print(f"[build_ocr] checkbox-grid phase resolved {resolved_count}/{total_phase0}, checkpoint written", file=sys.stderr)
    targets_idx = remaining_idx

    if args.workers <= 1:
        for n, i in enumerate(targets_idx, 1):
            rec = records[i]
            _process_row_serial(rec, session, max_pages=args.max_pages)
            elapsed = time.time() - t0
            print(
                f"[build_ocr] {n}/{len(targets_idx)} {rec['bioguide_id']} {rec['year']} "
                f"doc={rec['source_doc_id']} -> {rec['parse_confidence']} "
                f"({elapsed:.0f}s elapsed, {elapsed/n:.1f}s/doc avg)",
                file=sys.stderr,
            )
            if n % args.checkpoint_every == 0:
                _write_output(records)
                print(f"[build_ocr] checkpoint written ({n}/{len(targets_idx)})", file=sys.stderr)
    else:
        # Phase 1: download every target PDF serially, respecting fetch.py's
        # own politeness delay -- this is network I/O against the Clerk's
        # site and must stay single-threaded regardless of --workers.
        print(f"[build_ocr] downloading {len(targets_idx)} PDFs...", file=sys.stderr)
        pdf_paths: dict[int, str | None] = {}
        for n, i in enumerate(targets_idx, 1):
            pdf_paths[i] = _ensure_downloaded(records[i], session)
            if n % 25 == 0:
                print(f"[build_ocr] downloaded {n}/{len(targets_idx)}", file=sys.stderr)

        # Phase 2: OCR + column-extract in parallel worker processes -- CPU
        # bound (Tesseract + pdftoppm subprocesses), so a process pool
        # genuinely uses multiple cores, unlike threads under the GIL.
        print(f"[build_ocr] OCR'ing with {args.workers} worker processes...", file=sys.stderr)
        with ProcessPoolExecutor(max_workers=args.workers, initializer=_worker_init) as pool:
            future_to_idx = {}
            for i in targets_idx:
                path = pdf_paths[i]
                if path is None:
                    continue
                future_to_idx[pool.submit(_ocr_and_extract, path, args.max_pages)] = i

            done = 0
            total = len(targets_idx)
            for i in targets_idx:
                if pdf_paths[i] is None:
                    rec = records[i]
                    rec["extraction_method"] = "ocr"
                    rec["parse_confidence"] = "download_failed"
                    rec["needs_review"] = True
                    rec["extra_note"] = "OCR pass: PDF download failed"
                    done += 1

            for future in as_completed(future_to_idx):
                i = future_to_idx[future]
                rec = records[i]
                try:
                    result = future.result()
                    error = None
                except Exception as e:
                    result = None
                    error = str(e)
                _resolve_row(rec, session, result, error, pdf_paths[i], args.max_pages)
                done += 1
                elapsed = time.time() - t0
                print(
                    f"[build_ocr] {done}/{total} {rec['bioguide_id']} {rec['year']} "
                    f"doc={rec['source_doc_id']} -> {rec['parse_confidence']} "
                    f"({elapsed:.0f}s elapsed)",
                    file=sys.stderr,
                )
                if done % args.checkpoint_every == 0:
                    _write_output(records)
                    print(f"[build_ocr] checkpoint written ({done}/{total})", file=sys.stderr)

    for i in all_target_idx:
        after_counts[records[i]["parse_confidence"]] = after_counts.get(records[i]["parse_confidence"], 0) + 1

    _write_output(records)

    # Update the report file's counts_by_parse_confidence + add an ocr_pass
    # section, without touching Phase 1's other report fields (match_stats,
    # filing_type_counts, etc. -- those describe the Clerk-index matching
    # step this script never re-runs).
    report = json.loads(REPORT_PATH.read_text()) if REPORT_PATH.exists() else {}
    counts: dict[str, int] = {}
    for r in records:
        counts[r["parse_confidence"]] = counts.get(r["parse_confidence"], 0) + 1
    report["counts_by_parse_confidence"] = counts
    report["needs_review_count"] = sum(1 for r in records if r["needs_review"])
    report["ocr_pass"] = {
        "run_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "phase": "2 (House, OCR)",
        "rows_processed": len(all_target_idx),
        "before_counts": before_counts,
        "after_counts": after_counts,
        "elapsed_sec": round(time.time() - t0, 1),
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2))

    print("[build_ocr] DONE", file=sys.stderr)
    print(json.dumps(after_counts, indent=2), file=sys.stderr)


if __name__ == "__main__":
    main()
