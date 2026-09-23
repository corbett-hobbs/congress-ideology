"""Phase 2 orchestrator: OCR pass over the ``unparseable_scanned`` rows left
by Phase 1 (``build.py``).

Loads the existing ``pipeline/output/financial_disclosures.json``, finds
every row with ``parse_confidence == "unparseable_scanned"``, ensures its PDF
is downloaded (reusing ``fetch.py``'s cache), runs it through
``extract_ocr.extract_ocr_text()`` + the SAME, unchanged ``columns.extract()``
Phase 1 uses, and updates that row in place. Every other row (all 3,632
``digital_text`` rows, plus any other ``parse_confidence`` value) is left
byte-for-byte untouched -- this script never re-derives or re-matches a
filing, it only re-extracts the document already selected as
``source_doc_id`` for a row Phase 1 could not read at all.

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

import columns
import fetch
from extract_ocr import DOC_LOW_CONFIDENCE_THRESHOLD, extract_ocr_text
from schema import validate_record

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


def _ocr_and_extract(pdf_path: str) -> dict:
    """Run in a worker process: OCR the PDF and run it through the
    unchanged `columns.extract()`. Returns a plain (picklable) dict rather
    than the dataclasses themselves -- simpler than teaching the parent
    process to pickle `OcrDocWords`, and this is all the parent needs.

    Kept as a standalone, top-level function (not a closure/method) because
    `ProcessPoolExecutor` pickles the callable to ship it to the worker.
    """
    doc = extract_ocr_text(pdf_path)
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


def _apply_result(rec: dict, result: dict | None, error: str | None) -> None:
    """Mutate `rec` in place from a worker's `_ocr_and_extract` result (or
    an error string), per the same confidence model build.py uses for
    digital_text rows, plus the OCR-specific `ocr_low_confidence` value.
    Never touches fields outside the value-payload + provenance set a
    Phase 1 row already has."""
    rec["extraction_method"] = "ocr"

    if error is not None:
        rec["parse_confidence"] = "download_failed"
        rec["needs_review"] = True
        rec["extra_note"] = f"OCR extract error: {error}"
        return

    if result.get("oversized"):
        # Page count exceeded extract_ocr.MAX_OCR_PAGES -- deliberately not
        # OCR'd (see that constant's docstring for why: this is the exact
        # failure mode that caused the 88GB crash). Flag for a human rather
        # than a full Tesseract run over hundreds of pages.
        rec["parse_confidence"] = "ocr_skipped_oversized"
        rec["needs_review"] = True
        rec["extra_note"] = f"OCR pass: skipped, {result['page_count']} pages exceeds cap"
        return

    if result["is_scanned"]:
        # Tesseract recovered essentially no text at all (e.g. a blank or
        # fully illegible page) -- stays exactly what Phase 1 already had it
        # as, just now confirmed by an actual OCR attempt rather than only
        # pdfplumber's char count.
        rec["parse_confidence"] = "unparseable_scanned"
        rec["needs_review"] = True
        rec["extra_note"] = "OCR pass: no recoverable text"
        return

    no_schedule_found = result["asset_pages"] == 0 and result["liability_pages"] == 0
    if no_schedule_found:
        # OCR produced real text, but none of it matches Schedule A/D's
        # literal header phrases anywhere in the document -- this is not an
        # OCR-quality problem, it means the selected document genuinely
        # isn't a Schedule A/D disclosure (confirmed on samples: several
        # "unparseable_scanned" rows' source_doc_id turned out to be scanned
        # cover letters, e.g. an extension request, picked by match.py's
        # "latest FilingDate wins" tie-break over an actual digital filing
        # for the same member-year -- a Phase 1 matching behavior, not
        # something this phase re-derives or fixes). Stays flagged rather
        # than guessing.
        rec["parse_confidence"] = "unparseable_scanned"
        rec["needs_review"] = True
        rec["extra_note"] = "OCR pass: no Schedule A/D content found in this document"
        return

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
        return

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


def _ensure_downloaded(rec: dict, session: requests.Session) -> str | None:
    """Download (or reuse cached) the PDF for `rec`. Returns the path as a
    str, or None if download failed / no doc_id was ever matched."""
    year = rec["year"]
    doc_id = rec["source_doc_id"]
    if not doc_id:
        return None
    pdf_path = fetch.download_pdf(year, doc_id, session)
    return str(pdf_path) if pdf_path else None


def _process_row_serial(rec: dict, session: requests.Session) -> None:
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
        result = _ocr_and_extract(pdf_path)
        error = None
    except Exception as e:  # pytesseract/pdf2image failure on a malformed/corrupt PDF
        result = None
        error = str(e)
    _apply_result(rec, result, error)


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
    ap.add_argument("--limit", type=int, default=None, help="process only the first N unparseable_scanned rows (testing)")
    ap.add_argument("--bioguide", type=str, nargs="*", default=None, help="restrict to specific bioguide_ids (testing)")
    ap.add_argument("--workers", type=int, default=1, help="parallel worker processes for the OCR+extract step (download stays serial/rate-limited)")
    ap.add_argument("--checkpoint-every", type=int, default=10, help="write financial_disclosures.json after every N completions, so a long run is resumable if interrupted")
    args = ap.parse_args()

    records: list[dict] = json.loads(DATA_PATH.read_text())
    print(f"[build_ocr] loaded {len(records)} existing records", file=sys.stderr)

    targets_idx = [
        i for i, r in enumerate(records)
        if r["parse_confidence"] == "unparseable_scanned"
        and (args.bioguide is None or r["bioguide_id"] in args.bioguide)
    ]
    if args.limit is not None:
        targets_idx = targets_idx[: args.limit]
    print(f"[build_ocr] {len(targets_idx)} unparseable_scanned rows to OCR", file=sys.stderr)

    session = requests.Session()
    before_counts: dict[str, int] = {}
    after_counts: dict[str, int] = {}
    t0 = time.time()

    for i in targets_idx:
        before_counts[records[i]["parse_confidence"]] = before_counts.get(records[i]["parse_confidence"], 0) + 1

    if args.workers <= 1:
        for n, i in enumerate(targets_idx, 1):
            rec = records[i]
            _process_row_serial(rec, session)
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
                future_to_idx[pool.submit(_ocr_and_extract, path)] = i

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
                _apply_result(rec, result, error)
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

    for i in targets_idx:
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
        "rows_processed": len(targets_idx),
        "before_counts": before_counts,
        "after_counts": after_counts,
        "elapsed_sec": round(time.time() - t0, 1),
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2))

    print("[build_ocr] DONE", file=sys.stderr)
    print(json.dumps(after_counts, indent=2), file=sys.stderr)


if __name__ == "__main__":
    main()
