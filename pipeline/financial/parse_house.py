"""Parse a House Clerk *electronic* Financial Disclosure PDF into structured data.

Scope: the text-native PDFs the Clerk's e-filing system renders (a "Filing ID"
in the header, selectable text, "Schedule A".."Schedule I" section headers).
Scanned paper filings (image-only, no extractable text) are detected by
``looks_scanned()`` and handled by the caller, not here.

Approach: the Clerk PDF is a fixed multi-column layout, but line wrapping
interleaves the columns in the raw text stream. We therefore work from word
geometry -- cluster words into visual lines, derive column x-boundaries from
each schedule's own header row, bucket each word into a column, then stitch a
logical row together from its (wrapped) visual lines.

This is a from-scratch parser. `disclosure-extractor` targets the judicial
AO-10 form and does not apply -- see docs/HOUSE_DISCLOSURE_EXTRACTOR_EVAL.md.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

import pdfplumber

from bands import Band, parse_band

SECTION_NAMES = {
    "A": "Schedule A: Assets and Unearned Income",
    "B": "Schedule B: Transactions",
    "C": "Schedule C: Earned Income",
    "D": "Schedule D: Liabilities",
    "E": "Schedule E: Positions",
    "F": "Schedule F: Agreements",
    "G": "Schedule G: Gifts",
    "H": "Schedule H: Travel Payments and Reimbursements",
    "I": "Schedule I: Payments Made to Charity in Lieu of Honoraria",
}

_OWNER_RE = re.compile(r"^(JT|SP|DC)$")
_TYPECODE_RE = re.compile(r"\[([A-Z]{2})\]")
_VALUE_TOKEN_RE = re.compile(r"\$[\d,]+|\bover\b|\bUndetermined\b|\bNone\b", re.I)
_DATE_TOKEN_RE = re.compile(
    r"^(January|February|March|April|May|June|July|August|September|October|"
    r"November|December|Ongoing|Undetermined)$")


def _submark(line: list[Word]) -> str | None:
    """Return 'L' | 'D' | 'C' when the line is a Location/Description/Comment
    sub-line, handling both '(L:)' single-token and ('L', ':') two-token forms."""
    if not line:
        return None
    t0 = re.sub(r"\s+", "", line[0].text)  # "L       :" -> "L:"
    if t0 in ("L:", "D:", "C:"):
        return t0[0]
    if t0 in ("L", "D", "C") and len(line) > 1 and line[1].text.strip() == ":":
        return t0
    return None


@dataclass
class LineItem:
    name: str
    owner: str | None
    type_code: str | None
    value: Band | None
    value_raw: str
    extra: dict = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)
    _name_open: bool = False  # name ended with the "⇒ continued" arrow

    def as_dict(self) -> dict:
        d = {
            "name": self.name,
            "owner": self.owner,
            "type_code": self.type_code,
            "value": self.value.as_dict() if self.value else None,
            "value_raw": self.value_raw,
        }
        if self.extra:
            d["extra"] = self.extra
        if self.notes:
            d["notes"] = self.notes
        return d


@dataclass
class ParsedDisclosure:
    filing_id: str | None
    name: str | None
    state_district: str | None
    filing_type: str | None
    filing_year: int | None
    filing_date: str | None
    assets: list[LineItem]
    liabilities: list[LineItem]
    section_status: dict[str, str]
    warnings: list[str]
    text_chars: int
    page_count: int


# --------------------------------------------------------------------------- #
# Geometry helpers
# --------------------------------------------------------------------------- #

@dataclass
class Word:
    text: str
    x0: float
    top: float
    page: int


def _load_words(path: str) -> tuple[list[Word], int, int, str]:
    words: list[Word] = []
    full_parts: list[str] = []
    with pdfplumber.open(path) as pdf:
        for pi, page in enumerate(pdf.pages):
            full_parts.append((page.extract_text() or "").replace("\x00", " "))
            for w in page.extract_words(use_text_flow=False, keep_blank_chars=False):
                t = w["text"].replace("\x00", " ").strip()
                if t:
                    words.append(Word(t, round(w["x0"], 1), pi * 10000 + w["top"], pi))
    full = "\n".join(full_parts)
    return words, len(full_parts), len(full.strip()), full


def _lines(words: list[Word], y_tol: float = 3.5) -> list[list[Word]]:
    out: list[list[Word]] = []
    for w in sorted(words, key=lambda w: (w.top, w.x0)):
        if out and abs(out[-1][-1].top - w.top) <= y_tol and out[-1][-1].page == w.page:
            out[-1].append(w)
        else:
            out.append([w])
    for ln in out:
        ln.sort(key=lambda w: w.x0)
    return out


def _looks_scanned(full: str) -> bool:
    return len(full.strip()) < 1500 or "Filing ID" not in full[:3000]


def _header_field(full: str, label: str) -> str | None:
    m = re.search(rf"^{re.escape(label)}:\s*(.+)$", full, re.M)
    return m.group(1).strip() if m else None


# --------------------------------------------------------------------------- #
# Column model
# --------------------------------------------------------------------------- #

# Anchor label -> canonical column key, per schedule. We locate the header row
# by its anchor words and read their x0 to build bin edges.
_COLMAP = {
    "A": [("Asset", "name"), ("Owner", "owner"), ("Value", "value"),
          ("Income", "income_type"), ("Income", "income_amt"), ("Tx.", "tx")],
    "D": [("Owner", "owner"), ("Creditor", "creditor"), ("Date", "date"),
          ("Type", "type"), ("Amount", "value")],
}


def _find_columns(line: list[Word], anchors: list[tuple[str, str]]) -> dict[str, float] | None:
    """Return {colkey: x0} by walking the header line left to right."""
    texts = [w.text for w in line]
    if not all(a in texts for a, _ in {(a, k) for a, k in anchors}):
        # allow duplicates (Income appears twice); check each distinct anchor
        pass
    result: dict[str, float] = {}
    used: set[int] = set()
    for anchor, key in anchors:
        for i, w in enumerate(line):
            if i in used:
                continue
            if w.text == anchor:
                result[key] = w.x0
                used.add(i)
                break
        else:
            return None
    return result


def _bin_edges(cols: dict[str, float], keys: list[str]) -> list[float]:
    # Right edge of a column sits just left of the *next* column's anchor rather
    # than at the midpoint: value ranges print a "-" separator token that drifts
    # well right of the value anchor but still belongs to the value column.
    xs = [cols[k] for k in keys]
    edges = [-1.0]
    for _a, b in zip(xs, xs[1:]):
        edges.append(b - 3.0)
    edges.append(1e9)
    return edges


def _assign(line: list[Word], keys: list[str], edges: list[float]) -> dict[str, str]:
    buckets: dict[str, list[str]] = {k: [] for k in keys}
    for w in line:
        for i, k in enumerate(keys):
            if edges[i] <= w.x0 < edges[i + 1]:
                buckets[k].append(w.text)
                break
    return {k: " ".join(v).strip() for k, v in buckets.items()}


# --------------------------------------------------------------------------- #
# Section extraction
# --------------------------------------------------------------------------- #

def _section_spans(lines: list[list[Word]]) -> dict[str, list[list[Word]]]:
    spans: dict[str, list[list[Word]]] = {}
    cur: str | None = None
    for ln in lines:
        if ln and ln[0].text == "S" and ln[0].x0 < 30 and len(ln) > 1 and ln[1].text.rstrip(":") in SECTION_NAMES and ln[1].text.endswith(":"):
            cur = ln[1].text.rstrip(":")
            spans[cur] = []
            continue
        # end markers
        if ln and ln[0].text.startswith("E") and any("CERTIFY" in w.text for w in ln):
            cur = None
        if cur is not None:
            spans[cur].append(ln)
    return spans


def _none_disclosed(span: list[list[Word]]) -> bool:
    for ln in span[:3]:
        if " ".join(w.text for w in ln).strip().startswith("None disclosed"):
            return True
    return False


def _parse_columnar(span: list[list[Word]], sect: str) -> tuple[list[LineItem], str, list[str]]:
    if _none_disclosed(span):
        return [], "none_disclosed", []

    anchors = _COLMAP[sect]
    keys = [k for _, k in anchors]
    cols = None
    start = 0
    for i, ln in enumerate(span):
        cols = _find_columns(ln, anchors)
        if cols:
            start = i + 1
            break
    if not cols:
        return [], "header_not_found", [f"Schedule {sect}: column header row not found"]
    edges = _bin_edges(cols, keys)

    items: list[LineItem] = []
    warnings: list[str] = []
    cur: LineItem | None = None

    for ln in span[start:]:
        joined = " ".join(w.text for w in ln).strip()
        if not joined or joined.startswith(
            ("* For the complete", "Filing ID", "Asset Owner", "Owner Creditor",
             "Value of Asset", "Amount of")
        ):
            continue
        b = _assign(ln, keys, edges)
        sub = _submark(ln)
        name_field = (b.get("name") or b.get("creditor") or "").strip()
        val_field = b.get("value", "").strip()
        has_value_tok = bool(_VALUE_TOKEN_RE.search(val_field))

        name_core = _TYPECODE_RE.sub("", name_field).strip(" -⇒")
        prev_open_name = cur is not None and cur._name_open

        if sect == "A":
            owner_tok = b.get("owner", "").strip()
            has_typecode = bool(_TYPECODE_RE.search(joined[:120]))
            # A wrapped line whose only "name" text is a bare [XX] code, or which
            # continues a name that ended with the "⇒ continued" arrow, is not a
            # new asset.
            is_new = (
                cur is None
                or (sub is None and name_core != "" and not prev_open_name
                    and (has_typecode or _OWNER_RE.match(owner_tok) or has_value_tok))
            )
        else:  # D
            date_tok = b.get("date", "").strip()
            has_date = bool(_DATE_TOKEN_RE.match(date_tok.split()[0])) if date_tok else False
            is_new = cur is None or (sub is None and has_value_tok and (has_date or _OWNER_RE.match(b.get("owner", "").strip())))

        if not is_new:
            if sub:
                tag = {"L": "location", "D": "description", "C": "comment"}[sub]
                rest = " ".join(w.text for w in ln[1:] if w.text.strip() != ":")
                cur.extra[tag] = (cur.extra.get(tag, "") + " " + rest).strip()
            elif has_value_tok and not cur.value_raw.strip():
                cur.value_raw = val_field
            elif has_value_tok:
                cur.value_raw = (cur.value_raw + " " + val_field).strip()
            elif name_field:
                cur.name = (cur.name + " " + name_field).strip()
                cur._name_open = "⇒" in name_field
            continue

        if sect == "A":
            owner = b.get("owner", "").strip()
            tc = _TYPECODE_RE.search(name_field)
            cur = LineItem(
                name=re.sub(r"\s+", " ", _TYPECODE_RE.sub("", name_field)).strip(" -⇒"),
                owner=owner if _OWNER_RE.match(owner) else None,
                type_code=tc.group(1) if tc else None,
                value=None, value_raw=val_field,
                _name_open="⇒" in name_field,
            )
        else:
            owner = b.get("owner", "").strip()
            extra = {}
            if b.get("date", "").strip():
                extra["date_incurred"] = b["date"].strip()
            if b.get("type", "").strip():
                extra["liability_type"] = b["type"].strip()
            cur = LineItem(
                name=re.sub(r"\s+", " ", name_field).strip(),
                owner=owner if _OWNER_RE.match(owner) else None,
                type_code=None, value=None, value_raw=val_field, extra=extra,
            )
        items.append(cur)

    for it in items:
        it.name = re.sub(r"\s+", " ", it.name).replace("⇒", "").strip(" -:")

    # Repair pass: a range that wrapped across lines leaves item N with an
    # open low bound ("$50,001 -") and drops the high bound ("$100,000") onto
    # the *next* visual line, which usually also starts item N+1. Pull it back.
    _open_low = re.compile(r"^\$?\s?([\d,]+)\s*[-–]\s*$")
    _lead_money = re.compile(r"^\$?\s?([\d,]+)\b")
    for a, nxt in zip(items, items[1:]):
        mo = _open_low.match(a.value_raw.strip())
        if not mo:
            continue
        mh = _lead_money.match(nxt.value_raw.strip())
        if not mh:
            continue
        a.value_raw = f"${mo.group(1)} - ${mh.group(1)}"
        nxt.value_raw = nxt.value_raw.strip()[mh.end():].strip()
        if not nxt.value_raw and len(nxt.name.split()) <= 3 and not nxt.type_code:
            nxt.name = ""  # spurious fragment row from the wrap

    items = [it for it in items if it.name or _VALUE_TOKEN_RE.search(it.value_raw)]

    # finalise value bands
    _range_ct = re.compile(r"\$[\d,]+\s*[-–]\s*\$[\d,]+")
    for it in items:
        if len(_range_ct.findall(it.value_raw)) > 1:
            # two ranges glued together => adjacent rows merged during wrap
            # stitching. Keep the first, flag the item.
            first = _range_ct.search(it.value_raw)
            it.notes.append(f"multiple value ranges in one row (merge artifact): {it.value_raw!r}")
            warnings.append(f"Schedule {sect}: {it.name[:40]!r}: merge artifact {it.value_raw!r}")
            it.value_raw = first.group(0)
        it.value = parse_band(it.value_raw)
        if it.value is not None and not it.value.recognized:
            note = f"unrecognized value band: {it.value_raw!r}"
            it.notes.append(note)
            warnings.append(f"Schedule {sect}: {it.name[:40]!r}: {note}")

    return items, ("parsed" if items else "empty"), warnings


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #

def parse(path: str) -> ParsedDisclosure:
    words, page_count, text_chars, full = _load_words(path)

    fid = re.search(r"Filing ID #(\d+)", full)
    base = ParsedDisclosure(
        filing_id=fid.group(1) if fid else None,
        name=_header_field(full, "Name"),
        state_district=_header_field(full, "State/District"),
        filing_type=_header_field(full, "Filing Type"),
        filing_year=int(_header_field(full, "Filing Year")) if _header_field(full, "Filing Year") else None,
        filing_date=_header_field(full, "Filing Date"),
        assets=[], liabilities=[], section_status={}, warnings=[],
        text_chars=text_chars, page_count=page_count,
    )

    if _looks_scanned(full):
        base.warnings.append("PDF has no extractable schedule text (scanned/paper filing)")
        base.section_status = {"A": "scanned", "D": "scanned"}
        return base

    lines = _lines(words)
    spans = _section_spans(lines)

    assets, a_status, a_warn = _parse_columnar(spans["A"], "A") if "A" in spans else ([], "header_not_found", ["Schedule A not found"])
    liab, d_status, d_warn = _parse_columnar(spans["D"], "D") if "D" in spans else ([], "header_not_found", [])

    base.assets = assets
    base.liabilities = liab
    base.warnings += a_warn + d_warn
    base.section_status["A"] = a_status
    base.section_status["D"] = d_status
    for k in "BCEFGHI":
        if k in spans:
            base.section_status[k] = "none_disclosed" if _none_disclosed(spans[k]) else "present"
    return base
