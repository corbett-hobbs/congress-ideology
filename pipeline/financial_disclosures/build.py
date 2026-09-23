"""Orchestrator: Clerk index -> crosswalk -> download -> parse -> band-count
-> `pipeline/output/financial_disclosures.json` + `_report.json`.

Usage:
    python build.py                      # full run, all current House members, 2013-CURRENT_YEAR
    python build.py --years 2024 2025    # restrict to specific reporting years (for testing)
    python build.py --last Pelosi Buchanan  # restrict to specific surnames (for testing)
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import zipfile
from pathlib import Path

import requests

import columns
import fetch
import match
import roster
from extract_text import extract_digital_text

OUT_DIR = Path(__file__).resolve().parents[1] / "output"
CURRENT_YEAR = 2026
START_YEAR = 2013


def _base_record(bioguide_id: str, year: int) -> dict:
    return {
        "bioguide_id": bioguide_id,
        "year": year,
        "chamber": "house",
        "assets_total": None,
        "liabilities_total": None,
        "net_worth": None,
        "has_open_ended_asset": None,
        "asset_line_count": None,
        "liability_line_count": None,
        "asset_band_counts": {},
        "liability_band_counts": {},
        "source_system": "house_clerk",
        "source_doc_id": None,
        "filing_type": None,
        "filing_date": None,
        "extraction_method": "digital_text",
        "parse_confidence": None,
        "needs_review": False,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=int, nargs="*", default=None)
    ap.add_argument("--last", type=str, nargs="*", default=None)
    args = ap.parse_args()

    years = args.years or list(range(START_YEAR, CURRENT_YEAR + 1))

    members = roster.load_current_house_members(min_year=START_YEAR)
    if args.last:
        wanted = {roster.norm(x) for x in args.last}
        members = [m for m in members if roster.norm(m.last) in wanted]
    index = roster.build_index(members)
    print(f"[build] {len(members)} current House members loaded", file=sys.stderr)

    session = requests.Session()

    # --- fetch + match index rows -------------------------------------
    matches: dict[tuple[str, int], list] = {}
    match_stats: dict[str, int] = {}
    unmatched_examples: list[dict] = []
    filing_type_counts: dict[str, int] = {}
    failed_years: list[dict] = []

    for year in years:
        try:
            rows = fetch.fetch_year_index(year, session)
        except (requests.RequestException, zipfile.BadZipFile) as e:
            # A transient network error or a malformed zip for one year must
            # not take down the whole run -- everything already fetched for
            # other years (and every PDF already downloaded/parsed) would be
            # lost, since output is only written once at the end of main().
            # Skip this year, but record it distinctly from a genuinely empty
            # year so the report doesn't silently read as "no filings" --
            # per the "fail loudly, never silently" convention, this must be
            # visible, just not fatal to the rest of the run.
            print(f"[build] ERROR fetching {year} index: {e} -- skipping this year", file=sys.stderr)
            failed_years.append({"year": year, "error": str(e)})
            continue
        print(f"[build] {year}: {len(rows)} index rows", file=sys.stderr)
        for row in rows:
            filing_type_counts[row.filing_type] = filing_type_counts.get(row.filing_type, 0) + 1
            if row.filing_type not in ("O", "A"):
                continue
            res = match.match_row(row, index)
            match_stats[res.reason] = match_stats.get(res.reason, 0) + 1
            if res.bioguide_id:
                matches.setdefault((res.bioguide_id, row.year), []).append(row)
            elif len(unmatched_examples) < 200:
                unmatched_examples.append(
                    {
                        "last": row.last,
                        "first": row.first,
                        "state_dst": row.state_dst,
                        "year": row.year,
                        "filing_type": row.filing_type,
                        "reason": res.reason,
                    }
                )

    # --- per member-year: parse or record gap --------------------------
    records: list[dict] = []
    counts = {
        "high": 0,
        "low": 0,
        "unparseable_scanned": 0,
        "no_filing_found": 0,
        "download_failed": 0,
        "no_value_data": 0,
    }
    needs_review_records: list[dict] = []
    docid_len_by_confidence: dict[str, list[int]] = {"scanned": [], "digital": []}

    total_member_years = sum(max(0, CURRENT_YEAR - m.first_year_served + 1) for m in members)
    processed = 0
    t0 = time.time()

    for member in members:
        for year in range(member.first_year_served, CURRENT_YEAR + 1):
            if year not in years:
                continue
            processed += 1
            if processed % 100 == 0:
                elapsed = time.time() - t0
                print(
                    f"[build] progress {processed}/{total_member_years} "
                    f"({elapsed:.0f}s elapsed)",
                    file=sys.stderr,
                )

            rows = matches.get((member.bioguide_id, year))
            rec = _base_record(member.bioguide_id, year)
            if not rows:
                rec["parse_confidence"] = "no_filing_found"
                records.append(rec)
                counts["no_filing_found"] += 1
                continue

            best = match.pick_best_filing(rows)
            rec["source_doc_id"] = best.doc_id
            rec["filing_type"] = best.filing_type
            rec["filing_date"] = best.filing_date

            pdf_path = fetch.download_pdf(year, best.doc_id, session)
            if pdf_path is None:
                rec["parse_confidence"] = "download_failed"
                rec["needs_review"] = True
                records.append(rec)
                counts["download_failed"] += 1
                needs_review_records.append(rec)
                continue

            try:
                doc = extract_digital_text(str(pdf_path))
            except Exception as e:  # malformed PDF, etc.
                rec["parse_confidence"] = "download_failed"
                rec["needs_review"] = True
                rec["extra_note"] = f"extract error: {e}"
                records.append(rec)
                counts["download_failed"] += 1
                needs_review_records.append(rec)
                continue

            if doc.is_scanned:
                rec["parse_confidence"] = "unparseable_scanned"
                rec["needs_review"] = True
                records.append(rec)
                counts["unparseable_scanned"] += 1
                needs_review_records.append(rec)
                docid_len_by_confidence["scanned"].append(len(best.doc_id))
                continue

            docid_len_by_confidence["digital"].append(len(best.doc_id))
            ext = columns.extract(doc)

            confidence = "high"
            if ext.asset_pages and ext.asset_header_found_pages < ext.asset_pages:
                confidence = "low"
            if ext.liability_pages and ext.liability_header_found_pages < ext.liability_pages:
                confidence = "low"
            no_value_data = (
                ext.asset_line_count == 0
                and ext.liability_line_count == 0
                and (ext.asset_pages > 0 or ext.liability_pages > 0)
            )
            if no_value_data:
                confidence = "low"

            rec["assets_total"] = round(ext.assets_total, 2)
            rec["liabilities_total"] = round(ext.liabilities_total, 2)
            rec["net_worth"] = round(ext.assets_total - ext.liabilities_total, 2)
            rec["has_open_ended_asset"] = ext.has_open_ended_asset
            rec["asset_line_count"] = ext.asset_line_count
            rec["liability_line_count"] = ext.liability_line_count
            rec["asset_band_counts"] = ext.asset_band_counts
            rec["liability_band_counts"] = ext.liability_band_counts
            rec["parse_confidence"] = confidence
            rec["needs_review"] = confidence == "low"
            records.append(rec)
            counts[confidence] += 1
            if no_value_data:
                counts["no_value_data"] += 1
            if confidence == "low":
                needs_review_records.append(rec)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "financial_disclosures.json").write_text(json.dumps(records, indent=2))

    report = {
        "run_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "phase": "1 (House, digital filings)",
        "member_count": len(members),
        "years": [min(years), max(years)],
        "total_member_years": len(records),
        "counts_by_parse_confidence": counts,
        "needs_review_count": len(needs_review_records),
        "match_stats": match_stats,
        "match_rate_pct": round(
            100.0
            * (match_stats.get("ok", 0) + match_stats.get("ok_disambiguated", 0))
            / max(1, sum(match_stats.values())),
            2,
        ),
        "filing_type_counts": filing_type_counts,
        "failed_years": failed_years,
        "unmatched_examples": unmatched_examples,
        "docid_length_by_scan_status": {
            "scanned_lengths": docid_len_by_confidence["scanned"],
            "digital_lengths": docid_len_by_confidence["digital"],
        },
    }
    (OUT_DIR / "financial_disclosures_report.json").write_text(json.dumps(report, indent=2))

    print("[build] DONE", file=sys.stderr)
    print(json.dumps(report["counts_by_parse_confidence"], indent=2), file=sys.stderr)
    print(f"match_rate_pct={report['match_rate_pct']}", file=sys.stderr)
    if failed_years:
        print(f"[build] WARNING: {len(failed_years)} year(s) failed to fetch and were skipped: "
              f"{[f['year'] for f in failed_years]} -- rerun to retry them", file=sys.stderr)


if __name__ == "__main__":
    main()
