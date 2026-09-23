"""Current House member roster + bioguide crosswalk, from
`legislators-current.yaml` (the congress-legislators source already fetched
by `pipeline/fetch/legislators.ts` -- reused here since it was refreshed
today; the documented source of truth is
https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml
if a refresh is ever needed).
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

import yaml

_RAW = Path(__file__).resolve().parents[1] / "raw" / "congress-legislators" / "legislators-current.yaml"

# Two-letter state/territory codes the Clerk's StateDst field uses for
# non-voting delegates (confirmed against the actual roster below).
_DELEGATE_STATES = {"AS", "DC", "GU", "MP", "PR", "VI"}


def norm(s: str) -> str:
    """Unicode-normalize (strip accents) + lowercase + letters only."""
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z]", "", s.lower())


@dataclass
class Member:
    bioguide_id: str
    first: str
    last: str
    state: str
    first_year_served: int
    last_name_variants: list[str] = field(default_factory=list)


def last_name_variants(last: str) -> list[str]:
    """Variant normalized keys for a (possibly multi-word) last name, to
    handle the Clerk index splitting a multi-word surname differently (e.g.
    "Watson Coleman" vs whatever ordering/concatenation the Clerk uses)."""
    parts = last.split()
    variants = {norm(last)}
    if len(parts) > 1:
        variants.add(norm("".join(parts)))  # concatenated
        variants.add(norm(parts[-1]))  # final token only
        variants.add(norm(parts[0]))  # first token only
        variants.add(norm(" ".join(reversed(parts))))  # reversed order
    return [v for v in variants if v]


def load_current_house_members(min_year: int = 2013) -> list[Member]:
    data = yaml.safe_load(_RAW.read_text())
    members: list[Member] = []
    for rec in data:
        terms = rec.get("terms") or []
        if not terms:
            continue
        latest = terms[-1]
        if latest.get("type") != "rep":
            continue
        rep_years = [
            int(t["start"][:4]) for t in terms if t.get("type") == "rep" and t.get("start")
        ]
        if not rep_years:
            continue
        first_year = max(min_year, min(rep_years))
        name = rec.get("name", {})
        bioguide = rec.get("id", {}).get("bioguide")
        if not bioguide:
            continue
        state = latest.get("state", "")
        last = name.get("last", "")
        first = name.get("first", "")
        m = Member(
            bioguide_id=bioguide,
            first=first,
            last=last,
            state=state,
            first_year_served=first_year,
            last_name_variants=last_name_variants(last),
        )
        members.append(m)
    return members


def build_index(members: list[Member]) -> dict[tuple[str, str], list[Member]]:
    """(normalized-last-name-variant, state) -> [Member, ...]"""
    idx: dict[tuple[str, str], list[Member]] = {}
    for m in members:
        for variant in m.last_name_variants:
            key = (variant, m.state)
            idx.setdefault(key, []).append(m)
    return idx
