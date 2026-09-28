# Net worth methodology

How `lib/wealth-bands.ts` / `lib/wealth-derive.ts` / `lib/wealth-data.ts` turn
`pipeline/output/financial_disclosures.json` into the net worth track
(`/congress/wealth` and each profile's "Net worth over time" card). Read
`docs/DATA_CONVENTIONS.md` §1–2 first for the general pipeline-output rules;
this doc is the wealth-specific policy layered on top.

## Source

`financial_disclosures.json` has one row per (`bioguide_id`, `year`) —
`year` is the reporting year the annual disclosure **covers**, already
converted from filing year by the Python pipeline in
`pipeline/financial_disclosures/`. **Never derive a displayed year from
`filing_date`** — a report filed in 2025 for 2024 is shown as 2024
everywhere (chart axes, hover cards, dropdowns, lists). `filing_date` only
ever appears as "filed {date}" in a source note. Amended years
(`filing_type` `A` / `annual_amendment`) keep the year they amend, so their
`filing_date` can be 1–13 years after `year` — confirmed against the real
data (303 amendments filed 1 year after, tapering out to one 13-year-later
amendment).

Each row's `assets_total`, `liabilities_total` and `net_worth` are already
computed by the pipeline (`pipeline/financial_disclosures/bands.py`) as sums
of EIGA band midpoints — the open-ended top band ("Over $50,000,000")
contributes its **floor** as a point estimate there, so `net_worth` is a
single number even for open-ended filings. `asset_band_counts` /
`liability_band_counts` are counts of band *labels*, not line items — there
are no item names or per-item dollar amounts in this file (that's the
line-item extraction follow-up, a sibling output).

## Usable row

A row counts toward every wealth aggregate — chart, list, scatter, party
medians — iff:

```
parse_confidence === "high" && !needs_review && 2013 <= year <= 2025
```

`needs_review` is true for every non-`high` `parse_confidence` value except
`no_filing_found`, so this is equivalent to "high confidence, in the
pipeline's stable window." 2026 rows are placeholders (the newest real data,
2025, comes from reports filed in 2026) and are excluded by the year bound,
not by a separate check.

## Range policy (`lib/wealth-bands.ts`)

Each band label maps to one of four kinds:

| Kind | Labels | Bounds |
|---|---|---|
| `closed` | The nine standard EIGA tiers (`$1,001 - $15,000` … `$25,000,001 - $50,000,000`), plus the liability-only `$10,001 - $15,000` | `lo`/`hi` = the literal edges |
| `zero` | `None (or less than $1,001)`, `--`, `Unascertainable` | `lo = hi = 0` |
| `open-ended` | `Over $50,000,000`, `Over $1,000,000 and held independently by spouse or dependent child` (asset), `Over $1,000,000 (asset held independently by spouse or dependent child)` (liability) | `lo` = floor + 1, `hi = null` |
| `unavailable` | Anything else (OCR/parser artifacts like `$29`, `$1`, `$60,000,000` without "Over") | `lo = hi = null` |

`--` appears only in Senate filings (695 usable occurrences, all `senate_efd`
— confirmed against every row) and is treated as no value, same as `None`.

A filing's range:

```
lo = Σ(asset lo) - Σ(liability hi)
hi = Σ(asset hi) - Σ(liability lo)
```

- **Any unrecognized band label — asset or liability — makes the whole
  filing's range `unavailable`** (`lo = hi = null`). The `net_worth`
  midpoint is still shown; only the range is unknown.
- **An open-ended asset band** makes the filing `openEnded` (`lo` known,
  `hi = null`) — the common case (Jim Justice, Rick Scott, Jefferson Shreve,
  Pete Ricketts, Dan Goldman, Darrell Issa, Vern Buchanan, Roger Williams,
  and several senators with an "Over $1M held by spouse" line).
- **An open-ended *liability* band is treated as `unavailable`, not
  `openEnded`.** An unbounded liability only removes the *lower* bound on
  net worth (we'd need the liability's own ceiling to bound `hi`, which
  doesn't exist) — rather than invent a third "open on the other side"
  range shape, this is folded into `unavailable`. This is deliberate, not a
  gap: it's what makes Jim Justice's 2025 range `unavailable` even though
  his `net_worth` midpoint ($1.24B) is fine — he has one `Over $50,000,000`
  liability band.
- For the 485 current members whose latest usable filing is fully closed,
  `(lo + hi) / 2` reproduces the pipeline's `net_worth` **exactly, for all
  485** (verified programmatically, `lib/wealth-data.test.ts`) — likewise
  across every closed-band usable row in the file (3,526 usable rows in
  total). The plan anticipated a $44K discrepancy on 38 rows; that
  reconciled cleanly against the current pipeline output, most likely
  because of the checkbox-grid liabilities-extraction fix already on `main`
  when this was built (see the Session 1 report for exact numbers as of
  2026-09-28).

## Current-member roster and entry year

"Current member" is exactly `lib/congress-data.ts`'s `getCurrentMemberIndex()`
— the same definition `generateStaticParams` uses for the House/Senate
profile pages. `lib/wealth-derive.ts::buildWealthMembers` never drops a
current member: someone with zero rows in `financial_disclosures.json` (or
zero *usable* rows) still gets a `WealthMember` record, with `points: []`
and an all-`null` `series`.

`entryYear` is the calendar year of the member's **first Congress in either
chamber** — `min(congress_number)` across all of that `bioguide_id`'s
`terms.json` rows, not just their current chamber's history (a member who
switched chambers keeps their original entry year). This differs from
`MemberProfile.firstCongress` in `lib/congress-data.ts`, which is scoped to
one chamber (it feeds that chamber's trajectory chart) — the wealth gap flag
below needs "when did they first show up in Congress at all."

## Cohort, annualized rate, pinned outliers

- **Cohort**: members with ≥ 2 usable years.
- **Annualized rate**: `(last midpoint - first midpoint) / (last usable year
  - first usable year)`, over the member's own first/last usable years (not
  a fixed window).
- **Pinned outlier**: `|rate| > $15,000,000/yr`. Exactly 5 current cohort
  members cross this as of 2026-09-28: Pete Ricketts (R000618), Dan Goldman
  (G000599), Mike Rogers (R000575), Scott Fields (F000110), Rick Scott
  (S001217). Mike Rogers's outlier status comes from a parser mis-read (his
  2017 filing has unrecognized band labels — see the Session 1 report's
  watch-item findings); it wasn't corrected here (out of scope — no parser
  changes in Session 1) but is flagged for a parser-side follow-up.

## Gap flag

Shown only in the hover card, never as special dot styling. Let `first` =
the member's first usable year and `entry` = `entryYear` above:

```
flag if entry <  2013 and first > 2013
flag if entry >= 2013 and (first - entry) >= 2
```

Explicitly **not** flagged: `entry < 2013` with `first === 2013` (that's
just the pipeline's 2013 data floor, not a real gap) or `entry >= 2013` with
`first - entry === 1` (the normal one-year lag between taking office and
filing a first annual report). 56 of the 422 cohort members are flagged.

## List eligibility

Eligible for the highest/lowest lists: latest usable year ≥ 2023. 498 of 553
current members qualify.

## Compact client payload

`/congress/wealth` filters entirely client-side (chamber, state, search), so
every current member ships in one static asset. `lib/wealth-derive.ts`'s
`toWealthPayload` serializes each member as a positional tuple (a JSON array
carries no repeated key names) rather than an object — for 553 current
members this measures **~88 KB raw / ~25 KB gzipped**, against the plan's
<130 KB / <35 KB budget. `lib/wealth-data.test.ts` asserts this budget
directly against the real pipeline output so a future change that blows the
budget fails a test, not a page-weight audit.

## Band policy: one module, two languages

The plan asks for the band/midpoint policy to live in one module importable
by both `lib/` (TypeScript) and `pipeline/` (Python, for the future
line-item extraction session). That's not literally possible across
languages, so:

- `pipeline/financial_disclosures/bands.py` (already on `main`) is the
  Python-side source of truth — it's what actually produces
  `assets_total`/`liabilities_total`/`net_worth` today.
- `lib/wealth-bands.ts` is the TypeScript restatement, operating on the
  already-counted `asset_band_counts`/`liability_band_counts` (rather than
  raw filing text, which `bands.py` scans) to recover a *range*, not just a
  point estimate.
- `lib/wealth-data.test.ts` cross-checks the TypeScript policy against the
  pipeline's own `net_worth` field for every usable row in the real output
  file, so the two can't silently drift apart without a failing test. A
  future line-item session (Session 5) reusing `bands.py`'s tiers keeps
  both sides honest the same way.
