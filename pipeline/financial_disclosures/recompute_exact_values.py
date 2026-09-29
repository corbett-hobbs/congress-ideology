"""One-off cleanup: apply columns._is_plausible_exact_value to already-written
OCR rows, without re-running OCR. Drops legend-residue "exact value" keys from
each row's band counts, recomputes totals from what's left, and downgrades a
`high` row that has no real value lines left to `low` / needs_review.

    ./.venv/bin/python recompute_exact_values.py [--write]
"""

import json
import sys
from pathlib import Path

from bands import ASSET_BANDS, LIABILITY_BANDS, value_total
from columns import _is_plausible_exact_value

PATH = Path(__file__).resolve().parent.parent / "output" / "financial_disclosures.json"


def clean(counts, bands):
    labels = {b.label for b in bands}
    kept = {k: n for k, n in counts.items() if k in labels or _is_plausible_exact_value(k)}
    return kept, sum(counts.values()) - sum(kept.values())


def main():
    rows = json.loads(PATH.read_text())
    changed = []
    for r in rows:
        if r.get("chamber") != "house" or r.get("extraction_method") != "ocr":
            continue
        a, da = clean(r.get("asset_band_counts") or {}, ASSET_BANDS)
        l, dl = clean(r.get("liability_band_counts") or {}, LIABILITY_BANDS)
        if not (da or dl):
            continue
        before = (r["parse_confidence"], r["net_worth"])
        r["asset_band_counts"], r["liability_band_counts"] = a, l
        if r.get("asset_line_count") is not None:
            r["asset_line_count"] -= da
        if r.get("liability_line_count") is not None:
            r["liability_line_count"] -= dl
        if r["net_worth"] is not None:  # ocr_low_confidence rows keep null payloads
            assets, has_open = value_total(a, ASSET_BANDS)
            liabs, _ = value_total(l, LIABILITY_BANDS)
            r["assets_total"], r["liabilities_total"] = round(assets, 2), round(liabs, 2)
            r["net_worth"] = round(assets - liabs, 2)
            r["has_open_ended_asset"] = has_open
        if r["parse_confidence"] == "high" and not (r["asset_line_count"] or r["liability_line_count"]):
            r["parse_confidence"], r["needs_review"] = "low", True
        note = "legend-residue exact values removed (columns._is_plausible_exact_value)"
        r["extra_note"] = f"{r['extra_note']}; {note}" if r.get("extra_note") else note
        changed.append((r["bioguide_id"], r["year"], before, (r["parse_confidence"], r["net_worth"])))
    for c in changed:
        print(*c)
    print(len(changed), "rows changed", file=sys.stderr)
    if "--write" in sys.argv:
        from build_ocr import _write_output  # validates, same compact format
        _write_output(rows)


main()
