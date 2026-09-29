"""Line-item (per-asset/per-liability) extraction for a House digital-text
filing -- the item-grain sibling to `columns.py`'s band counts.

`columns.py` deliberately does NOT cluster words into visual rows (its own
docstring: that "is the documented source of low confidence on
managed-account-heavy filings" in the prior `pipeline/financial/` effort).
This module has to, since a line item needs its description paired with its
value -- so it takes on that risk deliberately, with two safety nets:

1. Real cached filings (confirmed this session, e.g. a Senate-style
   custodian/brokerage holding on a House Schedule A) show an asset's
   description can span more than one physical text line, and a reported
   value can itself wrap across a line or page break (`columns.py`'s own
   Buchanan example). Rows are grouped into "blocks" by walking the VALUE
   column's band occurrences (position-tracked, not just counted) and
   attaching every description-column line up to the next value occurrence
   to the current block -- the same "money market fund"-style continuation
   line columns.py's docstring doesn't have to solve, because it never
   needed per-item descriptions at all.
2. `build_line_items.py`'s reconciliation gate is the hard backstop: a
   filing's items only get emitted if their band multiset EXACTLY reproduces
   the already-trusted `asset_band_counts`/`liability_band_counts` that
   `columns.py` already computed and that shipped in
   `financial_disclosures.json`. A filing where this module's row-clustering
   goes wrong in a way that changes the count of some band will be excluded
   from line-item output, not emitted wrong.

Residual, accepted risk (documented rather than silently ignored): the
reconciliation gate confirms band TOTALS match, not that any one
description is paired with its correct value when the page has more than
one item in the same band back-to-back -- a mispairing there would still
reconcile. Manual spot-checks (this session's commit) sampled real
multi-item pages specifically to look for this.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from bands import ASSET_BANDS, LIABILITY_BANDS, BandDef
from extract_text import DocWords, Word
from line_item_bands import band_range

_TOP_TOL = 3.5
_WRAP_TOL = 20.0

_ZERO_LABELS = ("None (or less than $1,001)", "--", "Unascertainable")

# Some PDF vintages' embedded fonts map certain glyphs (confirmed: the "L" in
# "LOCATION:" and "D" in "DESCRIPTION:" continuation labels) to C0 control
# codepoints -- pdfplumber decodes these as literal NUL/control characters
# rather than dropping them, so an uncleaned word can read as
# "L\x00\x00\x00\x00\x00\x00\x00: Boston, MA, US" instead of "LOCATION:
# Boston, MA, US". Stripped at the point every word is collected (not in
# extract_text.py, which columns.py's own trusted band-counting also
# depends on and this session must not touch) so no control character ever
# reaches a line-item description, owner, or type field.
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def _clean_word(text: str) -> str:
    return _CONTROL_CHARS_RE.sub("", text)


def _line(words: list[Word], ref: Word, tol: float = _TOP_TOL) -> list[Word]:
    return [w for w in words if abs(w.top - ref.top) <= tol]


@dataclass
class ScheduleAColumns:
    description: tuple[float, float]
    owner: tuple[float, float]
    value: tuple[float, float]
    header_top: float
    # Schedule A's header is always one physical line in every sample seen
    # this session, so the exclusion window is just that line.
    header_bottom: float = 0.0

    def __post_init__(self) -> None:
        if self.header_bottom == 0.0:
            self.header_bottom = self.header_top


@dataclass
class ScheduleDColumns:
    owner: tuple[float, float]
    description: tuple[float, float]
    form_type: tuple[float, float]
    value: tuple[float, float]
    header_top: float
    # "Amount of" / "Liability" wraps onto a second physical line (confirmed
    # on a real filing this session) -- the exclusion window must cover
    # both, or the wrapped "Liability" word gets collected as a value token
    # and breaks a band that itself wraps across the same page break.
    header_bottom: float = 0.0

    def __post_init__(self) -> None:
        if self.header_bottom == 0.0:
            self.header_bottom = self.header_top + _WRAP_TOL


def _find_schedule_a_columns(words: list[Word]) -> ScheduleAColumns | None:
    """Locate the 'Asset | Owner | Value of Asset | Income...' header line
    and derive all three left-side column x-ranges from its own word
    positions -- same 'never a hardcoded pixel range' principle as
    columns.py, extended to the columns it doesn't need."""
    by_top = sorted(words, key=lambda w: (w.top, w.x0))
    for w in by_top:
        if w.text.lower() != "value":
            continue
        line = sorted(_line(by_top, w), key=lambda x: x.x0)
        texts = [x.text.lower() for x in line]
        if "of" not in texts or "asset" not in texts or "owner" not in texts:
            continue
        w_of = next((x for x in line if x.text.lower() == "of"), None)
        if w_of is None:
            continue
        w_asset_val = next((x for x in line if x.text.lower() == "asset" and x.x0 > w_of.x0), None)
        w_owner = next((x for x in line if x.text.lower() == "owner"), None)
        w_asset_desc = next((x for x in line if x.text.lower() == "asset" and x.x0 < w.x0), None)
        if w_asset_val is None or w_owner is None or w_asset_desc is None:
            continue
        after_val = [x for x in line if x.x0 > w_asset_val.x1]
        return ScheduleAColumns(
            description=(w_asset_desc.x0 - 2.0, w_owner.x0 - 3.0),
            owner=(w_owner.x0 - 2.0, w.x0 - 3.0),
            value=(w.x0 - 2.0, (after_val[0].x0 - 3.0) if after_val else (w.x0 + 250.0)),
            header_top=w.top,
        )
    return None


def _find_schedule_d_columns(words: list[Word], page_width: float) -> ScheduleDColumns | None:
    """Locate 'Owner | Creditor | Date Incurred | Type | Amount of
    Liability' -- Creditor is the description column, Type is the reported
    liability type."""
    by_top = sorted(words, key=lambda w: (w.top, w.x0))
    for w in by_top:
        if w.text.lower() != "owner":
            continue
        line = sorted(_line(by_top, w), key=lambda x: x.x0)
        texts = [x.text.lower() for x in line]
        if "creditor" not in texts or "type" not in texts:
            continue
        w_creditor = next((x for x in line if x.text.lower() == "creditor"), None)
        # "Date"/"incurred" sits between Creditor and Type.
        w_type = next((x for x in line if x.text.lower() == "type" and x.x0 > w_creditor.x1), None)
        # "Amount" may wrap to the next line, same as columns.py's own liability header.
        w_amount = next(
            (x for x in words if x.text.lower() == "amount" and 0 <= (x.top - w.top) <= _WRAP_TOL and x.x0 > w_type.x1),
            None,
        )
        if w_creditor is None or w_type is None or w_amount is None:
            continue
        return ScheduleDColumns(
            owner=(w.x0 - 2.0, w_creditor.x0 - 3.0),
            description=(w_creditor.x0 - 2.0, w_type.x0 - 3.0),
            form_type=(w_type.x0 - 2.0, w_amount.x0 - 3.0),
            value=(w_amount.x0 - 2.0, page_width - 5.0),
            header_top=w.top,
        )
    return None


@dataclass
class LineItem:
    kind: str
    description: str
    band_label: str
    lo: float | None
    hi: float | None
    owner: str | None
    form_type: str | None


@dataclass
class ExtractionResult:
    items: list[LineItem] = field(default_factory=list)
    band_counts: dict[str, int] = field(default_factory=dict)
    # Descriptions this module had to trim noise from (see `_clean_description`)
    # -- reported by build_line_items.py's run summary, not a reconciliation
    # signal (trimming doesn't touch band_counts, unlike Session 1's
    # "flag rather than guess" for a value it can't determine at all -- a
    # description that's merely noisy at the tail still has a real, known
    # value/band, so the item ships, just with the noise cut off).
    trimmed_count: int = 0


# The page's LAST item's description block runs until the next value
# occurrence -- if nothing follows on the page, that's until the page ends,
# which on a "mixed page" (this schedule ends, the next one starts lower on
# the same page -- common) means it silently absorbs the next schedule's own
# header and rows (confirmed on a real filing this session: Schedule A's
# last item on a page picked up "B: TRANSACTIONS ... D: LIABILITIES owner
# creditor ..."). Rather than discard the whole item over a noisy tail
# (tried and rejected this session -- a naive length/keyword cutoff that
# drops the item outright turned out to false-positive on genuinely long,
# legitimate multi-line descriptions far more often than it caught real
# noise), cut the description off at the first such boundary marker and
# keep everything before it. Case-insensitive for the same cmap-flip reason
# as everywhere else in this module ("Schedule" -> "ScheDule").
_NOISE_BOUNDARY_RE = re.compile(
    # The literal word "Schedule" sits just left of the description column
    # (confirmed: x0=22.5 vs. the column's own ~23.5 left edge) so it's
    # never actually captured -- what shows up is the next schedule's own
    # "<letter>: <name>" label, e.g. "b: tranSactionS", "D: liabilitieS".
    r"\b[a-f]:\s*(transactions|earned\s*income|liabilities|positions|agreements)\b"
    r"|legislative resource center|clerk of the house",
    re.IGNORECASE,
)


def _clean_description(description: str) -> tuple[str, bool]:
    """Returns `(cleaned, trimmed)`."""
    m = _NOISE_BOUNDARY_RE.search(description)
    if m is None:
        return description, False
    cleaned = description[: m.start()].strip()
    return (cleaned or description), True


@dataclass(frozen=True)
class _PWord:
    """A word plus its page index -- `top` alone resets to ~0 on every new
    page, so any cross-page ordering/grouping must sort on `(page, top)`,
    never bare `top` (a page-2 line at top=100 must never be treated as
    'before' a page-1 line at top=200)."""

    page: int
    top: float
    x0: float
    text: str

    @property
    def key(self) -> tuple[int, float]:
        return (self.page, round(self.top, 1))


def _band_occurrences(value_words: list[_PWord], bands: list[BandDef]) -> list[tuple[str, _PWord]]:
    """Every band occurrence in `value_words` (already in document order), as
    (label, starting_word) -- literal substring search over the joined text,
    same as `bands.count_bands`, but position-tracked: each match is mapped
    back to the word whose character span contains the match's start, so the
    caller knows which visual row a band instance began on even when its own
    text later wraps across a line/page break. Joining happens per-page (a
    band literal never legitimately spans two DIFFERENT pages' worth of a
    joining space) is unnecessary here since `columns.py`'s own confirmed
    Buchanan case wraps mid-band-string with no separator lost either way;
    matching stays correct because word order is already page-then-top-then-x0.
    """
    joined = " ".join(w.text for w in value_words)
    offsets: list[tuple[int, int, _PWord]] = []
    pos = 0
    for w in value_words:
        offsets.append((pos, pos + len(w.text), w))
        pos += len(w.text) + 1  # +1 for the joining space

    labels = sorted((b.label for b in bands), key=len, reverse=True)
    labels += list(_ZERO_LABELS)

    occurrences: list[tuple[int, str]] = []
    for label in labels:
        start = 0
        while True:
            idx = joined.find(label, start)
            if idx == -1:
                break
            occurrences.append((idx, label))
            start = idx + len(label)

    occurrences.sort(key=lambda o: o[0])
    out: list[tuple[str, _PWord]] = []
    for idx, label in occurrences:
        word = next((w for (s, e, w) in offsets if s <= idx < e), None)
        if word is not None:
            out.append((label, word))
    return out


def _extract_schedule(
    doc: DocWords,
    phrase_check,
    find_columns,
    bands: list[BandDef],
    kind: str,
) -> ExtractionResult | None:
    """`find_columns(words, page_width) -> columns-or-None`. Returns `None`
    if the schedule's columns were never located on any tagged page (can't
    safely attempt clustering); an empty `ExtractionResult` if the schedule
    genuinely has zero line items."""
    desc_words: list[_PWord] = []
    value_words: list[_PWord] = []
    owner_by_key: dict[tuple[int, float], str] = {}
    type_by_key: dict[tuple[int, float], str] = {}
    columns_found = False
    # A continuation page of a multi-page schedule doesn't repeat the header
    # row -- same as columns.py's own `last_asset_bounds`/`last_liability_bounds`,
    # reuse the last-located columns rather than skipping the page outright
    # (skipping it would silently drop every item on it, undercounting).
    last_cols = None

    for page in doc.pages:
        if not phrase_check(page.text.lower()):
            continue
        cols = find_columns(page.words, page.width)
        if cols is not None:
            last_cols = cols
        elif last_cols is not None:
            cols = last_cols
        else:
            continue
        columns_found = True
        for w in sorted(page.words, key=lambda w: (w.top, w.x0)):
            # The header row itself repeats "Asset"/"Owner"/"Value of
            # Asset"/... on every page and sits inside these same x-ranges --
            # collecting it would inject "value of asset" literally into the
            # value-token stream, breaking a band that wraps across the page
            # break right at the header (confirmed on a real filing this
            # session: "$50,001 -" ending one page, "$100,000" starting the
            # next, with the repeated header text in between).
            if cols.header_top - _TOP_TOL <= w.top <= cols.header_bottom + _TOP_TOL:
                continue
            cleaned_text = _clean_word(w.text)
            if not cleaned_text:
                continue  # a word that was ONLY control characters
            pw = _PWord(page.page_index, w.top, w.x0, cleaned_text)
            if cols.description[0] <= w.x0 < cols.description[1]:
                desc_words.append(pw)
            if cols.value[0] <= w.x0 < cols.value[1]:
                value_words.append(pw)
            if cols.owner[0] <= w.x0 < cols.owner[1]:
                owner_by_key.setdefault(pw.key, "")
                owner_by_key[pw.key] += (" " if owner_by_key[pw.key] else "") + cleaned_text
            form_type_bounds = getattr(cols, "form_type", None)
            if form_type_bounds and form_type_bounds[0] <= w.x0 < form_type_bounds[1]:
                type_by_key.setdefault(pw.key, "")
                type_by_key[pw.key] += (" " if type_by_key[pw.key] else "") + cleaned_text

    if not columns_found:
        return None

    occurrences = _band_occurrences(value_words, bands)
    if not occurrences:
        return ExtractionResult()

    # Group description words by physical line (page, top), then assign
    # each line to the most recent value-occurrence row at or before it
    # WITHIN THE SAME PAGE (a page's own first item can't inherit a
    # continuation line from the previous page's last item).
    desc_by_key: dict[tuple[int, float], str] = {}
    for w in sorted(desc_words, key=lambda w: w.key):
        desc_by_key.setdefault(w.key, "")
        desc_by_key[w.key] += (" " if desc_by_key[w.key] else "") + w.text

    occ_keys = sorted({w.key for _, w in occurrences})
    blocks: dict[tuple[int, float], list[str]] = {k: [] for k in occ_keys}
    for key in sorted(desc_by_key):
        candidates = [k for k in occ_keys if k[0] == key[0] and k[1] <= key[1]]
        if candidates:
            blocks[max(candidates)].append(desc_by_key[key])

    result = ExtractionResult()
    for label, word in occurrences:
        description = re.sub(r"\s+", " ", " ".join(blocks.get(word.key, []))).strip()
        description, trimmed = _clean_description(description)
        if trimmed:
            result.trimmed_count += 1
        lo, hi = band_range(label, kind)
        result.items.append(
            LineItem(
                kind=kind,
                description=description,
                band_label=label,
                lo=lo,
                hi=hi,
                owner=owner_by_key.get(word.key) or None,
                form_type=type_by_key.get(word.key) or None,
            )
        )
        result.band_counts[label] = result.band_counts.get(label, 0) + 1
    return result


def extract_assets(doc: DocWords) -> ExtractionResult | None:
    return _extract_schedule(
        doc,
        lambda text: "value of asset" in text,
        lambda words, width: _find_schedule_a_columns(words),
        ASSET_BANDS,
        "asset",
    )


def extract_liabilities(doc: DocWords) -> ExtractionResult | None:
    return _extract_schedule(
        doc,
        lambda text: "amount of" in text and "liability" in text,
        _find_schedule_d_columns,
        LIABILITY_BANDS,
        "liability",
    )
