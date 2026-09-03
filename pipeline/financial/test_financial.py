"""Tests for the House financial-disclosure parser.

Run:  python -m pytest pipeline/financial/test_financial.py  (from the venv)
"""

import pytest

from bands import parse_band
from adapter import adapt
from parse_house import ParsedDisclosure


@pytest.mark.parametrize("text,low,high,open_ended,recognized", [
    ("$1,001 - $15,000", 1001, 15000, False, True),
    ("$5,000,001 - $25,000,000", 5000001, 25000000, False, True),
    ("$1 - $1,000", 1, 1000, False, True),
    # wrapped range that lost its dash token
    ("$5,000,001 $25,000,000", 5000001, 25000000, False, True),
    # open-ended top band: no fabricated upper bound / midpoint
    ("Over $50,000,000", 50000001, None, True, True),
    ("$50,000,000 +", 50000001, None, True, True),
    # figure present but not an EIGA edge -> recognized False
    ("$40,000 - $60,000", 40000, 60000, False, False),
])
def test_parse_band(text, low, high, open_ended, recognized):
    b = parse_band(text)
    assert b is not None
    assert (b.low, b.high, b.open_ended) == (low, high, open_ended)
    assert b.recognized is recognized


@pytest.mark.parametrize("text", ["None", "Undetermined", "", "N/A", "Tax-Deferred"])
def test_parse_band_nullish(text):
    assert parse_band(text) is None


def test_open_ended_has_no_midpoint():
    assert parse_band("Over $50,000,000").midpoint is None


def test_midpoint_is_mean():
    assert parse_band("$1,001 - $15,000").midpoint == pytest.approx(8000.5)


def _pd(**kw):
    base = dict(filing_id="1", name="Hon. Test", state_district="CA01",
                filing_type="Annual Report", filing_year=2024, filing_date="",
                assets=[], liabilities=[], section_status={"A": "parsed"},
                warnings=[], text_chars=5000, page_count=3)
    base.update(kw)
    return ParsedDisclosure(**base)


def test_scanned_filing_yields_no_estimate():
    row = adapt(_pd(section_status={"A": "scanned"}, text_chars=0),
               bioguide_id="T000001", year=2024, doc_id="9", source_url="u")
    assert row["net_worth_estimate"] is None
    assert row["parse_confidence"] == "none"
    assert row["needs_review"] is True


def test_index_filing_type_fallback():
    row = adapt(_pd(filing_type=None), bioguide_id="T000001", year=2024,
               doc_id="9", source_url="u", index_filing_type="O")
    assert row["filing_type"] == "annual"
