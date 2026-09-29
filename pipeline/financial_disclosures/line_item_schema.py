"""Schema for a `pipeline/output/line-items/<year>.json` row -- the item-grain
sibling to `schema.py`'s `financial_disclosures.json` row check. Same
"dependency-free structural check, fail loudly" contract (see that module's
docstring); this one additionally checks each row's `items[]` entries since
those are this file's whole point.
"""

from __future__ import annotations

_ROW_SCHEMA: dict[str, tuple[tuple[type, ...], bool]] = {
    "bioguide_id": ((str,), False),
    "year": ((int,), False),
    "chamber": ((str,), False),
    "source_system": ((str,), False),
    "source_doc_id": ((str,), True),
    "items": ((list,), False),
}

_ITEM_SCHEMA: dict[str, tuple[tuple[type, ...], bool]] = {
    "kind": ((str,), False),
    "description": ((str,), False),
    "band_label": ((str,), False),
    "lo": ((int, float), True),
    "hi": ((int, float), True),
    "owner": ((str,), True),
    "form_type": ((str,), True),
}

_VALID_CHAMBERS = {"house", "senate"}
_VALID_SOURCE_SYSTEMS = {"house_clerk", "senate_efd"}
_VALID_KINDS = {"asset", "liability"}


def _check_fields(d: dict, schema: dict, where: str) -> None:
    for field, (types, nullable) in schema.items():
        if field not in d:
            raise ValueError(f"{where}: missing field {field!r}")
        value = d[field]
        if value is None:
            if not nullable:
                raise ValueError(f"{where}: field {field!r} is null but not nullable")
            continue
        if not isinstance(value, types) or isinstance(value, bool):
            raise ValueError(f"{where}: field {field!r} has type {type(value).__name__}, expected {types}")


def validate_record(rec: dict, index: int) -> None:
    where = f"line-items row {index} ({rec.get('bioguide_id')}, {rec.get('year')})"
    _check_fields(rec, _ROW_SCHEMA, where)

    if rec["chamber"] not in _VALID_CHAMBERS:
        raise ValueError(f"{where}: invalid chamber {rec['chamber']!r}")
    if rec["source_system"] not in _VALID_SOURCE_SYSTEMS:
        raise ValueError(f"{where}: invalid source_system {rec['source_system']!r}")

    for i, item in enumerate(rec["items"]):
        item_where = f"{where} item {i}"
        _check_fields(item, _ITEM_SCHEMA, item_where)
        if item["kind"] not in _VALID_KINDS:
            raise ValueError(f"{item_where}: invalid kind {item['kind']!r}")
        if item["lo"] is not None and item["hi"] is not None and item["lo"] > item["hi"]:
            raise ValueError(f"{item_where}: lo > hi ({item['lo']} > {item['hi']})")
