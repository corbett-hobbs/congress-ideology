"""Current Senate member roster, from the same `legislators-current.yaml`
`roster.py` already reads for the House -- reuses its `norm()`/
`last_name_variants()`/`Member` shape rather than duplicating them.

Unlike `roster.build_index()` (keyed by `(name-variant, state)`, since the
House Clerk index carries a `StateDst` column), the Senate search API's
result rows carry no state at all, so this module's index is name-only.
Every `Member` still carries `state`, used by `senate_match.py`'s
`senator_state`-scoped fallback query when a name-only lookup is ambiguous.
"""

from __future__ import annotations

from pathlib import Path

import yaml

from roster import Member, last_name_variants, norm  # noqa: F401  (re-exported)

_RAW = Path(__file__).resolve().parents[1] / "raw" / "congress-legislators" / "legislators-current.yaml"

# eFD's own stated coverage start (site copy: "reports ... received since
# January 1, 2012"), mirroring roster.py's START_YEAR=2013 floor for the
# House Clerk's digital-filing era.
EFD_START_YEAR = 2012


def load_current_senate_members(min_year: int = EFD_START_YEAR) -> list[Member]:
    data = yaml.safe_load(_RAW.read_text())
    members: list[Member] = []
    for rec in data:
        terms = rec.get("terms") or []
        if not terms:
            continue
        latest = terms[-1]
        if latest.get("type") != "sen":
            continue
        sen_years = [
            int(t["start"][:4]) for t in terms if t.get("type") == "sen" and t.get("start")
        ]
        if not sen_years:
            continue
        first_year = max(min_year, min(sen_years))
        name = rec.get("name", {})
        bioguide = rec.get("id", {}).get("bioguide")
        if not bioguide:
            continue
        state = latest.get("state", "")
        last = name.get("last", "")
        first = name.get("first", "")
        members.append(
            Member(
                bioguide_id=bioguide,
                first=first,
                last=last,
                state=state,
                first_year_served=first_year,
                last_name_variants=last_name_variants(last),
            )
        )
    return members


def build_index(members: list[Member]) -> dict[str, list[Member]]:
    """normalized-last-name-variant -> [Member, ...] (no state key -- see
    module docstring)."""
    idx: dict[str, list[Member]] = {}
    for m in members:
        for variant in m.last_name_variants:
            idx.setdefault(variant, []).append(m)
    return idx
