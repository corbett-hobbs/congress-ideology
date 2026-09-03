"""Build ``pipeline/output/financial_disclosures.json`` for a set of House members.

Usage:
    python build.py --years 2023 2024 --sample        # 5-10 validation members
    python build.py --years 2023 2024 --last Pelosi McCaul ...

Pipeline: House Clerk ``<YEAR>FD.zip`` index -> pick each member's Annual Report
(FilingType "O") -> download the PDF into ``pipeline/raw/house-financial-disclosures/``
-> parse (parse_house) -> adapt to schema (adapter) -> write JSON + a run report.

This session is a *validation* run on a small sample. Scaling to all current
House members is a separate follow-up (see the session brief, item 8).
"""

from __future__ import annotations

import argparse
import io
import json
import sys
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

import adapter
import parse_house
from resolve import Resolver

_ROOT = Path(__file__).resolve().parents[1]
_RAW = _ROOT / "raw" / "house-financial-disclosures"
_OUT = _ROOT / "output"
_INDEX_URL = "https://disclosures-clerk.house.gov/public_disc/financial-pdfs/{year}FD.zip"
_PDF_URL = "https://disclosures-clerk.house.gov/public_disc/financial-pdfs/{year}/{doc}.pdf"

# The 5-10 current members used to validate the pipeline. Spans real estate /
# managed-account heavy filers, a small filer, and two known paper filers.
SAMPLE_LAST = ["Pelosi", "Crenshaw", "Newhouse", "Buchanan", "Wagner",
               "Fitzpatrick", "McCaul", "Khanna"]

_UA = {"User-Agent": "congress-ideology-pipeline/1.0 (+https://github.com/corbett-hobbs/congress-ideology)"}


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers=_UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def load_index(year: int) -> list[dict]:
    cache = _RAW / f"{year}FD.xml"
    if not cache.exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        zf = zipfile.ZipFile(io.BytesIO(_get(_INDEX_URL.format(year=year))))
        cache.write_bytes(zf.read(f"{year}FD.xml"))
    root = ET.fromstring(cache.read_text(encoding="utf-8-sig"))
    rows = []
    for m in root.findall("Member"):
        rows.append({c.tag: (c.text or "").strip() for c in m})
    return rows


def annual_filing(index: list[dict], last: str) -> dict | None:
    hits = [r for r in index
            if r["Last"].lower() == last.lower() and r["FilingType"] == "O"]
    # Prefer the highest DocID (latest-processed) if a member filed twice.
    return max(hits, key=lambda r: int(r["DocID"])) if hits else None


def fetch_pdf(year: int, doc_id: str) -> Path:
    path = _RAW / f"{year}_{doc_id}.pdf"
    if not path.exists():
        path.write_bytes(_get(_PDF_URL.format(year=year, doc=doc_id)))
    return path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=int, nargs="+", required=True)
    ap.add_argument("--last", nargs="*", help="member surnames (index 'Last' field)")
    ap.add_argument("--sample", action="store_true", help=f"use {SAMPLE_LAST}")
    ap.add_argument("--out", default=str(_OUT / "financial_disclosures.json"))
    args = ap.parse_args()

    surnames = args.last or (SAMPLE_LAST if args.sample else None)
    if not surnames:
        ap.error("pass --last <names...> or --sample")

    resolver = Resolver()
    rows: list[dict] = []
    report: list[dict] = []

    for year in args.years:
        index = load_index(year)
        for last in surnames:
            rec = annual_filing(index, last)
            if not rec:
                report.append({"year": year, "last": last, "status": "no annual filing in index"})
                continue
            bioguide, why = resolver.resolve(rec["Last"], rec["StateDst"])
            if not bioguide:
                report.append({"year": year, "last": last, "status": f"unresolved: {why}",
                               "doc_id": rec["DocID"]})
                continue
            pdf = fetch_pdf(year, rec["DocID"])
            src_url = _PDF_URL.format(year=year, doc=rec["DocID"])
            parsed = parse_house.parse(str(pdf))
            row = adapter.adapt(parsed, bioguide_id=bioguide, year=year,
                                doc_id=rec["DocID"], source_url=src_url,
                                index_filing_type=rec["FilingType"])
            rows.append(row)
            nw = row["net_worth_estimate"]
            report.append({
                "year": year, "last": last, "bioguide_id": bioguide,
                "resolve": why,
                "confidence": row["parse_confidence"],
                "needs_review": row["needs_review"],
                "net_worth_midpoint": nw["midpoint"] if nw else None,
                "n_assets": row["totals"]["n_assets"],
                "n_assets_valued": row["totals"]["n_assets_valued"],
                "review_notes": row["review_notes"],
            })

    rows.sort(key=lambda r: (r["bioguide_id"], r["year"]))
    Path(args.out).write_text(
        "[\n" + ",\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n]\n")
    (_OUT / "financial_disclosures_report.json").write_text(
        json.dumps({"congress": resolver.congress, "years": args.years,
                    "n_rows": len(rows), "runs": report}, indent=2, ensure_ascii=False))

    print(f"wrote {len(rows)} rows -> {args.out}")
    for r in report:
        print(json.dumps(r, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
