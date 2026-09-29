"""Orchestrator: `financial_disclosures.json` -> per-item extraction (Session 5)
-> sharded `pipeline/output/line-items/<year>.json` + a run summary.

Sibling to `build.py`/`build_senate_html.py`, one level down in grain. Reads
the already-trusted `asset_band_counts`/`liability_band_counts` for each
usable row and only emits line items for a filing whose freshly extracted
item bands *exactly* reconcile against those counts (the safety net
`house_line_items.py`/`senate_line_items.py` are built around -- see their
own docstrings). A filing that doesn't reconcile is excluded entirely, never
partially emitted, and counted under its own reason in the run summary --
"fail loudly, never silently" (`docs/DATA_CONVENTIONS.md` §4).

Only high-confidence, non-scanned, digital-text filings are considered --
scanned/paper filings and OCR are out of scope for this extraction (unlike
`financial_disclosures.json`, which does cover them at band-count grain via
`build_ocr.py`/`checkbox_grid.py`).

Usage:
    python build_line_items.py                 # full run, all usable rows
    python build_line_items.py --years 2024 2025
    python build_line_items.py --bioguide A000055 B001257
    python build_line_items.py --no-fetch       # skip downloading missing
                                                 # House PDFs; only use what's
                                                 # already cached locally
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

import requests

import extract_text as et
import fetch
import house_line_items as hli
import senate_line_items as sli
from line_item_schema import validate_record

OUT_DIR = Path(__file__).resolve().parents[1] / "output" / "line-items"
DISCLOSURES_PATH = Path(__file__).resolve().parents[1] / "output" / "financial_disclosures.json"
HOUSE_RAW_DIR = Path(__file__).resolve().parents[1] / "raw" / "house-financial-disclosures"
SENATE_RAW_DIR = Path(__file__).resolve().parents[1] / "raw" / "senate-financial-disclosures" / "annual"

MIN_YEAR = 2013
MAX_YEAR = 2025


def _usable(row: dict) -> bool:
    return (
        row["parse_confidence"] == "high"
        and not row["needs_review"]
        and row["extraction_method"] == "digital_text"
        and MIN_YEAR <= row["year"] <= MAX_YEAR
    )


def _find_house_pdf(year: int, doc_id: str, session: requests.Session, allow_fetch: bool) -> Path | None:
    # The row's own `year` is the reporting year, which doesn't always match
    # the folder an amendment's PDF was cached under during build.py's own
    # run -- check every year folder before deciding a fresh download is
    # needed (fetch.download_pdf would otherwise re-download a file that's
    # already sitting under a different year's folder).
    if HOUSE_RAW_DIR.is_dir():
        for d in HOUSE_RAW_DIR.iterdir():
            if not d.is_dir():
                continue
            candidate = d / f"{doc_id}.pdf"
            if candidate.exists() and candidate.stat().st_size > 0:
                return candidate
    if not allow_fetch:
        return None
    return fetch.download_pdf(year, doc_id, session)


def _build_house_items(row: dict, path: Path) -> tuple[list | None, str | None, int]:
    doc = et.extract_digital_text(str(path))
    if doc.is_scanned:
        return None, "scanned", 0
    a = hli.extract_assets(doc)
    l = hli.extract_liabilities(doc)
    a_counts = a.band_counts if a else {}
    l_counts = l.band_counts if l else {}
    if a_counts != row["asset_band_counts"] or l_counts != row["liability_band_counts"]:
        return None, "no_reconcile", 0
    items = (a.items if a else []) + (l.items if l else [])
    trimmed = (a.trimmed_count if a else 0) + (l.trimmed_count if l else 0)
    return items, None, trimmed


def _build_senate_items(row: dict, path: Path) -> tuple[list | None, str | None, int]:
    html = path.read_text(encoding="utf-8", errors="replace")
    a, l = sli.extract(html)
    if not a.ok or not l.ok:
        return None, "extract_error", 0
    if a.band_counts != row["asset_band_counts"] or l.band_counts != row["liability_band_counts"]:
        return None, "no_reconcile", 0
    return a.items + l.items, None, 0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=int, nargs="*", default=None)
    ap.add_argument("--bioguide", type=str, nargs="*", default=None)
    ap.add_argument("--no-fetch", action="store_true", help="don't download missing House PDFs, only use the local cache")
    args = ap.parse_args()

    rows = json.loads(DISCLOSURES_PATH.read_text())
    usable = [r for r in rows if _usable(r)]
    if args.years:
        wanted_years = set(args.years)
        usable = [r for r in usable if r["year"] in wanted_years]
    if args.bioguide:
        wanted_bg = set(args.bioguide)
        usable = [r for r in usable if r["bioguide_id"] in wanted_bg]

    session = requests.Session()

    by_year: dict[int, list[dict]] = defaultdict(list)
    excluded: dict[str, int] = defaultdict(int)
    item_count = 0
    trimmed_total = 0

    t0 = time.time()
    for i, row in enumerate(usable):
        if i and i % 200 == 0:
            elapsed = time.time() - t0
            print(f"[build_line_items] {i}/{len(usable)} ({elapsed:.0f}s elapsed)", file=sys.stderr)

        if row["source_system"] == "house_clerk":
            path = _find_house_pdf(row["year"], row["source_doc_id"], session, not args.no_fetch)
            if path is None:
                excluded["not_cached" if args.no_fetch else "download_failed"] += 1
                continue
            items, reason, trimmed = _build_house_items(row, path)
        else:
            path = SENATE_RAW_DIR / f"{row['source_doc_id']}.html"
            if not path.exists():
                excluded["not_cached"] += 1
                continue
            items, reason, trimmed = _build_senate_items(row, path)

        if reason:
            excluded[reason] += 1
            continue

        rec = {
            "bioguide_id": row["bioguide_id"],
            "year": row["year"],
            "chamber": row["chamber"],
            "source_system": row["source_system"],
            "source_doc_id": row["source_doc_id"],
            "items": [
                {
                    "kind": it.kind,
                    "description": it.description,
                    "band_label": it.band_label,
                    "lo": it.lo,
                    "hi": it.hi,
                    "owner": it.owner,
                    "form_type": it.form_type,
                }
                for it in items
            ],
        }
        validate_record(rec, i)
        by_year[row["year"]].append(rec)
        item_count += len(items)
        trimmed_total += trimmed

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for year, recs in by_year.items():
        recs.sort(key=lambda r: (r["bioguide_id"], r["source_doc_id"] or ""))
        lines = [json.dumps(r, separators=(",", ":")) for r in recs]
        body = "[\n" + ",\n".join(lines) + "\n]\n" if lines else "[]\n"
        (OUT_DIR / f"{year}.json").write_text(body)

    emitted = sum(len(recs) for recs in by_year.values())
    summary = {
        "run_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "usable_rows": len(usable),
        "emitted": emitted,
        "excluded": dict(excluded),
        "item_count": item_count,
        "trimmed_descriptions": trimmed_total,
        "shards": {str(y): len(recs) for y, recs in sorted(by_year.items())},
    }
    (OUT_DIR / "_report.json").write_text(json.dumps(summary, indent=2))

    print("[build_line_items] DONE", file=sys.stderr)
    print(json.dumps(summary, indent=2), file=sys.stderr)


if __name__ == "__main__":
    main()
