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


def _worker_init():
    os.environ["OMP_THREAD_LIMIT"] = "1"


def checkbox_form_hits(pdf_path: str, dpi: int = 200) -> int:
    """Highest per-page count (0-10) of EIGA band-boundary digit strings
    found as a page header -- see module docstring for the detection
    signal. Scans every page, stopping early once CHECKBOX_HIT_THRESHOLD is
    reached. Importable so build_ocr.py can check a single document live
    (not just via the batch `main()` below / its cached results file, which
    is a frozen snapshot and won't cover a document from a future run)."""
    pc = pdfinfo_from_path(str(pdf_path)).get("Pages", 0)
    best_hits = 0
    for pg in range(1, pc + 1):
        img = convert_from_path(str(pdf_path), dpi=dpi, first_page=pg, last_page=pg)[0]
        text = pytesseract.image_to_string(img)
        digits = re.sub(r"[^0-9]", "", text)
        hits = sum(1 for d in BAND_DIGITS if d in digits)
        best_hits = max(best_hits, hits)
        if best_hits >= CHECKBOX_HIT_THRESHOLD:
            break
    return best_hits


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
