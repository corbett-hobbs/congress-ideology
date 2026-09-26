"""Checkbox-grid legacy form extraction -- shared House + Senate.

Confirmed this session (both chambers, hand-filled and computer-typed,
across the entire 2012-2026 span): a pre-electronic-era form where a value
isn't printed text at all -- it's an X mark in one of ~13 fixed value-tier
rows. Structure (confirmed against two real House pages, Brett Guthrie's
2015 Schedule A, doc 9109119): Block A (asset name) runs across up to ~14
narrow columns, one per asset; Block B/C/D each print their own fixed
tier-row label list ONCE, to the right of a grid whose columns are the SAME
asset positions as Block A. A page with only one asset (a long description)
just leaves the other columns blank -- it's the same grid either way, not a
different layout.

This module knows nothing about where its input image came from (House's
pdf2image-rasterized PDF page or Senate's directly-fetched GIF) -- same
"produce a chamber/method-agnostic shape" convention as extract_text.py /
extract_ocr.py / columns.py.
"""

from __future__ import annotations

from dataclasses import dataclass

import pytesseract
from PIL import Image

from bands import ASSET_BANDS, LIABILITY_BANDS, BandDef, value_total

# Row positioning deliberately does NOT use OCR text-matching against each
# tier label (tried and rejected this session): Tesseract can misread a
# boundary digit ("$1,001-$15,000" read as "$1,001-$18,000", a 5->8
# confusion), and character-overlap fuzzy matching (difflib) can't safely
# absorb that -- tested numerically and found that two genuinely DIFFERENT
# bands can score above a workable similarity threshold purely from shared
# structural characters (e.g. "$1,001-$15,000" vs "$15,001-$50,000" scored
# 0.897, higher than a single-digit-noise pair's own 0.929), so fuzzy
# matching risks silently assigning the wrong dollar band -- worse than the
# noise problem it was meant to solve.
#
# Instead: the tier list's row COUNT and ORDER are fixed (a government
# form, not free text), so row position is derived by anchoring on one
# easy, non-numeric word -- "None" (the list's first row) -- found by
# OCR-confirming each candidate ruled-line band in turn, then taking the
# next N-1 REAL detected bands directly (see locate_tier_rows_by_geometry).
# Interpolating interior rows evenly from a single anchor was tried and
# rejected: real row spacing on a live page is not uniform (one gap
# measured 99px against a ~40px median, a genuinely missed ruled line
# merging two rows), so interpolation drifts out of alignment after the
# first irregular gap -- see _split_wide_gaps, which fixes that case by
# splitting oversized gaps instead of assuming uniform spacing.

# Grayscale value below which a pixel counts as "ink" for line/mark
# detection. Confirmed against a real scanned page this session.
_DARK_THRESHOLD = 128

# A ruled line is a row/column whose dark-pixel count clears this fraction
# of the sampled width/height of the region being scanned. Validated live
# (56 candidate rows found on a real page, clustering exactly where visual
# inspection shows ruled lines). This exact value matters, not just its
# ballpark: the stricter default previously here (0.6) missed several real
# dividing lines that 0.5 finds correctly (confirmed by cross-checking
# against a manual visual read of the same page) -- a missed line merges
# two rows into one oversized band and throws off every row after it.
_LINE_MIN_COVERAGE = 0.5
_LINE_SCAN_STEP = 4


def _grayscale_pixels(image: Image.Image):
    gray = image.convert("L")
    return gray.load(), gray.width, gray.height


def find_ruled_lines(
    image: Image.Image,
    axis: str,
    region: tuple[int, int, int, int] | None = None,
    min_coverage: float = _LINE_MIN_COVERAGE,
    step: int = _LINE_SCAN_STEP,
) -> list[int]:
    """Positions (image coordinates) of ruled grid lines along `axis`
    ("row" or "col") within `region` (x0, y0, x1, y1), or the whole image
    if `region` is None. Adjacent hits are merged into a single line
    (a ruled line is usually a few pixels thick at typical scan DPI)."""
    px, w, h = _grayscale_pixels(image)
    x0, y0, x1, y1 = region if region else (0, 0, w, h)

    hits: list[int] = []
    if axis == "row":
        width_samples = max(1, (x1 - x0) // step)
        for y in range(y0, y1):
            cnt = sum(1 for x in range(x0, x1, step) if px[x, y] < _DARK_THRESHOLD)
            if cnt >= min_coverage * width_samples:
                hits.append(y)
    elif axis == "col":
        height_samples = max(1, (y1 - y0) // step)
        for x in range(x0, x1):
            cnt = sum(1 for y in range(y0, y1, step) if px[x, y] < _DARK_THRESHOLD)
            if cnt >= min_coverage * height_samples:
                hits.append(x)
    else:
        raise ValueError(f"axis must be 'row' or 'col', got {axis!r}")

    # Merge runs of consecutive/near-consecutive hits into one line each,
    # at the run's midpoint -- a real ruled line is a few pixels thick, not
    # a single-pixel-wide hit.
    merged: list[int] = []
    run: list[int] = []
    for pos in hits:
        if run and pos - run[-1] > 2:
            merged.append(sum(run) // len(run))
            run = []
        run.append(pos)
    if run:
        merged.append(sum(run) // len(run))
    return merged


# NOTE: whole-page/whole-region multi-line OCR (grouping words via
# Tesseract's own block_num/par_num/line_num) was tried here and removed --
# confirmed live that Tesseract's default page segmentation cannot reliably
# line-group this dense ruled-grid layout (two far-apart section labels
# merged into one nonsense span; a word clearly legible in a screenshot
# wasn't found anywhere in a whole-region OCR pass). Every OCR call in this
# module instead operates on a small, isolated, pre-cropped region via
# `_ocr_single_line()` below -- see `locate_tier_rows_by_geometry`'s
# docstring.


# Literal tier-row labels as printed on the checkbox form's Value-of-Asset
# block (Block B), in print order, mapped to the exact EIGA band label
# bands.py uses -- the printed form omits the spaces around the dash that
# bands.py's labels use (e.g. "$1,001-$15,000" vs "$1,001 - $15,000"), so
# this is a translation table, not a duplicate band table. None means "not
# a reportable band" (the "None"/"$1-$1,000" rows -- the latter sits below
# the $1,001 reporting threshold and is never expected to carry a real
# mark). "SPOUSAL_INDEPENDENT" is the same EIGA spousal-holding carve-out
# senate_html.py already handles for the HTML path's own phrasing of it --
# third format this session has found it in.
SPOUSAL_INDEPENDENT = "SPOUSAL_INDEPENDENT"

# (display label, EIGA band / None / SPOUSAL_INDEPENDENT) -- print order,
# row 0 must be the top anchor word, the last row must contain the bottom
# anchor word (see ASSET_TOP_ANCHOR/ASSET_BOTTOM_ANCHOR below).
ASSET_TIER_ROW_LABELS: list[tuple[str, str | None]] = [
    ("None", None),
    ("$1-$1,000", None),
    ("$1,001-$15,000", "$1,001 - $15,000"),
    ("$15,001-$50,000", "$15,001 - $50,000"),
    ("$50,001-$100,000", "$50,001 - $100,000"),
    ("$100,001-$250,000", "$100,001 - $250,000"),
    ("$250,001-$500,000", "$250,001 - $500,000"),
    ("$500,001-$1,000,000", "$500,001 - $1,000,000"),
    ("$1,000,001-$5,000,000", "$1,000,001 - $5,000,000"),
    ("$5,000,001-$25,000,000", "$5,000,001 - $25,000,000"),
    ("$25,000,001-$50,000,000", "$25,000,001 - $50,000,000"),
    ("Over $50,000,000", "Over $50,000,000"),
    ("Spouse/DC Asset over $1,000,000*", SPOUSAL_INDEPENDENT),
]

# Plain-English, non-numeric anchor word for row 0 -- OCR never has to read
# a dollar figure to position a row, just this one word, and only once
# (see locate_tier_rows_by_geometry: after row 0 is found, the rest follow
# from ruled-line position, not further OCR matching).
ASSET_TOP_ANCHOR = "None"


_ROW_EDGE_MARGIN = 5  # trim this many px off each detected band's top/bottom before OCR


def _ocr_single_line(image: Image.Image, region: tuple[int, int, int, int], margin: int = 0) -> str:
    """OCR one isolated, tightly-cropped text line with --psm 7 (Tesseract's
    single-text-line mode). Confirmed live this session: whole-page/whole-
    region OCR fails to find this same text at all (Tesseract's default
    segmentation can't parse this dense ruled-grid layout), but an isolated
    single-line crop reads correctly -- this is why every OCR call in this
    module operates on a small crop, never the whole page. `margin` trims
    the crop's top/bottom edges before OCR -- also confirmed necessary live:
    a crop taken exactly at a ruled-line boundary (e.g. a band straight from
    find_ruled_lines) reads as garbage or empty, since the line itself sits
    right at the edge; trimming a few px clear of it fixes the read."""
    x0, y0, x1, y1 = region
    if margin:
        y0, y1 = y0 + margin, y1 - margin
    return pytesseract.image_to_string(image.crop((x0, y0, x1, y1)), config="--psm 7").strip()


def _split_wide_gaps(lines: list[int]) -> list[int]:
    """A missed ruled line shows up as one gap much wider than its
    neighbors, not as a genuinely wider row -- confirmed live: a real page
    had a 99px gap against a ~40px median where two rows ("$1-$1,000" and
    "$1,001-$15,000") were merged into one band by a single undetected
    divider, throwing every subsequent row one position out of alignment.
    Splits any gap wider than 1.5x the median gap into `round(gap /
    median)` evenly-spaced sub-lines. A gap within normal variance (the
    real grid is not perfectly uniform even where no line was missed) is
    left untouched."""
    if len(lines) < 3:
        return lines
    gaps = [b - a for a, b in zip(lines, lines[1:])]
    sorted_gaps = sorted(gaps)
    mid = len(sorted_gaps) // 2
    median = sorted_gaps[mid] if len(sorted_gaps) % 2 else (sorted_gaps[mid - 1] + sorted_gaps[mid]) / 2
    if not median:
        return lines

    out = [lines[0]]
    for a, b in zip(lines, lines[1:]):
        gap = b - a
        n = round(gap / median)
        if gap > 1.5 * median and n > 1:
            for i in range(1, n):
                out.append(round(a + i * gap / n))
        out.append(b)
    return out


def locate_tier_rows_by_geometry(
    image: Image.Image,
    label_column: tuple[int, int],
    search_region: tuple[int, int, int, int],
    labels: list[tuple[str, str | None]],
    top_anchor: str,
    min_coverage: float = _LINE_MIN_COVERAGE,
    step: int = _LINE_SCAN_STEP,
) -> list[tuple[str | None, int, int]] | None:
    """Geometry-first row location: find ruled horizontal lines within
    `search_region` (a generous window expected to contain this block's
    tier-row grid), and OCR each candidate line-pair's `label_column`
    (x0, x1) strip in isolation (`--psm 7` with edge-margin trimming, per
    `_ocr_single_line`) until one reads as `top_anchor` (e.g. "None") --
    that candidate is row 0. The remaining N-1 rows are the NEXT N-1
    detected bands, taken directly -- not evenly interpolated. Confirmed
    live this matters: row spacing on a real page is NOT uniform (one gap
    measured 99px against a ~40px median -- genuine form layout, not a
    detection error), so interpolating from a fixed spacing drifts out of
    alignment after the first irregular gap while the real detected lines
    (at the validated `_LINE_MIN_COVERAGE`/`_LINE_SCAN_STEP`) remain
    correct throughout. Returns None (flag, don't guess) if `top_anchor`
    isn't found, or if fewer than `len(labels)` bands remain after it."""
    x0, x1 = label_column
    lines = find_ruled_lines(image, "row", region=search_region, min_coverage=min_coverage, step=step)
    if len(lines) < 2:
        return None
    lines = _split_wide_gaps(lines)

    bands = list(zip(lines, lines[1:]))
    anchor_idx = None
    for i, (top, bottom) in enumerate(bands):
        text = _ocr_single_line(image, (x0, top, x1, bottom), margin=_ROW_EDGE_MARGIN)
        if top_anchor.lower() in text.lower():
            anchor_idx = i
            break
    if anchor_idx is None:
        return None

    n = len(labels)
    if anchor_idx + n > len(bands):
        return None

    rows: list[tuple[str | None, int, int]] = []
    for i, (_display, band) in enumerate(labels):
        top, bottom = bands[anchor_idx + i]
        rows.append((band, top, bottom))
    return rows


# Search-region defaults below are fractions of page width/height, not
# absolute pixels: both validation pages this session (different filers,
# different asset layouts) rasterized to the exact same 1696x2200 at
# extract_ocr.py's standard 200 DPI -- this is a fixed-layout government
# form at a fixed scan resolution, so a page-proportional region is the
# right level of "generous window," consistent with how
# locate_tier_rows_by_geometry already tolerates a generous search_region
# and finds exact positions from ruled-line geometry within it, not from
# the region's exact bounds. Tuned from a 1696x2200 page; unseen only if a
# future page rasterizes at a materially different DPI or page size.
ASSET_HEADER_Y_FRAC = (0.078, 0.224)  # Block A's asset-name header strip
ASSET_ROW_SEARCH_Y_FRAC = (0.204, 0.614)  # generous window containing Block B's tier-row grid
ASSET_LABEL_COLUMN_X_FRAC = (0.522, 0.619)  # Block B's printed tier-label text strip, common layout
ASSET_GRID_X_FRAC = (0.088, 0.518)  # asset-name/checkbox columns, left of the label text strip

# This form is computer-generated per filing, not printed on a fixed-width
# template -- confirmed live: a page with fewer used asset columns (an
# early page of a filing, which also carries a marginal instructions panel
# ASSET_ROW_SEARCH_Y_FRAC's sibling constants don't need to know about) has
# a genuinely NARROWER checkbox grid, so its tier-label text sits at a
# completely different x position (measured ~x=420-560 on one such page vs
# ~x=885-1050 -- ASSET_LABEL_COLUMN_X_FRAC's own value -- on a wider,
# later continuation page). Only the left few asset columns are guaranteed
# to exist on every page regardless of that variation, so row-LINE
# detection (which just needs ink coverage, not label text) is scoped to
# this narrow, always-present strip rather than to the label column at all.
_ROW_LINE_PROBE_X_FRAC = (0.088, 0.176)


def _frac_region(image: Image.Image, y_frac: tuple[float, float]) -> tuple[int, int]:
    return round(y_frac[0] * image.height), round(y_frac[1] * image.height)


def _frac_x(image: Image.Image, x_frac: tuple[float, float]) -> tuple[int, int]:
    return round(x_frac[0] * image.width), round(x_frac[1] * image.width)


def find_asset_columns(
    image: Image.Image,
    y_span: tuple[int, int],
    x_region: tuple[int, int] | None = None,
) -> list[int]:
    """Positions of the asset-grid's vertical ruled lines, scoped to
    `y_span` (a row band's own top/bottom, as already found by
    `locate_tier_rows_by_geometry` -- NOT a hardcoded region). Confirmed
    live this matters: scanning column lines over a tall region spanning
    multiple blocks (header + B + C + D) finds only the page's outer
    border, because real column dividers don't run solid through the gaps
    between blocks; scoped to one row's own height, they're unambiguous
    (16 clean lines found on a real page, exactly matching a manual count
    of its asset-name columns plus one trailing ID-number column)."""
    x0, x1 = x_region if x_region else _frac_x(image, ASSET_GRID_X_FRAC)
    y0, y1 = y_span
    return find_ruled_lines(image, "col", region=(x0, y0, x1, y1))


# Dark-pixel fraction thresholds for one grid cell's interior (border-
# trimmed via `margin`, same reasoning as `_ocr_single_line`'s margin: a
# crop taken flush against a ruled line picks up the line itself as ink).
# Confirmed live: an empty cell reads exactly 0.0, a handwritten X mark
# reads 0.3-0.4 -- a wide gap, so the ambiguous band between the two
# thresholds is a safety margin for noise (stray pen bleed, scan
# artifacts, a partial/faint mark), not a boundary expected to see much
# real traffic.
_CELL_MARK_LOW = 0.08
_CELL_MARK_HIGH = 0.18
_CELL_MARGIN = 6

# Same ink-density technique applied to Block A's header strip for one
# column: distinguishes a genuinely blank grid slot (no asset in this
# column at all) from a filled one, without needing to OCR the asset name
# itself -- net worth only needs per-band counts, never the name string.
# Confirmed live: blank columns measured ~0.07-0.08 ink, filled columns
# ~0.13-0.29 -- lower contrast than the checkbox marks (ruled lines and
# faint artifacts contribute some baseline even when blank), but still a
# clear gap at this threshold.
_COLUMN_CONTENT_THRESHOLD = 0.10
_COLUMN_CONTENT_MARGIN = 3


def _dark_fraction(image: Image.Image, region: tuple[int, int, int, int], margin: int) -> float:
    px, _w, _h = _grayscale_pixels(image)
    x0, y0, x1, y1 = region
    if margin:
        x0, x1, y0, y1 = x0 + margin, x1 - margin, y0 + margin, y1 - margin
    total = 0
    dark = 0
    for x in range(x0, x1):
        for y in range(y0, y1):
            total += 1
            if px[x, y] < _DARK_THRESHOLD:
                dark += 1
    return dark / total if total else 0.0


def classify_cell(
    image: Image.Image,
    row_bounds: tuple[int, int],
    col_bounds: tuple[int, int],
    margin: int = _CELL_MARGIN,
) -> bool | None:
    """Whether one grid cell (row_bounds x col_bounds) contains a mark.
    True/False for a clear read, None for "flag rather than guess" -- an
    ink density that lands between the two thresholds, not clearly a mark
    or clearly empty."""
    top, bottom = row_bounds
    left, right = col_bounds
    frac = _dark_fraction(image, (left, top, right, bottom), margin)
    if frac >= _CELL_MARK_HIGH:
        return True
    if frac <= _CELL_MARK_LOW:
        return False
    return None


def _column_has_content(
    image: Image.Image,
    header_y_span: tuple[int, int],
    col_bounds: tuple[int, int],
) -> bool:
    top, bottom = header_y_span
    left, right = col_bounds
    frac = _dark_fraction(image, (left, top, right, bottom), _COLUMN_CONTENT_MARGIN)
    return frac > _COLUMN_CONTENT_THRESHOLD


# The printed form's last grid column before the label-text strip is an
# "ID NO./B.F." administrative column, not an asset slot -- confirmed live
# it has header-strip ink (a preprinted label plus sometimes a handwritten
# footnote number) that clears `_COLUMN_CONTENT_THRESHOLD` same as a real
# asset name would, which would otherwise misreport it as an asset with no
# value marked. Distinguished structurally instead of by position: it's
# reliably wider than every real asset column (61px vs a ~40px median on a
# real page) since it holds a short numeric code rather than a name, not by
# assuming it's always literally the last column found.
_ID_COLUMN_WIDTH_RATIO = 1.3


def _drop_id_column(col_bands: list[tuple[int, int]]) -> list[tuple[int, int]]:
    if len(col_bands) < 2:
        return col_bands
    widths = [b - a for a, b in col_bands]
    median = sorted(widths)[len(widths) // 2]
    if not median:
        return col_bands
    if widths[-1] > _ID_COLUMN_WIDTH_RATIO * median:
        return col_bands[:-1]
    return col_bands


# How far right of the row-line probe strip to sweep when the fixed
# ASSET_LABEL_COLUMN_X_FRAC guess doesn't pan out, and how wide/coarse each
# sweep step is. Only hit for the minority layout (narrower grid, label
# text shifted left) -- the common layout resolves via the fixed fraction
# on the first try, without ever reaching this slower path.
_LABEL_SWEEP_X_MAX_FRAC = 0.9
_LABEL_SWEEP_STEP = 20
_LABEL_WINDOW_WIDTH = 165


def _find_anchor_row(
    image: Image.Image,
    row_bands: list[tuple[int, int]],
    label_x: tuple[int, int],
    top_anchor: str,
) -> int | None:
    for i, (top, bottom) in enumerate(row_bands):
        text = _ocr_single_line(image, (label_x[0], top, label_x[1], bottom), margin=_ROW_EDGE_MARGIN)
        if top_anchor.lower() in text.lower():
            return i
    return None


def _sweep_for_label_column(
    image: Image.Image,
    row_bands: list[tuple[int, int]],
    top_anchor: str,
    x_sweep_start: int,
) -> tuple[tuple[int, int], int] | None:
    """Fallback for a page whose tier-label text isn't where
    ASSET_LABEL_COLUMN_X_FRAC expects it (see that constant's neighbor,
    _ROW_LINE_PROBE_X_FRAC, for why: this form's grid width varies by
    filing page). Slides a fixed-width OCR window rightward across each
    candidate row band in turn until `top_anchor` reads clean -- confirmed
    live this finds it (a page's real tier-label text) even when the fixed
    guess misses by several hundred pixels."""
    x_max = round(image.width * _LABEL_SWEEP_X_MAX_FRAC)
    for row_idx, (top, bottom) in enumerate(row_bands):
        for x0 in range(x_sweep_start, x_max, _LABEL_SWEEP_STEP):
            x1 = x0 + _LABEL_WINDOW_WIDTH
            text = _ocr_single_line(image, (x0, top, x1, bottom), margin=_ROW_EDGE_MARGIN)
            if top_anchor.lower() in text.lower():
                return (x0, x1), row_idx
    return None


@dataclass
class AssetMark:
    """One asset-grid column's result. `band` is an EIGA band label (from
    `bands.ASSET_BANDS`), `SPOUSAL_INDEPENDENT`, or None if the column has
    an asset but the tier grid didn't yield a clean single mark. `ambiguous`
    is True when this column clearly has an asset (Block A header ink
    cleared `_COLUMN_CONTENT_THRESHOLD`) but the value grid shows zero marks
    or more than one -- flagged for manual review rather than guessed."""

    column_index: int
    band: str | None
    ambiguous: bool


def extract_asset_blocks(
    image: Image.Image,
    labels: list[tuple[str, str | None]] = ASSET_TIER_ROW_LABELS,
    top_anchor: str = ASSET_TOP_ANCHOR,
) -> list[AssetMark] | None:
    """Full Assets/Schedule A extraction for one page: locates the tier-row
    grid, locates the asset-grid columns scoped to that grid's own row span
    (`find_asset_columns` -- never a hardcoded region), classifies every
    (row, column) cell, and returns one `AssetMark` per column that
    actually has an asset (Block A header ink check via
    `_column_has_content` -- columns that are just unused grid slots on
    this page are silently skipped, not reported as anything). Returns
    None (flag, don't guess) if the tier-row grid itself couldn't be
    located.

    Row-line detection is scoped to `_ROW_LINE_PROBE_X_FRAC`, a narrow
    strip guaranteed present regardless of how many asset columns this
    page uses (see that constant's docstring) -- NOT to the label column,
    which does vary by page. Two coverage levels are tried, not just the
    validated default: confirmed live that one real page's ruled lines
    only clear a looser 0.4 threshold (lighter print/scan contrast than
    the page the 0.5 default was tuned on), while 0.5 remains necessary on
    other pages to avoid false-positive lines a looser threshold would
    pick up. Trying the stricter value first keeps the bar high by default.

    Finding the tier-label text itself (needed to OCR-confirm the "None"
    anchor row) tries the common-layout fixed fraction first, and only
    falls back to the slower `_sweep_for_label_column` search when that
    fails -- see its docstring for why a fixed position doesn't always
    work."""
    search_y = _frac_region(image, ASSET_ROW_SEARCH_Y_FRAC)
    probe_x = _frac_x(image, _ROW_LINE_PROBE_X_FRAC)

    row_bands = None
    for min_coverage in (_LINE_MIN_COVERAGE, 0.4):
        lines = find_ruled_lines(image, "row", region=(probe_x[0], search_y[0], probe_x[1], search_y[1]), min_coverage=min_coverage)
        if len(lines) < len(labels) + 1:
            continue
        lines = _split_wide_gaps(lines)
        if len(lines) >= len(labels) + 1:
            row_bands = list(zip(lines, lines[1:]))
            break
    if row_bands is None:
        return None

    label_x = _frac_x(image, ASSET_LABEL_COLUMN_X_FRAC)
    anchor_idx = _find_anchor_row(image, row_bands, label_x, top_anchor)
    if anchor_idx is None:
        found = _sweep_for_label_column(image, row_bands, top_anchor, x_sweep_start=probe_x[1])
        if found is None:
            return None
        label_x, anchor_idx = found

    n = len(labels)
    if anchor_idx + n > len(row_bands):
        return None
    rows: list[tuple[str | None, int, int]] = []
    for i, (_display, band) in enumerate(labels):
        top, bottom = row_bands[anchor_idx + i]
        rows.append((band, top, bottom))

    header_y = _frac_region(image, ASSET_HEADER_Y_FRAC)
    grid_y_span = (rows[0][1], rows[-1][2])
    grid_x_left = _frac_x(image, ASSET_GRID_X_FRAC)[0]
    col_lines = find_asset_columns(image, grid_y_span, x_region=(grid_x_left, label_x[0]))
    if len(col_lines) < 2:
        return None
    col_bands = list(zip(col_lines, col_lines[1:]))
    col_bands = _drop_id_column(col_bands)

    results: list[AssetMark] = []
    for col_idx, col_bounds in enumerate(col_bands):
        if not _column_has_content(image, header_y, col_bounds):
            continue
        marks = []
        ambiguous_cell = False
        for band, top, bottom in rows:
            hit = classify_cell(image, (top, bottom), col_bounds)
            if hit is None:
                ambiguous_cell = True
            elif hit:
                marks.append(band)
        if ambiguous_cell or len(marks) != 1:
            results.append(AssetMark(column_index=col_idx, band=None, ambiguous=True))
        else:
            results.append(AssetMark(column_index=col_idx, band=marks[0], ambiguous=False))
    return results


@dataclass
class AssetSummary:
    """`extract_asset_blocks()`'s output, tallied into the same shape the
    digital-text (`columns.py`) and Senate HTML (`senate_html.py`) paths
    already produce, so a caller can feed it into the same
    `bands.value_total()` / schema fields regardless of extraction method.
    `asset_line_count` counts every unambiguous marked column, including
    ones on a non-reportable band ("None"/"$1-$1,000" -- disclosed, just
    with nothing to add to a dollar total) or `SPOUSAL_INDEPENDENT`."""

    asset_band_counts: dict[str, int]
    asset_line_count: int
    ambiguous_count: int


def summarize_asset_marks(marks: list[AssetMark]) -> AssetSummary:
    """Tally one page's `AssetMark` list. `SPOUSAL_INDEPENDENT` is kept as
    its own key in `asset_band_counts` -- not merged into a reportable
    EIGA band -- mirroring `senate_html.py`'s `extract_table()`, which puts
    its own equivalent phrase into `band_counts` under the raw matched text
    and leaves `bands.value_total()` to no-op on it, with the dollar
    contribution added separately (see that module's
    `_spousal_independent_adjustment`). A column whose mark landed on a
    non-reportable band (`band is None` in `ASSET_TIER_ROW_LABELS`, i.e.
    "None" or "$1-$1,000") is counted in `asset_line_count` but has no key
    in `asset_band_counts` at all -- there's no band label to key it under,
    and `bands.value_total()` only ever sees labels it recognizes."""
    band_counts: dict[str, int] = {}
    line_count = 0
    ambiguous_count = 0
    for mark in marks:
        if mark.ambiguous:
            ambiguous_count += 1
            continue
        line_count += 1
        if mark.band is not None:
            band_counts[mark.band] = band_counts.get(mark.band, 0) + 1
    return AssetSummary(
        asset_band_counts=band_counts,
        asset_line_count=line_count,
        ambiguous_count=ambiguous_count,
    )
