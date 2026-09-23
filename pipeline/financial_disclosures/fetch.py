"""Fetch the House Clerk bulk filer index + individual filing PDFs.

Confirmed empirically (per the session prompt's own "confirm this
empirically" instruction) that the index format is NOT uniform across years:
most years' `<YEAR>FD.zip` contain a tab-delimited `<YEAR>FD.txt` as the
session prompt assumed, but 2023 and 2024 contain `<YEAR>FD.xml` (an XML
`<FinancialDisclosure><Member>...` list) instead. Same fields either way
(Prefix/Last/First/Suffix/FilingType/StateDst/Year/FilingDate/DocID); this
module auto-detects and parses whichever format is present.
"""

from __future__ import annotations

import csv
import io
import time
import zipfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from xml.etree import ElementTree as ET

import requests

RAW_DIR = Path(__file__).resolve().parents[1] / "raw" / "house-financial-disclosures"
INDEX_URL = "https://disclosures-clerk.house.gov/public_disc/financial-pdfs/{year}FD.zip"
PDF_URL = "https://disclosures-clerk.house.gov/public_disc/financial-pdfs/{year}/{doc_id}.pdf"

HEADERS = {
    "User-Agent": "congress-ideology-research/1.0 (+https://github.com/; contact: corby.hobbs@gmail.com)"
}

DOWNLOAD_DELAY_SEC = 0.4  # polite delay between PDF downloads


@dataclass
class FilingRow:
    prefix: str
    last: str
    first: str
    suffix: str
    filing_type: str
    state_dst: str
    year: int
    filing_date: str  # normalized to YYYY-MM-DD
    doc_id: str


def _normalize_date(raw: str) -> str:
    raw = (raw or "").strip()
    if not raw:
        return ""
    try:
        m, d, y = raw.split("/")
        return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
    except ValueError:
        return raw


def _parse_xml_index(raw_text: str, year: int) -> list[FilingRow]:
    root = ET.fromstring(raw_text)
    rows: list[FilingRow] = []
    for m in root.findall("Member"):
        def g(tag: str) -> str:
            el = m.find(tag)
            return (el.text or "").strip() if el is not None and el.text else ""

        rows.append(
            FilingRow(
                prefix=g("Prefix"),
                last=g("Last"),
                first=g("First"),
                suffix=g("Suffix"),
                filing_type=g("FilingType"),
                state_dst=g("StateDst"),
                year=int(g("Year") or year),
                filing_date=_normalize_date(g("FilingDate")),
                doc_id=g("DocID"),
            )
        )
    return rows


def _parse_tsv_index(raw_text: str, year: int) -> list[FilingRow]:
    reader = csv.DictReader(io.StringIO(raw_text), delimiter="\t")
    rows: list[FilingRow] = []
    for r in reader:
        if not r.get("Last"):
            continue
        rows.append(
            FilingRow(
                prefix=(r.get("Prefix") or "").strip(),
                last=(r.get("Last") or "").strip(),
                first=(r.get("First") or "").strip(),
                suffix=(r.get("Suffix") or "").strip(),
                filing_type=(r.get("FilingType") or "").strip(),
                state_dst=(r.get("StateDst") or "").strip(),
                year=int((r.get("Year") or "").strip() or year),
                filing_date=_normalize_date(r.get("FilingDate") or ""),
                doc_id=(r.get("DocID") or "").strip(),
            )
        )
    return rows


def fetch_year_index(year: int, session: requests.Session) -> list[FilingRow]:
    """Download (or reuse cached) `<year>FD.zip`, return parsed filing rows.

    Index format is not uniform across years -- most years ship a
    tab-delimited `.txt`, but 2023/2024 ship an XML `.xml` (see module
    docstring). Cache the raw bytes under the format-agnostic name
    `<year>FD.raw` and detect format from content, not extension, so a stale
    cache from an earlier (buggy) run can't wedge parsing.
    """
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = RAW_DIR / f"{year}FD.raw"
    legacy_xml = RAW_DIR / f"{year}FD.xml"  # earlier cache name; reuse if present
    if not cache_path.exists() and legacy_xml.exists():
        cache_path.write_bytes(legacy_xml.read_bytes())

    if not cache_path.exists():
        url = INDEX_URL.format(year=year)
        resp = session.get(url, headers=HEADERS, timeout=60)
        if resp.status_code == 404:
            return []
        resp.raise_for_status()
        with zipfile.ZipFile(BytesIO(resp.content)) as zf:
            names = [n for n in zf.namelist() if n.lower().endswith((".xml", ".txt"))]
            if not names:
                return []
            data = zf.read(names[0])
        cache_path.write_bytes(data)
        time.sleep(DOWNLOAD_DELAY_SEC)

    raw = cache_path.read_bytes()
    text = raw.decode("utf-8-sig", errors="replace").lstrip("﻿ \r\n\t")
    if text.startswith("<"):
        return _parse_xml_index(text, year)
    return _parse_tsv_index(text, year)


def pdf_cache_path(year: int, doc_id: str) -> Path:
    d = RAW_DIR / str(year)
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{doc_id}.pdf"


def download_pdf(year: int, doc_id: str, session: requests.Session) -> Path | None:
    """Download (or reuse cached) filing PDF. Returns None on a hard failure."""
    path = pdf_cache_path(year, doc_id)
    if path.exists() and path.stat().st_size > 0:
        return path
    url = PDF_URL.format(year=year, doc_id=doc_id)
    try:
        resp = session.get(url, headers=HEADERS, timeout=60)
        if resp.status_code != 200 or not resp.content:
            return None
        path.write_bytes(resp.content)
        time.sleep(DOWNLOAD_DELAY_SEC)
        return path
    except requests.RequestException:
        return None
