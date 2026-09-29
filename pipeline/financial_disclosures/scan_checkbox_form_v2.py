"""More robust checkbox-grid-form detector than v1 (which searched only the
first 3 pages for specific boilerplate example text and badly undercounted --
confirmed by manual sampling: every one of 6 "non-checkbox" hits it produced
turned out to visually be the same checkbox form on inspection).

v2 signal: the checkbox form prints ALL ten EIGA band boundaries together as
a header row/column (e.g. "$1,001-$15,000", "$15,001-$50,000", ... "Over
$50,000,000" all visible on one page, as column labels), never mind whether
any row is actually marked. The standard electronic form never does this --
it prints exactly one chosen range as text per data row, not the whole
band list as a header. So: strip a page's OCR'd text to digits only and
check how many of the ten band-boundary numbers appear as substrings. A
handful of hits could be coincidence; matching most/all ten in one page is
not.

Scans EVERY page of the document (not just the first 3), since a doc's
Schedule A can appear on any page and some filings put Schedule A after
several other schedules.
"""
import json
import re
import sys
import os
from concurrent.futures import ProcessPoolExecutor, as_completed

import fetch
import requests
from pdf2image import convert_from_path, pdfinfo_from_path
import pytesseract

BAND_DIGITS = [
    "1001", "15000", "50001", "100000", "250001", "500000",
    "1000001", "5000000", "25000001", "50000000",
]

# best_hits at or above this is treated as "this is the checkbox-grid form"
# (see module docstring: matching most/all ten band boundaries as a header
# isn't coincidence). Exposed as a constant so other callers (build_ocr.py's
# retry logic) use the exact same cutoff rather than a second hardcoded "8".
CHECKBOX_HIT_THRESHOLD = 8

# Non-zero right-angle rotations tried in `checkbox_form_hits()`'s fallback
# pass -- see that function's docstring for why this is a second pass, not
# baked into the main loop.
_ROTATION_RETRY_ANGLES = (90, 180, 270)


def _worker_init():
    os.environ["OMP_THREAD_LIMIT"] = "1"


def _digit_hits(image, band_digits: list[str] = BAND_DIGITS) -> int:
    text = pytesseract.image_to_string(image)
    digits = re.sub(r"[^0-9]", "", text)
    return sum(1 for d in band_digits if d in digits)


def checkbox_form_hits(pdf_path: str, dpi: int = 200) -> int:
    """Highest per-page count (0-10) of EIGA band-boundary digit strings
    found as a page header -- see module docstring for the detection
    signal. Scans every page, stopping early once CHECKBOX_HIT_THRESHOLD is
    reached. Importable so build_ocr.py can check a single document live
    (not just via the batch `main()` below / its cached results file, which
    is a frozen snapshot and won't cover a document from a future run).

    If no page clears the threshold at its raw (0-degree) orientation, retries
    every page at the other three right-angle rotations before giving up --
    confirmed live (2026-09-27 session) that a genuine checkbox-grid page can
    be scanned rotated 90 degrees, which a plain OCR pass at 0 degrees reads
    as near-garbage (a real case scored 0/10 unrotated, 1/10 upright -- still
    short of the threshold on its own, but this is a real, verified detection
    gap, not a hypothetical one). This second pass only runs when the first
    one found nothing promising, so it adds no cost to the common case where
    a document's checkbox pages are already scored correctly at 0 degrees."""
    pc = pdfinfo_from_path(str(pdf_path)).get("Pages", 0)
    best_hits = 0
    for pg in range(1, pc + 1):
        img = convert_from_path(str(pdf_path), dpi=dpi, first_page=pg, last_page=pg)[0]
        best_hits = max(best_hits, _digit_hits(img))
        if best_hits >= CHECKBOX_HIT_THRESHOLD:
            return best_hits
    for pg in range(1, pc + 1):
        img = convert_from_path(str(pdf_path), dpi=dpi, first_page=pg, last_page=pg)[0]
        for angle in _ROTATION_RETRY_ANGLES:
            best_hits = max(best_hits, _digit_hits(img.rotate(angle, expand=True)))
            if best_hits >= CHECKBOX_HIT_THRESHOLD:
                return best_hits
    return best_hits


def checkbox_form_pages(pdf_path: str, band_digits: list[str] = BAND_DIGITS, dpi: int = 200) -> list[int]:
    """Every page number (1-indexed) whose header clears
    `CHECKBOX_HIT_THRESHOLD` against `band_digits` -- a generalization of
    `checkbox_form_hits()` for callers that need to know WHICH page(s), not
    just whether one exists (a filer's Schedule A content can span several
    pages). Unlike that function, does not stop early. Kept separate from
    `checkbox_form_hits()` rather than replacing it, since that function's
    existing callers only need the boolean/count and benefit from its
    early stop.

    `band_digits` defaults to `BAND_DIGITS` (Assets); do NOT pass an
    analogous "Liabilities" digit list here -- tried and rejected this
    session. Liabilities' tier boundaries share 9 of 10 digit strings with
    Assets' (both built from bands.py's same `_COMMON_TIERS`), and on an
    actual checkbox-grid page -- already dense with digits from its OWN
    13-row tier table, plus Block C/D's separate tier tables, dates, and ID
    numbers -- confirmed live that even the 10th ("10001") shows up as a
    coincidental substring of unrelated concatenated digits, so a genuine
    Assets page trivially also clears the Liabilities threshold. The
    digit-header signal only works to distinguish "checkbox-grid form" from
    "ordinary typed page" (comparatively digit-sparse), not "Assets" from
    "Liabilities" once already on a checkbox-grid page -- use
    `find_page_titled()` for that instead."""
    pc = pdfinfo_from_path(str(pdf_path)).get("Pages", 0)
    pages: list[int] = []
    for pg in range(1, pc + 1):
        img = convert_from_path(str(pdf_path), dpi=dpi, first_page=pg, last_page=pg)[0]
        text = pytesseract.image_to_string(img)
        digits = re.sub(r"[^0-9]", "", text)
        hits = sum(1 for d in band_digits if d in digits)
        if hits >= CHECKBOX_HIT_THRESHOLD:
            pages.append(pg)
    return pages


def find_page_titled(pdf_path: str, title_pattern: str, dpi: int = 100) -> list[int]:
    """Every page number (1-indexed) whose OCR'd text contains
    `title_pattern` (case-insensitive regex) -- used to check whether a
    schedule exists in this document AT ALL, regardless of format (typed or
    checkbox-grid). Runs at a low DPI (100, not the 200 checkbox_grid.py
    needs for its own geometry work) since only a big, bold section title
    needs to be legible here, not fine print -- confirmed live this reads
    "SCHEDULE D - LIABILITIES" and similar titles reliably and fast (this
    is the same technique used to hand-locate every Liabilities validation
    page this session, just packaged as a reusable function)."""
    pc = pdfinfo_from_path(str(pdf_path)).get("Pages", 0)
    pattern = re.compile(title_pattern, re.IGNORECASE)
    pages: list[int] = []
    for pg in range(1, pc + 1):
        img = convert_from_path(str(pdf_path), dpi=dpi, first_page=pg, last_page=pg)[0]
        text = pytesseract.image_to_string(img)
        if pattern.search(text):
            pages.append(pg)
    return pages


def _scan_doc(args):
    bg, year, doc_id = args
    try:
        session = requests.Session()
        path = fetch.download_pdf(year, doc_id, session)
        pc = pdfinfo_from_path(str(path)).get("Pages", 0)
        best_hits = checkbox_form_hits(str(path))
        return (bg, year, doc_id, best_hits, pc)
    except Exception as e:
        return (bg, year, doc_id, f"ERROR: {e}", None)


def main():
    recs = json.loads(open("../output/financial_disclosures.json").read())
    targets = [
        (r["bioguide_id"], r["year"], r["source_doc_id"])
        for r in recs
        if r["parse_confidence"] in ("unparseable_scanned", "ocr_low_confidence")
    ]
    print(f"{len(targets)} rows to scan", file=sys.stderr)

    results = []
    with ProcessPoolExecutor(max_workers=6, initializer=_worker_init) as pool:
        futures = {pool.submit(_scan_doc, t): t for t in targets}
        for n, fut in enumerate(as_completed(futures), 1):
            results.append(fut.result())
            if n % 20 == 0:
                print(f"{n}/{len(targets)} scanned", file=sys.stderr)

    json.dump(results, open("checkbox_scan_v2_results.json", "w"))
    checkbox_count = sum(1 for r in results if isinstance(r[3], int) and r[3] >= CHECKBOX_HIT_THRESHOLD)
    errors = sum(1 for r in results if isinstance(r[3], str))
    print(f"DONE: {checkbox_count}/{len(results)} rows show checkbox-form band-header signature (errors: {errors})", file=sys.stderr)


if __name__ == "__main__":
    main()
