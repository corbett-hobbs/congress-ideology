"""Match Senate eFD search rows to `bioguide_id`, and parse the report-label
taxonomy into `(year, is_amendment, amendment_n, report_kind)`.

Unlike House's `match.py`, Senate search rows carry no state column, so
matching is name-only (last-name-variant + first-3-chars-of-first-name
disambiguation, same algorithm `match.py` uses). Verified empirically
(2026-09-24 session) against every current senator plus every senator who
left office in 2012 or later (the outer bound of who could still appear in
eFD's 6-year-retention window): exactly one same-last-name pair exists today
(Tim Scott/SC vs. Rick Scott/FL), and it resolves cleanly on first-3-chars
alone ("tim" vs. "ric"). Because a future election could in principle seat
two senators who collide on both, `match_row()` adds a second, verified
layer rather than trusting the name rule alone: a `senator_state`-scoped
re-query (confirmed working live: `last_name=Scott&senator_state=FL`
isolates Rick Scott's rows exactly) deterministically picks the right
candidate before ever falling back to the `"ambiguous"` manual-review path.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from roster import Member, last_name_variants, norm
from senate_fetch import SearchRow, search


@dataclass
class MatchResult:
    bioguide_id: str | None
    reason: str  # "ok" | "ok_disambiguated" | "ok_state_resolved" | "ambiguous" | "no_candidate"


def match_row(row: SearchRow, index: dict[str, list[Member]], session=None) -> MatchResult:
    """`session` is only used for the `senator_state` fallback query -- pass
    None to disable it (e.g. in tests that don't need network access); a
    genuinely ambiguous row then just falls through to `"ambiguous"`."""
    candidates: list[Member] = []
    seen: set[str] = set()
    for variant in last_name_variants(row.last):
        for cand in index.get(variant, []):
            if cand.bioguide_id not in seen:
                seen.add(cand.bioguide_id)
                candidates.append(cand)

    if not candidates:
        return MatchResult(None, "no_candidate")
    if len(candidates) == 1:
        return MatchResult(candidates[0].bioguide_id, "ok")

    want = norm(row.first)[:3]
    hits = [c for c in candidates if norm(c.first)[:3] == want]
    if len(hits) == 1:
        return MatchResult(hits[0].bioguide_id, "ok_disambiguated")

    if len(hits) > 1 and session is not None:
        resolved = _resolve_by_state(row, hits, session)
        if resolved is not None:
            return MatchResult(resolved, "ok_state_resolved")

    return MatchResult(None, "ambiguous")


def _resolve_by_state(row: SearchRow, hits: list[Member], session) -> str | None:
    """Re-query the search API once per remaining candidate, scoped to that
    candidate's own state, and keep the one whose scoped result set actually
    contains this exact report URL. Deterministic against the source system
    itself -- not a guess."""
    for cand in hits:
        state_rows = search(session, last_name=row.last, first_name=row.first, senator_state=cand.state)
        if any(r.report_url == row.report_url for r in state_rows):
            return cand.bioguide_id
    return None


_SENATOR_OFFICE_RE = re.compile(r"^Senator$|\(Senator\)$")


def is_senator_row(row: SearchRow) -> bool:
    """Office == "Senator" (old style, pre-~2018) or ends with "(Senator)"
    (new style, e.g. "Baldwin, Tammy (Senator)"). Excludes "(Candidate)" /
    "Candidate (Candidate)" rows the same `report_types` bucket also
    returns -- a campaign-era snapshot, not an officeholder annual
    disclosure, out of scope for net worth by year (same reasoning as House
    keeping only O/A filing types)."""
    return bool(_SENATOR_OFFICE_RE.search(row.office.strip()))


@dataclass
class ReportInfo:
    year: int
    is_amendment: bool
    amendment_n: int | None
    report_kind: str  # "annual" | "new_filer"


_CY_RE = re.compile(r"for CY (\d{4})")
_AMENDMENT_RE = re.compile(r"\(Amendment (\d+)\)")
_NEW_FILER_DATE_RE = re.compile(r"New Filer Report for (\d{2})/(\d{2})/(\d{4})")
_NEW_FILER_RE = re.compile(r"^New Filer Report")
_CANDIDATE_REPORT_RE = re.compile(r"^Candidate Report")


def parse_report_label(label: str, filed_date: str | None = None) -> ReportInfo | None:
    """Returns None for a label this module deliberately excludes
    (`"Candidate Report"` -- a campaign-era snapshot, not an officeholder
    annual disclosure, see `is_senator_row`'s docstring for why the
    Office-column filter alone doesn't already exclude it) or one it
    genuinely doesn't recognize (a future report-type string) -- caller
    flags rather than guesses either way, per this codebase's "flag rather
    than guess" convention (see `columns.py`). Distinguish the two via
    `is_candidate_report()` before treating a `None` as a concerning gap."""
    if _CANDIDATE_REPORT_RE.match(label.strip()):
        return None

    amendment_m = _AMENDMENT_RE.search(label)
    is_amendment = amendment_m is not None
    amendment_n = int(amendment_m.group(1)) if amendment_m else None

    cy_m = _CY_RE.search(label)
    if cy_m:
        return ReportInfo(year=int(cy_m.group(1)), is_amendment=is_amendment, amendment_n=amendment_n, report_kind="annual")

    new_filer_date_m = _NEW_FILER_DATE_RE.search(label)
    if new_filer_date_m:
        year = int(new_filer_date_m.group(3))
        return ReportInfo(year=year, is_amendment=is_amendment, amendment_n=amendment_n, report_kind="new_filer")

    if _NEW_FILER_RE.match(label.strip()) and filed_date:
        # An amendment to a New Filer Report can carry no date of its own
        # (confirmed live: "New Filer Report  (Amendment 1)", Tina Smith,
        # filed 08/13/2018) -- fall back to the filed_date's year rather
        # than dropping the row. An amendment is filed close to the
        # original event, so this is a bounded inference, not a guess at an
        # unrelated fact.
        year_m = re.search(r"/(\d{4})$", filed_date)
        if year_m:
            return ReportInfo(year=int(year_m.group(1)), is_amendment=is_amendment, amendment_n=amendment_n, report_kind="new_filer")

    return None


def is_candidate_report(label: str) -> bool:
    """True for a label `parse_report_label()` returns None for by design
    (not a parse failure) -- use this to keep a "Candidate Report" row out
    of a "genuinely unrecognized label" count in run reports."""
    return bool(_CANDIDATE_REPORT_RE.match(label.strip()))


def _filed_date_sort_key(filed_date: str) -> str:
    """MM/DD/YYYY -> YYYY-MM-DD for chronological string comparison."""
    try:
        mm, dd, yyyy = filed_date.split("/")
        return f"{yyyy}-{mm}-{dd}"
    except ValueError:
        return filed_date


def pick_best_filing(rows: list[tuple[SearchRow, ReportInfo]]) -> tuple[SearchRow, ReportInfo]:
    """Amendment supersedes original for the same reporting year: latest
    `filed_date` wins, tie-broken by amendment number (higher wins) when
    present -- Senate report UUIDs aren't a monotonic sequence the way
    House's numeric `doc_id` is, so that tie-break (`match.py`'s
    `_doc_id_sort_key`) doesn't transfer; amendment number is the next-best
    available signal."""
    return max(
        rows,
        key=lambda pair: (_filed_date_sort_key(pair[0].filed_date), pair[1].amendment_n or 0),
    )
