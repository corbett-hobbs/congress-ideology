"""Line-item (per-asset/per-liability) extraction for a Senate eFD
electronic report -- the item-grain sibling to `senate_html.py`'s band
counts. Reuses `senate_html.py`'s table-finding and value-cell
classification directly (same trusted logic that already produces
`financial_disclosures.json`'s `asset_band_counts`/`liability_band_counts`
for these rows) rather than re-deriving it, so the two can't drift apart on
which rows count as a line item.

Column layout confirmed live against real cached reports (see
senate_html.py's own docstring for the assets/liabilities table shapes):
assets carry a description ("Asset"), a type ("Asset Type"), and an owner
("Owner"); liabilities carry a description ("Creditor"), a type ("Type"),
and an owner ("Debtor").
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from bands import ASSET_BANDS, LIABILITY_BANDS
from bs4 import BeautifulSoup
from line_item_bands import band_range
from senate_html import (
    classify_cell,
    find_assets_table,
    find_liabilities_table,
)

_WS_RE = re.compile(r"\s+")


def _normalize(text: str) -> str:
    return _WS_RE.sub(" ", text).strip()


def _header_index(table, header_text: str) -> int | None:
    thead = table.find("thead")
    if thead is None:
        return None
    for i, th in enumerate(thead.find_all("th")):
        if th.get_text(strip=True).lower() == header_text.lower():
            return i
    return None


@dataclass
class LineItem:
    kind: str  # "asset" | "liability"
    description: str
    band_label: str
    lo: float | None
    hi: float | None
    owner: str | None
    form_type: str | None


@dataclass
class ExtractionResult:
    items: list[LineItem] = field(default_factory=list)
    # band label -> count, rebuilt from the emitted items (for the
    # reconciliation gate build_line_items.py runs against the trusted
    # asset_band_counts/liability_band_counts already in
    # financial_disclosures.json).
    band_counts: dict[str, int] = field(default_factory=dict)
    ok: bool = True
    note: str | None = None


def _extract_table(
    table, value_header: str, desc_header: str, type_header: str, owner_header: str, bands, kind: str,
) -> ExtractionResult:
    result = ExtractionResult()
    if table is None:
        return result  # no table at all = zero line items, not a failure

    value_idx = _header_index(table, value_header)
    desc_idx = _header_index(table, desc_header)
    type_idx = _header_index(table, type_header)
    owner_idx = _header_index(table, owner_header)
    if value_idx is None or desc_idx is None:
        result.ok = False
        result.note = f"missing '{value_header}' or '{desc_header}' column"
        return result

    band_labels = {b.label for b in bands}
    tbody = table.find("tbody")
    rows = tbody.find_all("tr") if tbody else []

    for tr in rows:
        cells = tr.find_all("td")
        if value_idx >= len(cells) or desc_idx >= len(cells):
            continue
        raw_value = cells[value_idx].get_text(strip=True)
        key = classify_cell(raw_value, band_labels)
        if key is None:
            continue  # blank Value cell -- not a reported line item
        if key.startswith("UNRECOGNIZED:"):
            result.ok = False
            result.note = f"unrecognized value {raw_value!r}"
            continue

        lo, hi = band_range(key, kind)
        description = _normalize(cells[desc_idx].get_text(" ", strip=True))
        form_type = (
            _normalize(cells[type_idx].get_text(" ", strip=True))
            if type_idx is not None and type_idx < len(cells)
            else None
        )
        owner = (
            _normalize(cells[owner_idx].get_text(" ", strip=True))
            if owner_idx is not None and owner_idx < len(cells)
            else None
        )

        result.items.append(
            LineItem(
                kind=kind,
                description=description,
                band_label=key,
                lo=lo,
                hi=hi,
                owner=owner or None,
                form_type=form_type or None,
            )
        )
        result.band_counts[key] = result.band_counts.get(key, 0) + 1

    return result


def extract(html: str) -> tuple[ExtractionResult, ExtractionResult]:
    """Returns `(assets, liabilities)`."""
    soup = BeautifulSoup(html, "html.parser")
    assets = _extract_table(
        find_assets_table(soup), "Value", "Asset", "Asset Type", "Owner", ASSET_BANDS, "asset",
    )
    liabilities = _extract_table(
        find_liabilities_table(soup), "Amount", "Creditor", "Type", "Debtor", LIABILITY_BANDS, "liability",
    )
    return assets, liabilities
