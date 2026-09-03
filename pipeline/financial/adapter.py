"""Map a ``parse_house.ParsedDisclosure`` onto ``financial_disclosures.json``'s
row shape (see ``lib/types.ts`` -> ``FinancialDisclosure``).

Net worth = sum(asset midpoints) - sum(liability midpoints), midpoints being the
arithmetic mean of each EIGA band. Open-ended bands ("Over $50,000,000") never
get a fabricated midpoint: they are recorded with ``open_ended: true`` and a
lower bound only, excluded from ``net_worth_estimate.midpoint``, and force
``needs_review``.
"""

from __future__ import annotations

from parse_house import ParsedDisclosure

_FILING_TYPE = {
    "Annual Report": "annual",
    "Amendment": "amendment",
    "New Filer Report": "new_filer",
    "Candidate Report": "candidate",
    "Termination Report": "termination",
    "Extension": "extension",
}
# House Clerk index <FilingType> codes -> schema value (fallback when the PDF
# itself has no extractable "Filing Type:" line, e.g. scanned filings).
_INDEX_FILING_TYPE = {
    "O": "annual", "A": "amendment", "C": "candidate", "X": "extension",
    "W": "new_filer", "T": "termination",
}

# Fraction of asset rows with no recognised value above which we no longer
# trust the midpoint sum as a net-worth estimate.
_NOVAL_REVIEW_FRACTION = 0.40


def _sum_midpoints(items) -> tuple[float, int, int]:
    total = 0.0
    open_ended = 0
    unrecognised = 0
    for it in items:
        if it.value is None:
            continue
        if it.value.open_ended:
            open_ended += 1
            continue
        if not it.value.recognized:
            unrecognised += 1
            continue
        if it.value.midpoint is not None:
            total += it.value.midpoint
    return total, open_ended, unrecognised


def adapt(parsed: ParsedDisclosure, *, bioguide_id: str, year: int,
          doc_id: str, source_url: str, index_filing_type: str = "") -> dict:
    filing_type = _FILING_TYPE.get(
        (parsed.filing_type or "").strip(),
        _INDEX_FILING_TYPE.get(index_filing_type.strip().upper(), "other"),
    )

    asset_mid, asset_open, asset_unrec = _sum_midpoints(parsed.assets)
    liab_mid, liab_open, liab_unrec = _sum_midpoints(parsed.liabilities)

    review_notes: list[str] = []
    scanned = parsed.section_status.get("A") == "scanned"
    if scanned:
        review_notes.append("scanned/paper filing: no extractable schedule text")
    if parsed.section_status.get("A") not in ("parsed", "none_disclosed", "scanned"):
        review_notes.append(f"Schedule A status: {parsed.section_status.get('A')}")
    if asset_open or liab_open:
        review_notes.append(
            f"{asset_open + liab_open} open-ended band(s) present -- net worth is a lower bound")
    if asset_unrec or liab_unrec:
        review_notes.append(f"{asset_unrec + liab_unrec} unrecognised value band(s)")
    merge_artifacts = sum(1 for it in (*parsed.assets, *parsed.liabilities)
                          if any("merge artifact" in n for n in it.notes))
    if merge_artifacts:
        review_notes.append(f"{merge_artifacts} row(s) show wrap/merge artifacts")

    n_assets = len(parsed.assets)
    n_noval = sum(1 for a in parsed.assets if a.value is None)
    noval_fraction = (n_noval / n_assets) if n_assets else 0.0
    if n_assets and noval_fraction > _NOVAL_REVIEW_FRACTION:
        review_notes.append(
            f"{n_noval}/{n_assets} asset rows have no parsed value "
            f"({noval_fraction:.0%}) -- likely a managed-account-heavy filing "
            f"or parse noise; midpoint sum understates net worth")

    net_worth = None
    if not scanned and parsed.section_status.get("A") in ("parsed", "none_disclosed"):
        low = sum(a.value.low for a in parsed.assets if a.value and a.value.low) \
            - sum(l.value.high or l.value.low for l in parsed.liabilities if l.value)
        high = sum(a.value.high or a.value.low for a in parsed.assets if a.value) \
            - sum(l.value.low for l in parsed.liabilities if l.value and l.value.low)
        net_worth = {
            "low": low,
            "high": high,
            "midpoint": round(asset_mid - liab_mid),
            "midpoint_is_lower_bound": bool(asset_open or liab_open),
        }

    needs_review = bool(review_notes) or scanned
    confidence = "low" if needs_review else "high"
    if scanned:
        confidence = "none"

    return {
        "bioguide_id": bioguide_id,
        "year": year,
        "filing_type": filing_type,
        "doc_id": doc_id,
        "source_url": source_url,
        "filer_name": parsed.name,
        "state_district": parsed.state_district,
        "net_worth_estimate": net_worth,
        "totals": {
            "asset_midpoint_sum": round(asset_mid),
            "liability_midpoint_sum": round(liab_mid),
            "n_assets": n_assets,
            "n_assets_valued": n_assets - n_noval,
            "n_liabilities": len(parsed.liabilities),
        },
        "assets": [a.as_dict() for a in parsed.assets],
        "liabilities": [l.as_dict() for l in parsed.liabilities],
        "section_status": parsed.section_status,
        "parse_confidence": confidence,
        "needs_review": needs_review,
        "review_notes": review_notes,
        "parser_warnings": parsed.warnings[:50],
        "source_pages": parsed.page_count,
    }
