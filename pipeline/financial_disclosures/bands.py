"""EIGA dollar-range value bands used on House Financial Disclosure Schedule A
(assets) and Schedule D (liabilities).

Per the architecture doc, band tables are chamber/method-agnostic (EIGA is
federal law, identical for House and Senate). We count *literal* band strings
in extracted column text (``joined.count(band_string)``) rather than using
fuzzy regex matching -- each band's literal string is distinct and none is a
substring of another (verified below), so literal counting is safe even when
two ranges sit back-to-back with no separator.
"""

from __future__ import annotations

from dataclasses import dataclass


def _fmt(n: int) -> str:
    return f"${n:,}"


def _label(low: int, high: int) -> str:
    return f"{_fmt(low)} - {_fmt(high)}"


# Bands shared by both assets and liabilities above the bottom tier.
_COMMON_TIERS: list[tuple[int, int]] = [
    (15_001, 50_000),
    (50_001, 100_000),
    (100_001, 250_000),
    (250_001, 500_000),
    (500_001, 1_000_000),
    (1_000_001, 5_000_000),
    (5_000_001, 25_000_000),
    (25_000_001, 50_000_000),
]

OPEN_ENDED_LABEL = "Over $50,000,000"
OPEN_ENDED_FLOOR = 50_000_000  # point-estimate floor; no fabricated midpoint

# Asset bands: bottom tier starts at $1,001.
ASSET_TIERS: list[tuple[int, int]] = [(1_001, 15_000)] + _COMMON_TIERS

# Liability bands: bottom tier starts at $10,001 (liabilities under $10,000
# aren't reportable).
LIABILITY_TIERS: list[tuple[int, int]] = [(10_001, 15_000)] + _COMMON_TIERS


@dataclass(frozen=True)
class BandDef:
    label: str
    low: int
    high: int | None  # None => open-ended
    midpoint: float | None  # None => open-ended (no fabricated midpoint)


def _build(tiers: list[tuple[int, int]]) -> list[BandDef]:
    out = [BandDef(_label(lo, hi), lo, hi, (lo + hi) / 2.0) for lo, hi in tiers]
    out.append(BandDef(OPEN_ENDED_LABEL, OPEN_ENDED_FLOOR + 1, None, None))
    return out


ASSET_BANDS = _build(ASSET_TIERS)
LIABILITY_BANDS = _build(LIABILITY_TIERS)


def _assert_no_substrings(bands: list[BandDef]) -> None:
    labels = [b.label for b in bands]
    for i, a in enumerate(labels):
        for j, b in enumerate(labels):
            if i != j and a in b:
                raise AssertionError(f"band label {a!r} is a substring of {b!r}")


_assert_no_substrings(ASSET_BANDS)
_assert_no_substrings(LIABILITY_BANDS)


def count_bands(joined_text: str, bands: list[BandDef]) -> dict[str, int]:
    """Count literal occurrences of each band's label in ``joined_text``."""
    counts: dict[str, int] = {}
    for b in bands:
        n = joined_text.count(b.label)
        if n:
            counts[b.label] = n
    return counts


def value_total(counts: dict[str, int], bands: list[BandDef]) -> tuple[float, bool]:
    """Sum midpoint*count over recognized bands. Returns (total, has_open_ended).

    The open-ended top band contributes its floor value to the total (a
    sortable point estimate, matching wealthincongress.com's convention) but
    also flags ``has_open_ended`` so callers can surface it rather than treat
    the total as exact.
    """
    by_label = {b.label: b for b in bands}
    total = 0.0
    has_open = False
    for label, n in counts.items():
        b = by_label.get(label)
        if b is None:
            continue
        if b.midpoint is None:
            total += OPEN_ENDED_FLOOR * n
            has_open = True
        else:
            total += b.midpoint * n
    return total, has_open
