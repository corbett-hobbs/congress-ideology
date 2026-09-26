"""Orchestrator: Clerk index -> crosswalk -> download -> parse -> band-count
-> `pipeline/output/financial_disclosures.json` + `_report.json`.

Usage:
    python build.py                      # full run, all current House members, 2013-CURRENT_YEAR
    python build.py --years 2024 2025    # restrict to specific reporting years (for testing)
    python build.py --last Pelosi Buchanan  # restrict to specific surnames (for testing)
    python build.py --bioguide A000055 B001257  # restrict to specific members (for a targeted re-apply)
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
from schema import validate_record

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
    ap.add_argument("--bioguide", type=str, nargs="*", default=None, help="restrict to specific bioguide_ids (for a targeted re-apply, e.g. after a match.py fix, without reprocessing the whole roster)")
    args = ap.parse_args()

    years = args.years or list(range(START_YEAR, CURRENT_YEAR + 1))

    members = roster.load_current_house_members(min_year=START_YEAR)
    if args.last:
        wanted = {roster.norm(x) for x in args.last}
        members = [m for m in members if roster.norm(m.last) in wanted]
    if args.bioguide:
        wanted_bg = set(args.bioguide)
        members = [m for m in members if m.bioguide_id in wanted_bg]
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
        "no_schedule_content_found": 0,
    }
    needs_review_records: list[dict] = []
    docid_len_by_confidence: dict[str, list[int]] = {"scanned": [], "digital": []}

    total_member_years = sum(max(0, CURRENT_YEAR - m.first_year_served + 1) for m in members)
    processed = 0
    t0 = time.time()
    years_set = set(years)  # O(1) membership; `years` can be ~3600 x 14 lookups otherwise

    for member in members:
        for year in range(member.first_year_served, CURRENT_YEAR + 1):
            if year not in years_set:
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

            # Try each candidate, best-dated first, verifying content rather
            # than trusting the Clerk's filing_type code alone -- see
            # match.rank_filings()'s docstring for why that code can be
            # misleading (a PTR amendment carries the same 'A' as an
            # amendment to the real annual report). A digitally-readable
            # candidate with no Schedule A/D content is confirmed wrong for
            # free and skipped in favor of the next one; a scanned candidate
            # can't be verified without OCR, so it's accepted as-is and
            # deferred to build_ocr.py's Phase 2 pass, exactly as before --
            # looking past a scanned top candidate here would risk skipping
            # a legitimately scanned current-year report for an
            # easier-to-read older one, which this fix must not do.
            candidates = match.rank_filings(rows)
            checked_any = False
            tried_doc_ids: list[str] = []
            resolved = False

            for candidate in candidates:
                pdf_path = fetch.download_pdf(year, candidate.doc_id, session)
                if pdf_path is None:
                    tried_doc_ids.append(f"{candidate.doc_id}(download_failed)")
                    continue

                try:
                    doc = extract_digital_text(str(pdf_path))
                except Exception as e:  # malformed PDF, etc.
                    tried_doc_ids.append(f"{candidate.doc_id}(extract_error: {e})")
                    continue

                checked_any = True

                if doc.is_scanned:
                    rec["source_doc_id"] = candidate.doc_id
                    rec["filing_type"] = candidate.filing_type
                    rec["filing_date"] = candidate.filing_date
                    rec["parse_confidence"] = "unparseable_scanned"
                    rec["needs_review"] = True
                    records.append(rec)
                    counts["unparseable_scanned"] += 1
                    needs_review_records.append(rec)
                    docid_len_by_confidence["scanned"].append(len(candidate.doc_id))
                    resolved = True
                    break

                ext = columns.extract(doc)
                tried_doc_ids.append(candidate.doc_id)

                if not columns.has_schedule_content(ext):
                    # Confirmed wrong document, no OCR needed to know it --
                    # try the next-best candidate instead of giving up.
                    continue

                docid_len_by_confidence["digital"].append(len(candidate.doc_id))
                rec["source_doc_id"] = candidate.doc_id
                rec["filing_type"] = candidate.filing_type
                rec["filing_date"] = candidate.filing_date
                confidence = columns.apply_extraction(rec, ext)
                records.append(rec)
                counts[confidence] += 1
                no_value_data = ext.asset_line_count == 0 and ext.liability_line_count == 0
                if no_value_data:
                    counts["no_value_data"] += 1
                if confidence == "low":
                    needs_review_records.append(rec)
                resolved = True
                break

            if resolved:
                continue

            # Every candidate tried, none scanned (that breaks out above)
            # and none had real content -- either genuinely confirmed empty
            # (checked_any) or every candidate failed to download/extract.
            rec["source_doc_id"] = candidates[-1].doc_id
            rec["filing_type"] = candidates[-1].filing_type
            rec["filing_date"] = candidates[-1].filing_date
            rec["needs_review"] = True
            if checked_any:
                rec["parse_confidence"] = "no_schedule_content_found"
                rec["extra_note"] = f"checked {len(candidates)} candidate filing(s), none contain Schedule A/D content: {tried_doc_ids}"
                counts["no_schedule_content_found"] += 1
            else:
                rec["parse_confidence"] = "download_failed"
                rec["extra_note"] = f"all {len(candidates)} candidate filing(s) failed to download/extract: {tried_doc_ids}"
                counts["download_failed"] += 1
            records.append(rec)
            needs_review_records.append(rec)

    # Merge into the existing output file rather than overwriting it --
    # required as soon as any other chamber/scope's rows can live in the
    # same file (Senate's, since Phase 3a; also any House member-year this
    # run's own --bioguide/--last/--years filters excluded). Only ever
    # replace the exact (bioguide_id, year) keys this run actually
    # recomputed, mirroring build_ocr.py's/build_senate_html.py's existing
    # merge convention -- an unrestricted full run recomputes every current
    # House member-year, so `kept` naturally reduces to just Senate's rows
    # in that case, with nothing lost.
    data_path = OUT_DIR / "financial_disclosures.json"
    existing: list[dict] = json.loads(data_path.read_text()) if data_path.exists() else []
    recomputed_keys = {(r["bioguide_id"], r["year"]) for r in records}
    kept = [
        r for r in existing
        if r.get("chamber") != "house" or (r["bioguide_id"], r["year"]) not in recomputed_keys
    ]
    combined = kept + records

    # docs/DATA_CONVENTIONS.md §2: every pipeline/output/*.json row is
    # validated against its schema before writing (§4 "fail loudly, never
    # silently"), and the file is a JSON array with one row per line so a
    # data-only update shows as a line-level git diff, not a reformatted
    # blob -- matches pipeline/transform/io.ts's writeEntities() convention.
    for i, rec in enumerate(combined):
        validate_record(rec, i)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    lines = [json.dumps(rec, separators=(",", ":")) for rec in combined]
    body = "[\n" + ",\n".join(lines) + "\n]\n" if lines else "[]\n"
    data_path.write_text(body)

    # A --bioguide/--last/--years-scoped run's own match_stats/match_rate_pct/
    # etc. describe only that filtered slice, not the whole House pass -- if
    # this isn't an unrestricted full run, those numbers would be a
    # misleading headline if written to the report's top level (e.g. a
    # 6-member targeted rerun's "match_rate_pct" replacing the real
    # multi-thousand-row figure), and would silently destroy Senate's
    # `senate_html_pass` section by overwriting the whole file. Only an
    # unrestricted full run replaces the top-level report; a scoped run
    # preserves everything else and records its own numbers in a small
    # sub-section instead, mirroring build_ocr.py's `ocr_pass` convention.
    is_full_run = args.bioguide is None and args.last is None and args.years is None
    report_path = OUT_DIR / "financial_disclosures_report.json"
    existing_report = json.loads(report_path.read_text()) if report_path.exists() else {}

    run_stats = {
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

    report = dict(run_stats) if is_full_run else dict(existing_report)
    if not is_full_run:
        report["last_targeted_rerun"] = run_stats

    # counts_by_parse_confidence/needs_review_count always reflect the
    # current state of the whole merged file (every chamber), since even a
    # scoped run genuinely changed the underlying data -- matches
    # build_ocr.py's/build_senate_html.py's own convention.
    global_counts: dict[str, int] = {}
    for r in combined:
        global_counts[r["parse_confidence"]] = global_counts.get(r["parse_confidence"], 0) + 1
    report["counts_by_parse_confidence"] = global_counts
    report["needs_review_count"] = sum(1 for r in combined if r["needs_review"])

    report_path.write_text(json.dumps(report, indent=2))

    print("[build] DONE", file=sys.stderr)
    print(json.dumps(report["counts_by_parse_confidence"], indent=2), file=sys.stderr)
    print(f"match_rate_pct={report['match_rate_pct']}", file=sys.stderr)
    if failed_years:
        print(f"[build] WARNING: {len(failed_years)} year(s) failed to fetch and were skipped: "
              f"{[f['year'] for f in failed_years]} -- rerun to retry them", file=sys.stderr)


if __name__ == "__main__":
    main()
