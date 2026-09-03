"""EIGA dollar-range bands used on the House Financial Disclosure form.

The House Clerk's electronic report renders Schedule A / B / D values as literal
dollar ranges ("$1,001 - $15,000"), not the single-letter codes that the
judicial AO-10 form (and `disclosure-extractor`) use. We parse the range text
directly and keep an explicit open-ended marker for the top band, which has no
upper bound.

Net worth methodology (matches the House pipeline convention in the session
brief): sum of asset-range midpoints minus sum of liability-range midpoints.
For an open-ended band we do NOT fabricate a midpoint -- the row is flagged and
excluded from the confident midpoint sum.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Canonical EIGA bands: low bound -> high bound (dollars). A value of None means
# the band is open-ended (no upper bound printed on the form).
KNOWN_BANDS: dict[int, int | None] = {
    1: 1_000,
    1_001: 15_000,
    15_001: 50_000,
    50_001: 100_000,
    100_001: 250_000,
    250_001: 500_000,
    500_001: 1_000_000,
    1_000_001: 5_000_000,
    5_000_001: 25_000_000,
    25_000_001: 50_000_000,
    50_000_001: None,  # "Over $50,000,000" / "$50,000,000 +"
}

# Value strings that legitimately carry no dollar figure.
NULLISH = {"", "none", "n/a", "undetermined", "-1", "tax-deferred"}

# Accept an explicit separator ("-", "–", "to") OR just whitespace between the
# two dollar figures: the Clerk layout occasionally drops the dash token when a
# range wraps across lines ("$5,000,001" then "$25,000,000" on the next line).
_RANGE_RE = re.compile(r"\$\s?([\d,]+)\s*(?:-|–|to|\s)\s*\$\s?([\d,]+)")
_OPEN_RE = re.compile(r"(?:over\s*)?\$?\s?([\d,]+)\s*\+|over\s*\$?\s?([\d,]+)", re.I)
_SINGLE_OPEN_RE = re.compile(r"^\$?\s?([\d,]+)\s*[-–]\s*$")


@dataclass(frozen=True)
class Band:
    low: int | None
    high: int | None
    open_ended: bool
    raw: str

    @property
    def midpoint(self) -> float | None:
        """None for open-ended or unparseable bands -- never fabricated."""
        if self.open_ended or self.low is None or self.high is None:
            return None
        return (self.low + self.high) / 2

    @property
    def recognized(self) -> bool:
        """True when the band lines up with a known EIGA edge."""
        if self.low is None:
            return False
        if self.open_ended:
            return KNOWN_BANDS.get(self.low, "x") is None
        return KNOWN_BANDS.get(self.low) == self.high

    def as_dict(self) -> dict:
        return {
            "low": self.low,
            "high": self.high,
            "open_ended": self.open_ended,
            "midpoint": self.midpoint,
            "recognized": self.recognized,
            "raw": self.raw,
        }


def _to_int(s: str) -> int:
    return int(s.replace(",", "").strip())


# "Over $50,000,000" means >$50,000,000, i.e. a floor of $50,000,001. When an
# open bound is written as an EIGA band *ceiling*, bump it by a dollar.
_CEILINGS = {v for v in KNOWN_BANDS.values() if v is not None} | {50_000_000, 1_000_000}


def _normalise_open_low(n: int) -> int:
    return n + 1 if n in _CEILINGS else n


def parse_band(text: str) -> Band | None:
    """Parse a Schedule value string into a Band.

    Returns None when the text carries no dollar figure at all ("None",
    "Undetermined", empty). Returns a Band with ``recognized=False`` when a
    figure is present but does not line up with a known EIGA edge -- callers
    flag those for review rather than trust the midpoint.
    """
    t = " ".join(text.split())
    if t.lower() in NULLISH:
        return None

    m = _RANGE_RE.search(t)
    if m:
        low, high = _to_int(m.group(1)), _to_int(m.group(2))
        if high < low:
            low, high = high, low
        return Band(low=low, high=high, open_ended=False, raw=t)

    mo = _OPEN_RE.search(t)
    if mo:
        num = _to_int(mo.group(1) or mo.group(2))
        return Band(low=_normalise_open_low(num), high=None, open_ended=True, raw=t)

    ms = _SINGLE_OPEN_RE.search(t)
    if ms:
        return Band(low=_normalise_open_low(_to_int(ms.group(1))), high=None,
                    open_ended=True, raw=t)

    return None
