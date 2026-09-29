"""Per-item (lo, hi) range for one EIGA band label -- the line-item grain's
band policy. Distinct from `bands.py`'s `value_total()`, which sums a
*point estimate* (open-ended contributes its floor) across a whole filing;
here each item keeps its own range, `hi = None` for an open-ended band,
mirroring `lib/wealth-bands.ts` on the TypeScript side exactly (see that
module's docstring -- Python and TypeScript can't share one module, so this
is the intentional restatement, and `build_line_items.py`'s reconciliation
gate is what keeps the two from silently drifting apart).
"""

from __future__ import annotations

import re

from bands import ASSET_BANDS, LIABILITY_BANDS, BandDef

_ZERO_LABELS = {
    "None (or less than $1,001)",
    "--",
    "Unascertainable",
}

# Senate-only literal phrases (see senate_html.py) -- not in bands.py's
# BandDef tables since they're not EIGA bands, they're a distinct reporting
# convention for the spousal/dependent "excepted investment fund" carve-out.
_SPOUSAL_OVER_RE = re.compile(
    r"^Over \$1,000,000.*held independently by spouse or dependent child"
)
_SPOUSAL_UNDER_RE = re.compile(
    r"^\$1,000,000 or less.*held independently by spouse or dependent child"
)
SPOUSAL_INDEPENDENT_FLOOR = 1_000_000

# A bare reported dollar figure instead of an EIGA band (older House
# filings' checking/money-market lines; see columns.py's
# `_find_exact_values`) -- the most precise case, lo == hi == the figure.
_EXACT_DOLLAR_RE = re.compile(r"^\$([\d,]+)(?:\.\d{2})?$")


def _band_maps() -> dict[str, dict[str, BandDef]]:
    return {
        "asset": {b.label: b for b in ASSET_BANDS},
        "liability": {b.label: b for b in LIABILITY_BANDS},
    }


_MAPS = _band_maps()


def band_range(label: str, kind: str) -> tuple[float | None, float | None]:
    """`(lo, hi)` for one band label. `hi is None` means open-ended (lo is
    still a known floor). `(None, None)` means unrecognized -- the item is
    real (it was a line on the form) but its numeric range can't be
    determined, same "flag rather than guess" contract as `lib/wealth-bands.ts`.
    """
    if label in _ZERO_LABELS:
        return 0.0, 0.0

    band = _MAPS[kind].get(label)
    if band is not None:
        return float(band.low), (float(band.high) if band.high is not None else None)

    if _SPOUSAL_OVER_RE.match(label):
        return float(SPOUSAL_INDEPENDENT_FLOOR + 1), None
    if _SPOUSAL_UNDER_RE.match(label):
        # Contributes no known floor -- true value is somewhere in
        # [$0, $1,000,000]. Distinct from "unavailable": the label IS
        # recognized, it just doesn't bound the range from below.
        return 0.0, float(SPOUSAL_INDEPENDENT_FLOOR)

    m = _EXACT_DOLLAR_RE.match(label)
    if m:
        v = float(m.group(1).replace(",", ""))
        return v, v

    return None, None
