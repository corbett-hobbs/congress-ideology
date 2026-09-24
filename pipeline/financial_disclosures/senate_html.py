"""Extract assets/liabilities value bands from a Senate eFD electronic
("annual", HTML) report page.

Structurally parallel to `columns.py`, but simpler: the source is already a
structured HTML table (BeautifulSoup), not a PDF text layer, so there's no
column-position geometry to reconstruct -- each row's Value/Amount cell is
already an isolated string. Verified live (2026-09-24 session, Tammy
Baldwin's CY2024 report) against real markup:

- Assets: `<table id="grid_items">`, present only when Part 3 answered
  "Yes". Header cells: ["", "Asset", "Asset Type", "Owner", "Value",
  "Income Type", "Income"].
- Liabilities: no stable id, but a stable `<caption>` text
  "List of liabilities added to this report" inside a
  `<table class="table table-striped">`. Header cells: ["", "#", "Incurred",
  "Debtor", "Type", "Points", "Rate(Term)", "Amount", "Creditor",
  "Comments"].
- A "No" answer renders no table at all for that Part -- absent and
  present-but-empty both mean zero line items.
- Value/Amount cell text already matches `bands.py`'s exact literal EIGA
  labels verbatim (e.g. "$500,001 - $1,000,000"). One literal value isn't a
  band at all: "Unascertainable" (seen on a defined-benefit pension row) --
  a genuinely reported line item with no stated value, not a parse failure.

The value column is always located by matching its header text ("Value" /
"Amount"), never a hardcoded index -- same "never a hardcoded position"
principle `columns.py` already follows, since a future markup revision could
reorder columns.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from bands import ASSET_BANDS, LIABILITY_BANDS, BandDef, value_total
from bs4 import BeautifulSoup

UNASCERTAINABLE = "Unascertainable"
# A parent/grouping row (e.g. a retirement account whose value is broken out
# across its own sub-rows, numbered "2.1", "2.2", ... under parent row "2")
# reports "--" in its own Value cell -- confirmed live (Brian Schatz's
# CY2025 report: row "2" TIAA-CREF retirement account = "--", its four child
# rows "2.1"-"2.4" each carry a real band value). Tracked under its own key
# (auditability) but contributes $0 -- the real value already lives on the
# child rows, which are separate <tr> elements this same loop also visits.
NO_SEPARATE_VALUE = "--"
# Distinct from Income's own "None (or less than $201)" convention: the
# asset/liability Value column has its own below-reporting-threshold phrase
# with its own dollar figure (confirmed live: "None (or less than $1,001)"
# on real mutual-fund sub-holdings, John Thune's CY2024 report) -- a
# genuinely reported line item, not a parse failure. Matched generically
# (dollar figure not hardcoded) since assets' and liabilities' thresholds
# differ.
_NONE_BELOW_THRESHOLD_RE = re.compile(r"^None \(or less than \$[\d,]+\)$")
_EXACT_DOLLAR_RE = re.compile(r"^\$[\d,]+(\.\d{2})?$")

# EIGA's "excepted investment fund" / spousal-independent-holding carve-out
# (the same underlying provision House's columns.py handles via its
# "$1,000,000"/_AMBIGUOUS_EXACT_VALUES special case for a wrapped income-
# column token -- here the Senate HTML gives the *entire* phrase in its own
# isolated Value cell, so there's no token-stream ambiguity to worry about).
# Confirmed live on Rick Scott's CY2020 (Amendment 1) report (~100
# occurrences -- his wife's independently-held holdings are a material share
# of his disclosed net worth, so mishandling this isn't a minor edge case).
# Wording differs slightly between the assets and liabilities tables
# ("...and held independently..." vs. "...(asset held independently...)"),
# matched literally per this codebase's "literal string, not fuzzy"
# philosophy (bands.py's own docstring) rather than normalized to one string.
SPOUSAL_INDEPENDENT_FLOOR = 1_000_000
_SPOUSAL_INDEPENDENT_OVER_RE = re.compile(r"^Over \$1,000,000.*held independently by spouse or dependent child")
# Not yet observed in sampled data, but the House precedent (both a
# "$1,000,000 or less" and an "Over $1,000,000" form) makes a below-floor
# counterpart plausible -- handled now rather than left to silently fall
# into UNRECOGNIZED if a future report uses it. Contributes $0 (an unknown
# amount somewhere in [$0, $1,000,000]; no fabricated midpoint, same
# "flag rather than guess" principle as bands.py's own open-ended handling).
_SPOUSAL_INDEPENDENT_UNDER_RE = re.compile(r"^\$1,000,000 or less.*held independently by spouse or dependent child")

_LIABILITIES_CAPTION_RE = re.compile(r"List of liabilities added to this report", re.IGNORECASE)


@dataclass
class TableExtraction:
    band_counts: dict[str, int] = field(default_factory=dict)
    line_count: int = 0
    total: float = 0.0
    has_open_ended: bool = False
    table_found: bool = False
    value_column_found: bool = False
    unrecognized_values: list[str] = field(default_factory=list)


def find_assets_table(soup: BeautifulSoup):
    return soup.find("table", id="grid_items")


def find_liabilities_table(soup: BeautifulSoup):
    caption = soup.find("caption", string=_LIABILITIES_CAPTION_RE)
    if caption is None:
        return None
    return caption.find_parent("table")


def _header_index(table, header_text: str) -> int | None:
    header_cells = table.find("thead")
    if header_cells is None:
        return None
    ths = header_cells.find_all("th")
    for i, th in enumerate(ths):
        if th.get_text(strip=True).lower() == header_text.lower():
            return i
    return None


def classify_cell(text: str, band_labels: set[str]) -> str | None:
    """Returns the dict key to tally this value under, or None for a blank
    cell (not a line item at all, not an error)."""
    text = text.strip()
    if not text:
        return None
    if text in band_labels:
        return text
    if text == UNASCERTAINABLE or text == NO_SEPARATE_VALUE:
        return text
    if _NONE_BELOW_THRESHOLD_RE.match(text):
        return text
    if _SPOUSAL_INDEPENDENT_OVER_RE.match(text) or _SPOUSAL_INDEPENDENT_UNDER_RE.match(text):
        return text
    if _EXACT_DOLLAR_RE.match(text):
        return text
    return f"UNRECOGNIZED:{text}"


def _spousal_independent_adjustment(counts: dict[str, int]) -> tuple[float, bool]:
    """`bands.value_total()` safely no-ops on these labels (not a known band,
    not a bare-dollar exact value), so their contribution is added here
    separately rather than teaching `bands.py` about a Senate-specific
    phrase. Returns (extra_total, has_open_ended)."""
    extra_total = 0.0
    has_open = False
    for label, n in counts.items():
        if _SPOUSAL_INDEPENDENT_OVER_RE.match(label):
            extra_total += SPOUSAL_INDEPENDENT_FLOOR * n
            has_open = True
        # The "or less" counterpart contributes $0 by design -- see its
        # regex's docstring above.
    return extra_total, has_open


def extract_table(table, value_header: str, bands: list[BandDef]) -> TableExtraction:
    result = TableExtraction()
    if table is None:
        return result
    result.table_found = True

    value_idx = _header_index(table, value_header)
    if value_idx is None:
        return result
    result.value_column_found = True

    band_labels = {b.label for b in bands}
    tbody = table.find("tbody")
    rows = tbody.find_all("tr") if tbody else []
    counts: dict[str, int] = {}
    for tr in rows:
        cells = tr.find_all("td")
        if value_idx >= len(cells):
            continue
        raw = cells[value_idx].get_text(strip=True)
        key = classify_cell(raw, band_labels)
        if key is None:
            continue
        counts[key] = counts.get(key, 0) + 1
        if key.startswith("UNRECOGNIZED:"):
            result.unrecognized_values.append(raw)

    total, has_open = value_total(counts, bands)
    extra_total, spousal_has_open = _spousal_independent_adjustment(counts)
    result.band_counts = counts
    result.line_count = sum(counts.values())
    result.total = total + extra_total
    result.has_open_ended = has_open or spousal_has_open
    return result


@dataclass
class ReportExtraction:
    assets: TableExtraction
    liabilities: TableExtraction


def extract(html: str) -> ReportExtraction:
    soup = BeautifulSoup(html, "html.parser")
    assets = extract_table(find_assets_table(soup), "Value", ASSET_BANDS)
    liabilities = extract_table(find_liabilities_table(soup), "Amount", LIABILITY_BANDS)
    return ReportExtraction(assets=assets, liabilities=liabilities)
