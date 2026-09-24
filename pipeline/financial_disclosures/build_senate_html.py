"""Phase 3a orchestrator: Senate eFD electronic ("annual", HTML) reports ->
`pipeline/output/financial_disclosures.json` (`chamber: "senate"` rows).

`/search/view/paper/` (scanned-image) reports are detected and counted (for
Phase 3b sizing) but not fetched or parsed here -- see
`docs/FINANCIAL_DISCLOSURES_ARCHITECTURE.md` and this module's own plan.
When a paper filing is the *only* filing found for a member-year, that row
is written with `parse_confidence: "unparseable_scanned"` rather than
`"no_filing_found"` -- a real gap, correctly distinguished from "no filing
exists" -- with a best-effort year estimate (see `_paper_year_estimate()`)
since paper report labels mostly don't carry an explicit calendar year the
way electronic ones do.

Follows `build_ocr.py`'s merge-into-existing-file precedent (load -> drop
any existing `chamber == "senate"` rows -> append freshly built rows ->
validate -> rewrite) rather than `build.py`'s from-scratch write, since House
rows in the same output file must be left untouched.

Usage:
    python build_senate_html.py                     # full run, all current senators, 2012-CURRENT_YEAR
    python build_senate_html.py --years 2024 2025    # restrict reporting years (testing)
    python build_senate_html.py --last Baldwin Scott # restrict to specific surnames (testing)
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import senate_fetch
import senate_html
import senate_match
import senate_roster
from schema import validate_record

OUT_DIR = Path(__file__).resolve().parents[1] / "output"
DATA_PATH = OUT_DIR / "financial_disclosures.json"
REPORT_PATH = OUT_DIR / "financial_disclosures_report.json"
CURRENT_YEAR = 2026


def _base_record(bioguide_id: str, year: int) -> dict:
    return {
        "bioguide_id": bioguide_id,
        "year": year,
        "chamber": "senate",
        "assets_total": None,
        "liabilities_total": None,
        "net_worth": None,
        "has_open_ended_asset": None,
        "asset_line_count": None,
        "liability_line_count": None,
        "asset_band_counts": {},
        "liability_band_counts": {},
        "source_system": "senate_efd",
        "source_doc_id": None,
        "filing_type": None,
        "filing_date": None,
        "extraction_method": "digital_text",
        "parse_confidence": None,
        "needs_review": False,
    }


def _paper_year_estimate(row: senate_fetch.SearchRow) -> int | None:
    """Best-effort year for a `/paper/` row, since most paper labels are the
    bare old-style "Annual Report" / "Annual Report (Amendment)" with no
    explicit calendar year (unlike electronic reports' "for CY <year>").
    Tries the same label parser first (covers a paper "New Filer Report for
    <date>", if one ever appears); otherwise falls back to filed_date's year
    minus 1 -- annual reports are typically filed in spring of the following
    year (confirmed as the dominant pattern in this session's exploration:
    e.g. the "filed2013" bucket of 112 paper rows lines up with CY2012
    coverage). An amendment filed much later would violate this, so this
    estimate -- and every row using it -- is intentionally still surfaced
    under `parse_confidence: "unparseable_scanned"` / `needs_review: true`,
    not treated as a confirmed fact. Precise year-covered extraction belongs
    to Phase 3b, which can read it directly off the scanned cover page's own
    "Calendar Year Covered by Report" field."""
    info = senate_match.parse_report_label(row.report_label, row.filed_date)
    if info is not None:
        return info.year
    try:
        _, _, yyyy = row.filed_date.split("/")
        return int(yyyy) - 1
    except ValueError:
        return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=int, nargs="*", default=None)
    ap.add_argument("--last", type=str, nargs="*", default=None)
    args = ap.parse_args()

    years = args.years or list(range(senate_roster.EFD_START_YEAR, CURRENT_YEAR + 1))
    years_set = set(years)

    members = senate_roster.load_current_senate_members()
    if args.last:
        wanted = {senate_roster.norm(x) for x in args.last}
        members = [m for m in members if senate_roster.norm(m.last) in wanted]
    index = senate_roster.build_index(members)
    print(f"[build_senate_html] {len(members)} current senators loaded", file=sys.stderr)

    session = senate_fetch.new_session()
    all_rows = senate_fetch.search(session)
    print(f"[build_senate_html] {len(all_rows)} total search rows (Senator role, Annual bucket)", file=sys.stderr)

    senator_rows = [r for r in all_rows if senate_match.is_senator_row(r)]
    annual_rows = [r for r in senator_rows if "/annual/" in r.report_url]
    paper_rows = [r for r in senator_rows if "/paper/" in r.report_url]
    print(f"[build_senate_html] {len(annual_rows)} annual (HTML), {len(paper_rows)} paper (deferred to Phase 3b)", file=sys.stderr)

    match_stats: Counter[str] = Counter()
    unmatched_examples: list[dict] = []
    candidate_excluded = 0
    genuinely_unparsed: list[dict] = []
    matched_annual: dict[tuple[str, int], list] = defaultdict(list)

    for row in annual_rows:
        res = senate_match.match_row(row, index, session=session)
        match_stats[res.reason] += 1
        if not res.bioguide_id:
            if len(unmatched_examples) < 200:
                unmatched_examples.append({"first": row.first, "last": row.last, "office": row.office, "label": row.report_label, "reason": res.reason})
            continue
        info = senate_match.parse_report_label(row.report_label, row.filed_date)
        if info is None:
            if senate_match.is_candidate_report(row.report_label):
                candidate_excluded += 1
            elif len(genuinely_unparsed) < 200:
                genuinely_unparsed.append({"bioguide_id": res.bioguide_id, "label": row.report_label, "filed_date": row.filed_date})
            continue
        matched_annual[(res.bioguide_id, info.year)].append((row, info))

    paper_deferred: dict[tuple[str, int], list] = defaultdict(list)
    paper_match_stats: Counter[str] = Counter()
    for row in paper_rows:
        res = senate_match.match_row(row, index, session=session)
        paper_match_stats[res.reason] += 1
        if not res.bioguide_id:
            continue
        year = _paper_year_estimate(row)
        if year is not None:
            paper_deferred[(res.bioguide_id, year)].append(row)

    print(f"[build_senate_html] annual match_stats: {dict(match_stats)}", file=sys.stderr)
    print(f"[build_senate_html] candidate_excluded={candidate_excluded} genuinely_unparsed={len(genuinely_unparsed)}", file=sys.stderr)

    records: list[dict] = []
    counts: Counter[str] = Counter()
    needs_review_records: list[dict] = []

    for member in members:
        for year in range(member.first_year_served, CURRENT_YEAR + 1):
            if year not in years_set:
                continue
            rec = _base_record(member.bioguide_id, year)
            key = (member.bioguide_id, year)

            if key in matched_annual:
                row, info = senate_match.pick_best_filing(matched_annual[key])
                rec["source_doc_id"] = senate_fetch.report_uuid(row.report_url)
                rec["filing_type"] = "annual_amendment" if info.is_amendment else info.report_kind
                rec["filing_date"] = row.filed_date

                try:
                    html = senate_fetch.fetch_report_html(row.report_url, session)
                    ext = senate_html.extract(html)
                except Exception as e:
                    rec["parse_confidence"] = "download_failed"
                    rec["needs_review"] = True
                    rec["extra_note"] = f"fetch/extract error: {e}"
                    records.append(rec)
                    counts["download_failed"] += 1
                    needs_review_records.append(rec)
                    continue

                any_unrecognized = bool(ext.assets.unrecognized_values or ext.liabilities.unrecognized_values)
                header_missing = (ext.assets.table_found and not ext.assets.value_column_found) or (
                    ext.liabilities.table_found and not ext.liabilities.value_column_found
                )
                confidence = "low" if (any_unrecognized or header_missing) else "high"

                rec["assets_total"] = round(ext.assets.total, 2)
                rec["liabilities_total"] = round(ext.liabilities.total, 2)
                rec["net_worth"] = round(ext.assets.total - ext.liabilities.total, 2)
                rec["has_open_ended_asset"] = ext.assets.has_open_ended
                rec["asset_line_count"] = ext.assets.line_count
                rec["liability_line_count"] = ext.liabilities.line_count
                rec["asset_band_counts"] = ext.assets.band_counts
                rec["liability_band_counts"] = ext.liabilities.band_counts
                rec["parse_confidence"] = confidence
                rec["needs_review"] = confidence == "low"
                if any_unrecognized:
                    rec["extra_note"] = f"unrecognized values: assets={ext.assets.unrecognized_values} liabilities={ext.liabilities.unrecognized_values}"
                records.append(rec)
                counts[confidence] += 1
                if confidence == "low":
                    needs_review_records.append(rec)

            elif key in paper_deferred:
                row = paper_deferred[key][0]
                rec["source_doc_id"] = senate_fetch.report_uuid(row.report_url)
                rec["filing_date"] = row.filed_date
                rec["parse_confidence"] = "unparseable_scanned"
                rec["needs_review"] = True
                rec["extra_note"] = "paper (scanned-image) filing -- deferred to Phase 3b, year estimated from filed_date"
                records.append(rec)
                counts["unparseable_scanned"] += 1
                needs_review_records.append(rec)

            else:
                rec["parse_confidence"] = "no_filing_found"
                records.append(rec)
                counts["no_filing_found"] += 1

    for i, rec in enumerate(records):
        validate_record(rec, i)

    existing: list[dict] = json.loads(DATA_PATH.read_text()) if DATA_PATH.exists() else []
    kept = [r for r in existing if r.get("chamber") != "senate"]
    dropped_senate_rows = len(existing) - len(kept)
    combined = kept + records
    for i, rec in enumerate(combined):
        validate_record(rec, i)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    lines = [json.dumps(rec, separators=(",", ":")) for rec in combined]
    body = "[\n" + ",\n".join(lines) + "\n]\n" if lines else "[]\n"
    DATA_PATH.write_text(body)

    report = json.loads(REPORT_PATH.read_text()) if REPORT_PATH.exists() else {}
    all_counts: Counter[str] = Counter()
    for r in combined:
        all_counts[r["parse_confidence"]] += 1
    report["counts_by_parse_confidence"] = dict(all_counts)
    report["needs_review_count"] = sum(1 for r in combined if r["needs_review"])
    report["senate_html_pass"] = {
        "run_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "phase": "3a (Senate, electronic/HTML filings)",
        "member_count": len(members),
        "years": [min(years), max(years)],
        "replaced_senate_rows": dropped_senate_rows,
        "written_senate_rows": len(records),
        "counts_by_parse_confidence": dict(counts),
        "needs_review_count": len(needs_review_records),
        "match_stats": dict(match_stats),
        "candidate_reports_excluded": candidate_excluded,
        "genuinely_unparsed_labels": len(genuinely_unparsed),
        "genuinely_unparsed_examples": genuinely_unparsed[:20],
        "unmatched_examples": unmatched_examples[:50],
        "paper_rows_total": len(paper_rows),
        "paper_match_stats": dict(paper_match_stats),
        "paper_member_years_deferred": len(paper_deferred),
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2))

    print("[build_senate_html] DONE", file=sys.stderr)
    print(json.dumps(dict(counts), indent=2), file=sys.stderr)


if __name__ == "__main__":
    main()
