"""Fetch Senate eFD (`efdsearch.senate.gov`) search results + individual
electronic ("annual"/HTML) report pages.

Confirmed empirically (2026-09-24 session, via the site's own served HTML
and a live round-trip against the real endpoint):

- `GET /search/home/` on a fresh session serves the click-through agreement
  page and sets a `csrftoken` cookie. Its `<form id="agreement_form" ...>`
  POSTs back to the same URL with `prohibition_agreement=1` +
  `csrfmiddlewaretoken=<token>` -- there is no separate "agree" endpoint.
  Per this session's decision, the script submits this itself (the same POST
  a human visitor's browser sends on checking the box), not a workaround of
  any technical access control.
- Once agreed, `POST /search/report/data/` (same session) is a DataTables
  JSON endpoint. The server caps `length` at 100 rows/page regardless of
  what's requested, so this module always paginates in `_PAGE_SIZE` steps.
- Confirmed working filter values: `filer_types=[1]` selects the "Senator"
  role (anyone who held the office at filing time -- current or since
  departed, NOT limited to currently-serving), `report_types=[7]` is the
  bucket the UI's "Annual" checkbox submits (covers Annual Report, its
  amendments, New Filer Report, and Candidate Report alike -- caller filters
  further, see `senate_match.py`). `senator_state` (two-letter code) scopes
  results to one state; used by `senate_match.py`'s disambiguation fallback,
  not by the main bulk pull.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass
from pathlib import Path

import requests

RAW_DIR = Path(__file__).resolve().parents[1] / "raw" / "senate-financial-disclosures"
BASE_URL = "https://efdsearch.senate.gov"
HOME_URL = f"{BASE_URL}/search/home/"
SEARCH_DATA_URL = f"{BASE_URL}/search/report/data/"

HEADERS = {
    "User-Agent": "congress-ideology-research/1.0 (+https://github.com/; contact: corby.hobbs@gmail.com)"
}

DOWNLOAD_DELAY_SEC = 0.4  # same politeness delay convention as fetch.py
_PAGE_SIZE = 100  # server-enforced max `length` per page, confirmed empirically

FILER_TYPE_SENATOR = 1
REPORT_TYPE_ANNUAL_BUCKET = 7  # the UI's "Annual" checkbox -- see module docstring

_CSRF_INPUT_RE = re.compile(r'name="csrfmiddlewaretoken"\s+value="([^"]+)"')


@dataclass
class SearchRow:
    first: str
    last: str
    office: str
    report_label: str
    report_url: str  # relative, e.g. "/search/view/annual/<uuid>/"
    filed_date: str  # as served, MM/DD/YYYY


def new_session() -> requests.Session:
    """A fresh `requests.Session()` with the site's agreement already
    submitted, ready for `search()`/`fetch_report_html()`. Re-agreeing every
    run rather than persisting a cookie jar keeps this stateless between
    runs, matching `fetch.py`'s own "no persisted auth state" shape."""
    session = requests.Session()
    resp = session.get(HOME_URL, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    m = _CSRF_INPUT_RE.search(resp.text)
    if not m:
        raise RuntimeError("senate_fetch: could not find csrfmiddlewaretoken on the agreement page -- site markup may have changed")
    token = m.group(1)
    agree_resp = session.post(
        HOME_URL,
        headers={**HEADERS, "Referer": HOME_URL},
        data={"prohibition_agreement": "1", "csrfmiddlewaretoken": token},
        timeout=30,
    )
    agree_resp.raise_for_status()
    if "agreement_form" in agree_resp.text:
        raise RuntimeError("senate_fetch: agreement POST did not clear the gate (still seeing agreement_form)")
    return session


def _search_page(
    session: requests.Session,
    start: int,
    *,
    last_name: str = "",
    first_name: str = "",
    senator_state: str = "",
) -> tuple[list[list[str]], int]:
    csrf = session.cookies.get("csrftoken")
    if not csrf:
        raise RuntimeError("senate_fetch: no csrftoken cookie on session -- call new_session() first")
    body = {
        "draw": "1",
        "start": str(start),
        "length": str(_PAGE_SIZE),
        "report_types": f"[{REPORT_TYPE_ANNUAL_BUCKET}]",
        "filer_types": f"[{FILER_TYPE_SENATOR}]",
        "submitted_start_date": "01/01/2012 00:00:00",
        "submitted_end_date": "",
        "candidate_state": "",
        "senator_state": senator_state,
        "office_id": "",
        "first_name": first_name,
        "last_name": last_name,
        "csrfmiddlewaretoken": csrf,
    }
    resp = session.post(
        SEARCH_DATA_URL,
        headers={**HEADERS, "X-CSRFToken": csrf, "Referer": f"{BASE_URL}/search/"},
        data=body,
        timeout=60,
    )
    resp.raise_for_status()
    payload = resp.json()
    return payload["data"], payload["recordsTotal"]


_LINK_RE = re.compile(r'<a href="([^"]+)"[^>]*>([^<]*)</a>')


def _parse_row(raw: list[str]) -> SearchRow:
    first, last, office, link_html, filed_date = raw
    m = _LINK_RE.search(link_html)
    if not m:
        raise ValueError(f"senate_fetch: could not parse report link cell: {link_html!r}")
    url, label = m.group(1), m.group(2).strip()
    return SearchRow(first=first, last=last, office=office, report_label=label, report_url=url, filed_date=filed_date)


def search(
    session: requests.Session,
    *,
    last_name: str = "",
    first_name: str = "",
    senator_state: str = "",
) -> list[SearchRow]:
    """Paginate `/search/report/data/` to exhaustion for the given filters
    (Senator-role + the "Annual" report-type bucket are always applied --
    see module docstring). No caching: this is metadata, cheap to refetch,
    and a rerun should always see the latest filing list."""
    rows: list[SearchRow] = []
    start = 0
    while True:
        page, total = _search_page(session, start, last_name=last_name, first_name=first_name, senator_state=senator_state)
        rows.extend(_parse_row(r) for r in page)
        start += _PAGE_SIZE
        if start >= total:
            break
    return rows


def _report_cache_path(kind: str, report_id: str) -> Path:
    d = RAW_DIR / kind
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{report_id}.html"


_UUID_RE = re.compile(r"/search/view/(annual|paper)/([0-9a-fA-F-]+)/?")


def report_uuid(report_url: str) -> str:
    m = _UUID_RE.search(report_url)
    if not m:
        raise ValueError(f"senate_fetch.report_uuid: not a report URL: {report_url!r}")
    return m.group(2)


def fetch_report_html(report_url: str, session: requests.Session) -> str:
    """Download (or reuse cached) the HTML for an `/annual/` report page.
    Caller is expected to have already filtered to `annual`-kind URLs --
    raises if given a `paper` URL, since that's a scanned-image viewer, not
    an HTML report (Phase 3b's problem, not this module's)."""
    m = _UUID_RE.search(report_url)
    if not m or m.group(1) != "annual":
        raise ValueError(f"senate_fetch.fetch_report_html: not an /annual/ report URL: {report_url!r}")
    report_id = m.group(2)
    path = _report_cache_path("annual", report_id)
    if path.exists() and path.stat().st_size > 0:
        return path.read_text()
    resp = session.get(f"{BASE_URL}{report_url}", headers=HEADERS, timeout=60)
    resp.raise_for_status()
    path.write_text(resp.text)
    time.sleep(DOWNLOAD_DELAY_SEC)
    return resp.text
