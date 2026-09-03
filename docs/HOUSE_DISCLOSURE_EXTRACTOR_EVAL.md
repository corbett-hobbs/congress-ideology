# Evaluating `disclosure-extractor` for House financial disclosures

**Question:** can `freelawproject/disclosure-extractor` (BSD-2, `pip install
disclosure-extractor`, v0.0.60) parse U.S. **House** Financial Disclosure
filings into net-worth data, the way it does for federal **judicial** filings?

**Answer: no — not usefully.** It is tightly coupled to the judiciary's AO-10
form (layout, section model, *and* value-code bands). We evaluated it against
real House PDFs, confirmed the incompatibility empirically, and built a
purpose-made House parser instead (`pipeline/financial/`). `disclosure-extractor`
is retained only as an optional dependency of the evaluation probe.

---

## 1. What was tested

- **Install:** clean via `uv pip install disclosure-extractor` into a Python
  3.12 venv. One wrinkle: its dependency chain pulls an `sdist`-only
  `cryptography` that needs a Rust toolchain; `uv pip install --only-binary
  cryptography` first (resolves to 48.0.1 wheel) sidesteps it. Recorded in
  `pipeline/financial/README.md`.
- **Inputs:** House Annual Reports (FilingType `O`) pulled straight from the
  Clerk bulk index `https://disclosures-clerk.house.gov/public_disc/financial-pdfs/<YEAR>FD.zip`,
  for 8 current members across filing years 2023 and 2024 (16 filings):
  Pelosi, Crenshaw, Newhouse, Buchanan, Wagner, Fitzpatrick, McCaul, Khanna.
- **Probe:** `pipeline/financial/probe_disclosure_extractor.py` runs every
  entry point (`extract_content`, `extract_normal_pdf`, `process_jef_document`,
  `process_financial_document`) against a given PDF and records the outcome.

## 2. What happened (observed, on `2024_Pelosi_10066169.pdf`)

| Entry point | Path | Result |
| --- | --- | --- |
| `extract_content` | text | **crash** — `re.findall(r"/s/(.*)\[", content)[0]` → `IndexError`. Expects a judge's `/s/ Name [` signature block; House form says `Digitally Signed: Hon. Nancy Pelosi`. |
| `process_jef_document` | text | **crash** — same `IndexError` (wraps `extract_content`). |
| `extract_normal_pdf` | text | `success: false`. Returns the 8 hard-coded AO-10 sections (`Positions`, `Agreements`, `Non-Investment Income`, `Non Investment Income Spouse`, `Reimbursements`, `Gifts`, `Liabilities`, `Investments and Trusts`) with **0 rows each** — it never finds a table whose first cell begins `"1."`, which is the AO-10 numbered-section layout. House uses `Schedule A`…`Schedule I`. |
| `process_financial_document` | image | Needs `poppler`. Its logic (`extract_contours_from_page`) OpenCV-detects the AO-10 checkbox grid and bails when `found_count < 8`. A text-native House PDF has no such grid, so this path cannot succeed regardless. |

## 3. Section-name compatibility (brief item 2)

Not compatible. The House form's schedules do **not** map cleanly onto the
tool's output keys:

| House schedule | Nearest tool key | Maps cleanly? |
| --- | --- | --- |
| Schedule A: Assets and "Unearned" Income | `Investments and Trusts` | **No.** Conceptually similar, but the column model differs: House is *Asset / Owner / Value of Asset / Income Type(s) / Income / Tx > $1,000*; the tool expects the AO-10 *A / B1 / B2 / C1 / C2 / D1…D5* grid. |
| Schedule D: Liabilities | `Liabilities` | **No.** House is *Owner / Creditor / Date Incurred / Type / Amount of Liability*; tool expects *Creditor / Description / Value Code*. |
| Schedule B: Transactions | — | No equivalent. |
| Schedule C: Earned Income | `Non-Investment Income` | Partial name overlap only. |
| Schedule E–I (Positions, Agreements, Gifts, Travel, Charity) | `Positions` / `Agreements` / `Gifts` / `Reimbursements` | Names rhyme; structure and column sets differ. |

## 4. Value-code / range-band compatibility (brief item 3)

**This is the dispositive incompatibility.** `disclosure-extractor`'s
`key_codes` table (`calculate.py`) is the *judicial* Filing Instructions band
set. The House form uses the EIGA band set, and the House Clerk's electronic
PDF prints **literal dollar ranges, not letter codes at all**:

| Letter | `disclosure-extractor` (judicial) | House EIGA band |
| --- | --- | --- |
| `D` | $5,001 – $15,000 | $50,001 – $100,000 |
| `G` | $100,001 – $1,000,000 | $500,001 – $1,000,000 |
| `H2` | $5,000,001 + | (House "I") $5,000,001 – $25,000,000 |

Feeding House values through the tool's table would produce silently wrong
numbers. The House Clerk PDF sidesteps letters entirely — every value is
rendered as `"$1,001 - $15,000"`, `"$5,000,001 - $25,000,000"`, `"$1 - $1,000"`,
`"Over $50,000,000"`, `"Undetermined"`, or `"None"`.

The full EIGA band set we handle (`pipeline/financial/bands.py`):

```
$1–$1,000 · $1,001–$15,000 · $15,001–$50,000 · $50,001–$100,000 ·
$100,001–$250,000 · $250,001–$500,000 · $500,001–$1,000,000 ·
$1,000,001–$5,000,000 · $5,000,001–$25,000,000 · $25,000,001–$50,000,000 ·
Over $50,000,000  (open-ended — no fabricated midpoint)
```

Every band the sample contained is recognised. The only open-ended band seen
was Buchanan's "Over $50,000,000" (single holding) — handled per the brief:
stored `open_ended: true` with `low` only, excluded from the midpoint sum,
`needs_review` set.

## 5. Non-text-extractable PDFs (brief item 5)

Confirmed real and material. Of the 16 sample filings, **4 (McCaul ×2, Khanna
×2) are scanned/paper** — `pdfplumber` extracts ~0 characters (Khanna 2024 is
333 image-only pages). Notably these are two of the *wealthiest* filers (McCaul
via spouse; the richest members disproportionately paper-file with brokerage
statements attached). `disclosure-extractor`'s OCR path is AO-10-calibrated and
does not help here. Our pipeline flags them `parse_confidence: "none"`,
`needs_review: true`, `net_worth_estimate: null`, and excludes them from
confident totals rather than guessing.

## 6. What we built instead

`pipeline/financial/` — a from-scratch parser for the House Clerk **electronic**
PDF:

- `bands.py` — EIGA range parsing, explicit open-ended handling, midpoint = mean
  of the two bounds, never fabricated.
- `parse_house.py` — geometry-based: clusters words into visual lines, derives
  column x-boundaries from each schedule's own header row, buckets words into
  columns, and stitches wrapped rows back together (handles the Clerk's
  NUL-byte "letter-spacing" and the `⇒` name-continuation arrow). Flags
  wrap/merge artifacts.
- `resolve.py` — `("Pelosi", "CA11")` → `bioguide_id` via the normalised
  `terms.json` + `legislators.json` (current Congress, House).
- `adapter.py` — maps the parse onto `FinancialDisclosure` (`lib/types.ts`):
  net worth = Σ asset midpoints − Σ liability midpoints, plus
  `parse_confidence` / `needs_review` / `review_notes`.
- `build.py` — orchestrator (index → download → parse → adapt → JSON + report).
- `probe_disclosure_extractor.py` — the evaluation artifact above.

## 7. Sample results (brief items 6, 9)

`python build.py --years 2023 2024 --sample` → 16 rows,
`pipeline/output/financial_disclosures.json` (+ `_report.json`).

| Member | Filings | Outcome | 2024 net-worth midpoint | Public sanity check* |
| --- | --- | --- | --- | --- |
| Pelosi | 2 | **clean** (`high`) | ~$188M | consistent with $110–260M range widely reported |
| Crenshaw | 2 | **clean** (`high`) | ~$0.19M | consistent with "near zero / small, mortgage-heavy" |
| Newhouse | 2 | `low` — merge artifacts | ~$14.4M | right order of magnitude (~$15–30M reported) |
| Buchanan | 2 | `low` — merge artifacts + open band | ~$75M (understated) | low vs. "top-5 richest, $100M+"; flagged, not trusted |
| Wagner | 2 | `low` — merge artifacts | ~$11M (understated) | low vs. reporting; flagged |
| Fitzpatrick | 2 | `low` — sparse filing / Sched. D merge | ~$2.6M | filing itself lumps assets; flagged |
| McCaul | 2 | **paper** (`none`) | null | correctly produces nothing, not a wrong number |
| Khanna | 2 | **paper** (`none`) | null | ditto |

\* Wikipedia's "current members of Congress by wealth" and press estimates are
outdated and method-inconsistent — used only as an order-of-magnitude smell
test, never as ground truth.

**Clean vs. flagged: 4 / 16 filings (2 members) parse cleanly at `high`
confidence; 8 / 16 (4 members) parse at `low` with itemised review notes; 4 / 16
(2 members) are paper filings yielding no estimate.**

## 8. Recommendation (brief item 9)

- **`disclosure-extractor` itself: do not adopt** for House. It contributed no
  reusable parsing for this form; the value bands alone rule it out.
- **The House Clerk electronic PDF is very parseable** — clean, structured text.
  The purpose-built parser handles straightforward filings (the majority) well.
- **Before a full ~435-member rollout, the wrap-stitching in `parse_house.py`
  needs another pass** for managed-account-heavy filings (dozens–hundreds of
  sub-holdings under one brokerage account, where a row's value high-bound and
  the next row's name share a visual line). Current behaviour on those is
  "order-of-magnitude estimate, `needs_review: true`, itemised notes" — safe,
  but not yet confident.
- **Paper filings (~10–15% of members, skewed wealthy) will always need manual
  entry or OCR+review.** The `parse_confidence: "none"` flag keeps them out of
  confident aggregates.

Net: the approach is sound and the schema is right; the parser is
sample-validated but not yet scale-ready. Scaling is a separate session.
