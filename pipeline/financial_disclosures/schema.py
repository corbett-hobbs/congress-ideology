"""Schema for a `financial_disclosures.json` row, per
`docs/FINANCIAL_DISCLOSURES_ARCHITECTURE.md` §2.

`docs/DATA_CONVENTIONS.md` §2 requires every `pipeline/output/*.json` file to
validate each row against its schema before writing it ("fail loudly, never
silently" -- §4). The rest of the pipeline is TypeScript and validates
against a Zod schema in `lib/entities.ts`; this component is Python (PDF
geometry work is easier here -- see `pipeline/financial_disclosures/README.md`),
so it can't share that schema directly. This module is the Python-side
equivalent: a plain, dependency-free structural check, not a new validation
library to add just for one file.
"""

from __future__ import annotations

# field -> (allowed python types, nullable)
_SCHEMA: dict[str, tuple[tuple[type, ...], bool]] = {
    "bioguide_id": ((str,), False),
    "year": ((int,), False),
    "chamber": ((str,), False),
    "assets_total": ((int, float), True),
    "liabilities_total": ((int, float), True),
    "net_worth": ((int, float), True),
    "has_open_ended_asset": ((bool,), True),
    "asset_line_count": ((int,), True),
    "liability_line_count": ((int,), True),
    "asset_band_counts": ((dict,), False),
    "liability_band_counts": ((dict,), False),
    "source_system": ((str,), False),
    "source_doc_id": ((str,), True),
    "filing_type": ((str,), True),
    "filing_date": ((str,), True),
    "extraction_method": ((str,), False),
    "parse_confidence": ((str,), True),
    "needs_review": ((bool,), False),
}

# Present only on some rows (e.g. the exception text for a "download_failed"
# row) -- unlike the fields above, absence is fine; only its type is checked
# when it does appear.
_OPTIONAL_FIELDS: dict[str, tuple[type, ...]] = {
    "extra_note": (str,),
}

_VALID_CHAMBERS = {"house", "senate"}
_VALID_SOURCE_SYSTEMS = {"house_clerk", "senate_efd"}
_VALID_EXTRACTION_METHODS = {"digital_text", "ocr", "manual"}
_VALID_PARSE_CONFIDENCE = {
    "high", "low", "unparseable_scanned", "no_filing_found", "download_failed",
}


def validate_record(rec: dict, index: int) -> None:
    """Raise ValueError naming the row and the exact problem if `rec` doesn't
    match the documented schema. Never silently pass a malformed row."""
    extra = set(rec) - set(_SCHEMA) - set(_OPTIONAL_FIELDS)
    if extra:
        raise ValueError(f"financial_disclosures.json row {index} ({rec.get('bioguide_id')}, {rec.get('year')}): unexpected field(s) {sorted(extra)}")

    for field, types in _OPTIONAL_FIELDS.items():
        if field in rec and not isinstance(rec[field], types):
            raise ValueError(f"financial_disclosures.json row {index} ({rec.get('bioguide_id')}, {rec.get('year')}): field '{field}' is {type(rec[field]).__name__}, expected one of {[t.__name__ for t in types]}")

    for field, (types, nullable) in _SCHEMA.items():
        if field not in rec:
            raise ValueError(f"financial_disclosures.json row {index} ({rec.get('bioguide_id')}, {rec.get('year')}): missing required field '{field}'")
        value = rec[field]
        if value is None:
            if not nullable:
                raise ValueError(f"financial_disclosures.json row {index} ({rec.get('bioguide_id')}, {rec.get('year')}): field '{field}' is null but is not nullable")
            continue
        if isinstance(value, bool) and bool not in types:
            raise ValueError(f"financial_disclosures.json row {index} ({rec.get('bioguide_id')}, {rec.get('year')}): field '{field}' is bool, expected one of {types}")
        if not isinstance(value, types):
            raise ValueError(f"financial_disclosures.json row {index} ({rec.get('bioguide_id')}, {rec.get('year')}): field '{field}' is {type(value).__name__}, expected one of {[t.__name__ for t in types]}")

    if rec["chamber"] not in _VALID_CHAMBERS:
        raise ValueError(f"financial_disclosures.json row {index}: chamber={rec['chamber']!r} not in {_VALID_CHAMBERS}")
    if rec["source_system"] not in _VALID_SOURCE_SYSTEMS:
        raise ValueError(f"financial_disclosures.json row {index}: source_system={rec['source_system']!r} not in {_VALID_SOURCE_SYSTEMS}")
    if rec["extraction_method"] not in _VALID_EXTRACTION_METHODS:
        raise ValueError(f"financial_disclosures.json row {index}: extraction_method={rec['extraction_method']!r} not in {_VALID_EXTRACTION_METHODS}")
    if rec["parse_confidence"] is not None and rec["parse_confidence"] not in _VALID_PARSE_CONFIDENCE:
        raise ValueError(f"financial_disclosures.json row {index}: parse_confidence={rec['parse_confidence']!r} not in {_VALID_PARSE_CONFIDENCE}")
