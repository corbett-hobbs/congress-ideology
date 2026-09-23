"""Match House Clerk index rows to `bioguide_id`, per session prompt §2.

Key: `Last` (normalized: NFKD accent-strip + lowercase) + the 2-letter state
prefix of `StateDst`. Ambiguity (rare, e.g. common surname reused across
years within a state) is broken by the first 3 characters of `First`; if
still ambiguous, the row is flagged for manual review rather than guessed.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from fetch import FilingRow
from roster import Member, last_name_variants, norm

_STATE_DST_RE = re.compile(r"^([A-Z]{2})\d{2}$")


@dataclass
class MatchResult:
    bioguide_id: str | None
    reason: str  # "ok" | "ok_disambiguated" | "ambiguous" | "no_candidate" | "bad_state_dst"


def match_row(row: FilingRow, index: dict[tuple[str, str], list[Member]]) -> MatchResult:
    m = _STATE_DST_RE.match((row.state_dst or "").strip())
    if not m:
        return MatchResult(None, "bad_state_dst")
    state = m.group(1)

    candidates: list[Member] = []
    seen: set[str] = set()
    for variant in last_name_variants(row.last):
        for cand in index.get((variant, state), []):
            if cand.bioguide_id not in seen:
                seen.add(cand.bioguide_id)
                candidates.append(cand)

    if not candidates:
        return MatchResult(None, "no_candidate")
    if len(candidates) == 1:
        return MatchResult(candidates[0].bioguide_id, "ok")

    # Disambiguate by first 3 chars of First name.
    want = norm(row.first)[:3]
    hits = [c for c in candidates if norm(c.first)[:3] == want]
    if len(hits) == 1:
        return MatchResult(hits[0].bioguide_id, "ok_disambiguated")
    return MatchResult(None, "ambiguous")


def _doc_id_sort_key(doc_id: str) -> tuple[int, str]:
    """Compare doc_id numerically when possible. The Clerk's own doc_ids are
    monotonically increasing integers (see README: digital filings run 8-10
    digits, some scanned filings only 7), so a plain string compare picks the
    lexicographically larger id, not the numerically/chronologically later
    one, whenever two ids for the same member-year happen to differ in digit
    count. Falls back to string comparison only if doc_id isn't purely
    numeric (shouldn't happen for a real Clerk id, but never crash on it)."""
    return (int(doc_id), "") if doc_id.isdigit() else (-1, doc_id)


def pick_best_filing(rows: list[FilingRow]) -> FilingRow:
    """Amendment supersedes Original for the same reporting year: use
    whichever has the latest FilingDate, not necessarily the amendment. Ties
    (same filing_date, seen in production data -- e.g. two same-day
    amendments) break on doc_id, compared numerically since it's the Clerk's
    own monotonically increasing filing sequence number."""
    return max(rows, key=lambda r: (r.filing_date or "", _doc_id_sort_key(r.doc_id)))
