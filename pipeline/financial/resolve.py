"""Resolve a House FD index entry (last name + "TX02") to a ``bioguide_id``.

Uses the already-normalised ``pipeline/output/terms.json`` (bioguide-keyed,
one row per member x Congress x chamber) plus ``legislators.json`` for the
surname. Scope is current House members -- the latest Congress in terms.json.
Per docs/DATA_CONVENTIONS.md sec 1, ``bioguide_id`` is the only identifier we
carry, and an unresolved entry is a surfaced error, not a null-keyed row.
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

_OUT = Path(__file__).resolve().parents[1] / "output"

_STATE_DIST_RE = re.compile(r"^([A-Z]{2})(\d{2})$")


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z]", "", s.lower())


class Resolver:
    def __init__(self) -> None:
        terms = json.loads((_OUT / "terms.json").read_text())
        legs = {l["bioguide_id"]: l for l in json.loads((_OUT / "legislators.json").read_text())}
        self._congress = max(r["congress_number"] for r in terms)
        # (state, district) -> [bioguide_id, ...]  (district 0 == at-large)
        self._by_seat: dict[tuple[str, int], list[str]] = {}
        self._surname: dict[str, str] = {}
        for r in terms:
            if r["congress_number"] != self._congress or r["chamber"] != "house":
                continue
            seat = (r["state"], r["district"] if r["district"] is not None else 0)
            self._by_seat.setdefault(seat, []).append(r["bioguide_id"])
            leg = legs.get(r["bioguide_id"])
            if leg:
                self._surname[r["bioguide_id"]] = _norm(leg["name"]["last"])

    @property
    def congress(self) -> int:
        return self._congress

    def resolve(self, last: str, state_district: str) -> tuple[str | None, str]:
        m = _STATE_DIST_RE.match((state_district or "").strip())
        if not m:
            return None, f"unparseable State/District {state_district!r}"
        state, dist = m.group(1), int(m.group(2))
        cands = self._by_seat.get((state, dist)) or self._by_seat.get((state, 0)) or []
        if not cands:
            return None, f"no current House member for seat {state}{dist:02d}"
        if len(cands) == 1:
            return cands[0], "ok"
        want = _norm(last)
        hits = [b for b in cands if self._surname.get(b, "").startswith(want[:6]) or want.startswith(self._surname.get(b, "")[:6])]
        if len(hits) == 1:
            return hits[0], "ok (disambiguated by surname)"
        return None, f"ambiguous seat {state}{dist:02d}: {cands} (surname {last!r})"
