"""Column-position extraction + literal band counting.

Per the architecture doc, this step takes plain text/word geometry in and
knows nothing about where it came from (digital text layer today, OCR in
Phase 2). It does NOT cluster words into visual "logical rows" the way the
prior `pipeline/financial/parse_house.py` did -- that flattened-line approach
is the documented source of "low confidence on managed-account-heavy
filings". Instead: per page, locate the schedule's own header words, derive
that page's column x-range from their actual position (never a hardcoded
pixel range), pull only the value-shaped tokens inside that x-range, and
count literal EIGA band strings in the joined text.

Per §3 of the session prompt, a page can match more than one section's
literal-phrase test (a "mixed page") -- we still extract from it, but only
from the x-range belonging to the section whose header we found on *that*
page, which keeps Schedule B's transaction "Amount" column (a different
x-position) from contaminating Schedule A's "Value of Asset" column.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from bands import ASSET_BANDS, LIABILITY_BANDS, count_bands, value_total
from extract_text import DocWords, PageWords, Word

_TOP_TOL = 3.5  # same-line tolerance, in points
_WRAP_TOL = 20.0  # wrapped-header (two-line) tolerance

# Literal page-classification phrases, per session prompt §3.
_HAS_ASSET_HDR = "Value of Asset"
_HAS_LIAB_PHRASES = ("Amount of", "Liability")
_HAS_TXN_PHRASES = ("Cap.", "Gains")
_HAS_POSITIONS_PHRASES = ("Position", "Name of Organization")

# Value-shaped tokens: dollar amounts, the hyphen in a range, "Over", and bare
# trailing numbers from a wrapped high bound. Exactly the pattern given in the
# session prompt. Case-insensitive: see the case-folding note below.
_VALUE_TOKEN_RE = re.compile(r"^\$|^-$|^Over$|^\d[\d,]*$", re.IGNORECASE)

# Some vintages of the Clerk's PDF generator (confirmed on 2013-2020 filings,
# e.g. Darrell Issa's 2013 filing) embed a font whose cmap flips the case of
# specific letters (b<->B, d<->D, s<->S, l<->L, ...) inconsistently per
# extracted glyph -- "Schedule" comes out "ScheDule", "Liabilities" comes out
# "liaBilitieS", "value of asset" comes out fully lowercase. This has nothing
# to do with the document's real content, so every header/phrase comparison
# below folds case rather than trusting the extracted casing.


def _line(words: list[Word], ref: Word, tol: float = _TOP_TOL) -> list[Word]:
    return [w for w in words if abs(w.top - ref.top) <= tol]


def _find_asset_header(words: list[Word]) -> tuple[float, float] | None:
    """Locate 'Value' 'of' 'Asset' header words; return (left, right) x-bounds."""
    by_top = sorted(words, key=lambda w: (w.top, w.x0))
    for i, w in enumerate(by_top):
        if w.text.lower() != "value":
            continue
        line = sorted(_line(by_top, w), key=lambda x: x.x0)
        texts = [x.text.lower() for x in line]
        if "of" not in texts or "asset" not in texts:
            continue
        # confirm ordering: Value < of < Asset by x0
        w_of = next(x for x in line if x.text.lower() == "of")
        w_asset = next(x for x in line if x.text.lower() == "asset" and x.x0 > w_of.x0)
        left = w.x0 - 2.0
        after = [x for x in line if x.x0 > w_asset.x1]
        right = (after[0].x0 - 3.0) if after else (left + 250.0)
        return left, right
    return None


def _find_liability_header(words: list[Word]) -> tuple[float, float, float] | None:
    """Locate 'Amount' 'of' 'Liability' header words (the last two words may
    wrap onto the next physical line). Return (left, right, page_right)."""
    by_top = sorted(words, key=lambda w: (w.top, w.x0))
    for i, w in enumerate(by_top):
        if w.text.lower() != "amount":
            continue
        line = sorted(_line(by_top, w), key=lambda x: x.x0)
        texts = [x.text.lower() for x in line]
        if "of" not in texts:
            continue
        # "Liability" either on the same line or wrapped just below, left-aligned
        # with "Amount".
        candidates = [
            x for x in words
            if x.text.lower() == "liability" and 0 <= (x.top - w.top) <= _WRAP_TOL and abs(x.x0 - w.x0) <= 10
        ]
        if not candidates:
            continue
        left = w.x0 - 2.0
        return left, left + 400.0, left + 400.0
    return None


@dataclass
class ColumnExtraction:
    asset_band_counts: dict[str, int] = field(default_factory=dict)
    liability_band_counts: dict[str, int] = field(default_factory=dict)
    asset_line_count: int = 0
    liability_line_count: int = 0
    assets_total: float = 0.0
    liabilities_total: float = 0.0
    has_open_ended_asset: bool = False
    asset_pages: int = 0
    liability_pages: int = 0
    asset_header_found_pages: int = 0
    liability_header_found_pages: int = 0


def extract(doc: DocWords) -> ColumnExtraction:
    asset_tokens: list[Word] = []
    liability_tokens: list[Word] = []
    asset_pages = liability_pages = 0
    asset_hdr_pages = liability_hdr_pages = 0

    last_asset_bounds: tuple[float, float] | None = None
    last_liability_bounds: tuple[float, float, float] | None = None

    for page in doc.pages:
        text = page.text.lower()
        page_has_asset_phrase = _HAS_ASSET_HDR.lower() in text
        page_has_liab_phrase = all(p.lower() in text for p in _HAS_LIAB_PHRASES)
        ordered_words = sorted(page.words, key=lambda w: (w.top, w.x0))

        if page_has_asset_phrase:
            asset_pages += 1
            bounds = _find_asset_header(page.words)
            if bounds:
                asset_hdr_pages += 1
                last_asset_bounds = bounds
            active = last_asset_bounds
            if active:
                left, right = active
                for w in ordered_words:
                    if left <= w.x0 < right and _VALUE_TOKEN_RE.match(w.text):
                        asset_tokens.append(w)

        if page_has_liab_phrase:
            liability_pages += 1
            bounds = _find_liability_header(page.words)
            if bounds:
                liability_hdr_pages += 1
                last_liability_bounds = bounds
            active = last_liability_bounds
            if active:
                left, right, _ = active
                for w in ordered_words:
                    if left <= w.x0 < right and _VALUE_TOKEN_RE.match(w.text):
                        liability_tokens.append(w)

    # Tokens are appended per page in page order, and pdfplumber already
    # yields each page's words in reading (top, x0) order, so simple
    # insertion-order join reconstructs page/top/x0 order across the whole
    # document without needing an extra sort key here.
    asset_joined = " ".join(w.text for w in asset_tokens)
    liability_joined = " ".join(w.text for w in liability_tokens)

    asset_counts = count_bands(asset_joined, ASSET_BANDS)
    liability_counts = count_bands(liability_joined, LIABILITY_BANDS)

    assets_total, has_open = value_total(asset_counts, ASSET_BANDS)
    liabilities_total, _ = value_total(liability_counts, LIABILITY_BANDS)

    return ColumnExtraction(
        asset_band_counts=asset_counts,
        liability_band_counts=liability_counts,
        asset_line_count=sum(asset_counts.values()),
        liability_line_count=sum(liability_counts.values()),
        assets_total=assets_total,
        liabilities_total=liabilities_total,
        has_open_ended_asset=has_open,
        asset_pages=asset_pages,
        liability_pages=liability_pages,
        asset_header_found_pages=asset_hdr_pages,
        liability_header_found_pages=liability_hdr_pages,
    )
