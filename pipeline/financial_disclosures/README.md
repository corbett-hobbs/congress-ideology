# pipeline/financial_disclosures/

Computes estimated net worth, per current House member, per year, from House
Clerk financial disclosure filings (2013-present, the digital-filing era).
**Phase 1** of a three-phase plan (House digital → House OCR → Senate)
described in `docs/FINANCIAL_DISCLOSURES_ARCHITECTURE.md` — this component
will grow OCR and Senate sources into the same output file without a schema
change, which is why it lives at `pipeline/financial_disclosures/` rather
than `pipeline/house_financial_disclosures/`.

> Supersedes `pipeline/financial/`, a prior validation-sample effort (8
> members × 2 years) against an older per-line-item schema. That component's
> `bands.py` EIGA table and NUL-byte/`⇒` handling informed this one, but this
> is a fresh build: full-scale (~435 members × up to 13 years), a different
> extraction technique (column-position + literal band-string counting
> instead of clustering words into visual lines), and a different,
> band-counted output schema. `pipeline/financial/` is left in place as
> reference/history, not deleted.

## Setup

System Python 3.9 works here (no 3.11+ requirement, unlike `pipeline/financial/`):

```bash
cd pipeline/financial_disclosures
python3 -m venv .venv
./.venv/bin/pip install pdfplumber pyyaml requests beautifulsoup4
```

## Run

```bash
./.venv/bin/python build.py                       # full run: all current House members, 2013-2026
./.venv/bin/python build.py --years 2024 2025     # restrict to specific reporting years (testing)
./.venv/bin/python build.py --last Pelosi Buchanan # restrict to specific surnames (testing)
```

Writes `pipeline/output/financial_disclosures.json` (one row per
`(bioguide_id, year)`) and `pipeline/output/financial_disclosures_report.json`
(run summary: match rate, counts by `parse_confidence`, `needs_review` count).

Downloaded index files and PDFs are cached under
`pipeline/raw/house-financial-disclosures/` (`<year>FD.xml` index,
`<year>/<doc_id>.pdf`) and reused on rerun — a rerun only re-downloads what's
missing.

## How it works

| File | Role |
| --- | --- |
| `bands.py` | EIGA dollar-range band table (chamber/method-agnostic — same federal law for House and Senate). Literal band label strings (e.g. `"$1,001 - $15,000"`) used for exact-substring counting, not fuzzy matching; verified none is a substring of another. Open-ended top band (`"Over $50,000,000"`) contributes a floor value to totals and sets `has_open_ended_asset`, never a fabricated midpoint. |
| `extract_text.py` | The one swappable text-extraction step. `extract_digital_text()` uses `pdfplumber` to pull per-page words with `x0`/`x1`/`top` geometry plus raw page text. Also detects scanned/paper filings (near-zero extractable characters). Phase 2 (OCR) replaces only this function; everything downstream takes the same `DocWords` shape regardless of source. |
| `columns.py` | Column-position extraction + literal band counting. Per page: classify by literal phrases (`"Value of Asset"`, `"Amount of"`+`"Liability"`, etc.), locate that page's own header words, derive the column x-range from their actual position (never a hardcoded pixel range — confirmed necessary since the Clerk's generator does shift column widths across the 2013-2025 span), then collect only value-shaped tokens inside that range and count literal band strings. This is what makes "mixed pages" (a schedule's continuation sharing a page with the next schedule's start) safe: Schedule B's transaction-amount column sits at a different x-position than Schedule A's value column, so column filtering alone prevents cross-contamination. |
| `roster.py` | Current House member roster from `legislators-current.yaml`, `first_year_served` (floored at 2013), and a `(normalized-last-name-variant, state)` lookup index — multiple variants registered per multi-word surname (concatenated, first-token-only, last-token-only, reversed) to catch the Clerk index splitting a name differently than congress-legislators does. |
| `match.py` | Matches a Clerk index row to `bioguide_id` via `(normalized Last, 2-letter state prefix)`. Disambiguates same-seat multi-candidate matches by the first 3 characters of `First`; still-ambiguous rows are left unmatched (flagged in the report) rather than guessed. `pick_best_filing()` implements "amendment supersedes original for the same reporting year" by latest `FilingDate`, not by filing type. |
| `fetch.py` | Downloads `<year>FD.zip` (contains `<year>FD.xml` — see note below) and individual filing PDFs, with a polite delay and a real `User-Agent`; caches everything under `pipeline/raw/house-financial-disclosures/`. |
| `build.py` | Orchestrator: fetch all year indices → match rows to members → for each `(bioguide_id, year)` in a current member's service span, pick the best filing, download, extract, band-count, classify confidence → write the output + report JSON. |

### Confirmed deviation from the session brief

The session prompt assumed every `<YEAR>FD.zip` contains a tab-delimited
`<YEAR>FD.txt`. Empirically (confirmed against the live zips for all of
2013-2026), that's true for every year **except 2023 and 2024**, which
contain `<YEAR>FD.xml` instead — an XML `<FinancialDisclosure><Member>...`
list with the same fields
(`Prefix`/`Last`/`First`/`Suffix`/`FilingType`/`StateDst`/`Year`/
`FilingDate`/`DocID`). `fetch.py` auto-detects the format from content (not
the file extension) and parses either.

## Confidence flags (`parse_confidence`)

| Value | Meaning |
| --- | --- |
| `high` | Header found on every page tagged for that schedule, at least one value line extracted. |
| `low` | Parsed, but a schedule's header couldn't be located on every page it should cover, or a tagged page yielded zero value tokens. `needs_review: true`. Treat the total as order-of-magnitude. |
| `unparseable_scanned` | No extractable text layer (OmniPage-OCR'd scan). Value-payload fields left `null`, never guessed. `needs_review: true`. This is exactly Phase 2 (OCR)'s target set. |
| `no_filing_found` | No `O`/`A` filing matched for this member-year — either a genuine gap (e.g. a first-year filer under the new online system) or a name-matching miss worth a second look. Value-payload fields left `null`. |
| `download_failed` | Matched a filing but the PDF couldn't be downloaded or parsed as a PDF at all. `needs_review: true`. |

## Data source

House Clerk, Office of the Legislative Resource Center —
`https://disclosures-clerk.house.gov/`. Filings and the bulk index are public
records / U.S. Government works.

Member roster + `bioguide_id` crosswalk:
`@unitedstates/congress-legislators` `legislators-current.yaml` (reused from
`pipeline/raw/congress-legislators/`, already fetched by
`pipeline/fetch/legislators.ts`).

## Validation

`financial_disclosures_report.json` gives match rate, filing-type code
distribution, and counts by `parse_confidence`. Note its `match_rate_pct`
field is computed at the **index-row** grain (every `O`/`A` row in the Clerk
index, across every filer, matched against the 437 current members) — it
reads low (~50%) simply because most historical filers in the index are not
current members. The grain that matters for this pipeline is **member-year**:
of the 3,195 current-member-years with a possible filing (2013–2025; 2026 is
excluded since CY2026 reports aren't due until May 2027 and are correctly
`no_filing_found` for essentially all 437 members), 3,106 matched a filing —
**97.2%**, in line with the ~97% figure the session brief cited from prior
manual testing.

Two outside sites (wealthincongress.com, votepredictor.com/congress/wealth)
are bounds-checks, not ground truth. Spot-checked against
votepredictor.com/congress/wealth (2026-09-22):

| Member | Year | This pipeline's `net_worth` | votepredictor range (midpoint) |
| --- | --- | --- | --- |
| Vern Buchanan (B001260) | 2024 | $243.1M | $50.6M – $306.0M+ (▸ open-ended) ($178.3M) |
| Nancy Pelosi (P000197) | 2024 | $225.2M | −$65.8M – $354.2M ($144.2M) |

Both fall inside votepredictor's reported range, and both correctly flag as
the top two House net-worth entries on that site — consistent given the
methodology gap the session brief called out (votepredictor's own range
brackets liabilities/open-ended assets differently, so an exact midpoint
match isn't expected). Regression case: Vern Buchanan's 2023/2024 filings
carry a nested `⇒`-chained LLC asset valued "Over $50,000,000"; both years
correctly set `has_open_ended_asset: true`.

## Phase 3a: Senate, electronic (HTML) filings

Computes the same per-`(bioguide_id, year)` net worth for current senators,
from `efdsearch.senate.gov`. Unlike House, this source has no bulk index and
gates search behind a click-through agreement to EIGA §105(c) — see
`senate_fetch.py`'s module docstring for the confirmed session-bootstrap
mechanism (the script submits that agreement itself each run, the same POST
a human visitor's browser sends).

Also unlike House, a Senate annual report is either **electronic** (rendered
as a structured HTML page — no PDF, no OCR, no column-geometry work; the
Value/Amount cell text already matches `bands.py`'s literal band strings
verbatim) or **paper** (a scanned multi-page image viewer, `/search/view/paper/`).
The format is given directly by the report URL, never guessed. This phase
covers electronic reports only.

| File | Role |
| --- | --- |
| `senate_roster.py` | Current-Senate variant of `roster.py` (reuses its `norm()`/`last_name_variants()`), floored at 2012 (eFD's stated coverage start) rather than House's 2013. |
| `senate_fetch.py` | Session bootstrap (agreement POST) + paginated `POST /search/report/data/` (a DataTables JSON endpoint, 100 rows/page server-enforced) + individual report HTML fetch, cached under `pipeline/raw/senate-financial-disclosures/annual/<uuid>.html`. |
| `senate_match.py` | Name-only matching (Senate search rows carry no state column, unlike House's `StateDst`) via last-name-variant + first-3-chars-of-first disambiguation, with a `senator_state`-scoped re-query as a second, verified layer before ever falling back to `"ambiguous"`. Also parses the report-label taxonomy (`"Annual Report for CY <year>"`, its amendments, `"New Filer Report for <date>"`) and excludes `"Candidate Report"` rows (a campaign-era snapshot filed under the same report-type bucket, not an officeholder annual disclosure). |
| `senate_html.py` | HTML table extraction: assets via `<table id="grid_items">`, liabilities via the table whose `<caption>` reads "List of liabilities added to this report" — the value column is located by matching its header text, never a hardcoded index. Recognizes several literal value-cell conventions beyond the standard EIGA bands: `"Unascertainable"`, `"--"` (a parent/grouping row whose value lives on child rows), `"None (or less than $X)"` (a below-threshold disclosure distinct from the Income column's own convention), and `"Over $1,000,000 ... held independently by spouse or dependent child"` (an EIGA spousal-holding carve-out contributing a $1M floor — material for at least one current member's reported net worth). |
| `build_senate_html.py` | Orchestrator. Merges into the existing `financial_disclosures.json` (drops any prior `chamber == "senate"` rows, appends freshly built ones) rather than rewriting it from scratch, since House rows must be left untouched. A `/paper/` row is counted (for Phase 3b sizing) and, when it's the only filing found for a member-year, written as `parse_confidence: "unparseable_scanned"` with a best-effort year estimate — never silently left as `no_filing_found`, which would misrepresent "filing exists but unread" as "no filing exists". |

```bash
./.venv/bin/python build_senate_html.py                     # full run: all current senators, 2012-2026
./.venv/bin/python build_senate_html.py --last Baldwin Scott # restrict to specific surnames (testing)
```

### Validation (2026-09-24 run)

1,018 current-senator-years processed: 818 `high`, 102 `unparseable_scanned`
(paper, deferred to Phase 3b), 98 `no_filing_found` (pre-service years, plus
CY2026 not yet due). Zero `low` or `download_failed` — every matched
electronic report's value cells classified cleanly, including the Rick
Scott/Tim Scott same-surname case (correctly kept separate across all years)
and Rick Scott's ~100 spousal-independent-holding line items per report
(the special-cased convention above).

Spot-checked against votepredictor.com/congress/wealth (2026-09-24):

| Member | Year | This pipeline's `net_worth` | votepredictor range (midpoint) |
| --- | --- | --- | --- |
| Rick Scott (S001217) | 2025 | $512.4M | $198.6M – $726.1M ($462.4M) |

Falls inside votepredictor's range, both sources agree he's the wealthiest
sitting senator, and the year-over-year trend matches (a jump in 2023, a dip
in 2024, a rise in 2025) — same "bounds-check, not ground truth" caveat as
the House validation above.

## Known gaps (carried forward per the architecture doc, not solved here)

- Senate paper (scanned-image) filings (Phase 3b) — detected and counted,
  not read. Includes at least two current senators (Blumenthal, Durbin) who
  file exclusively on paper every year, so this isn't a shrinking legacy
  tail the way House's scanned filings are. `senate_html.py`'s value
  classification and `bands.py`'s band table both carry over unchanged once
  Phase 3b adds an OCR-backed extraction step for the scanned page images
  (served from `efd-media-public.senate.gov`, one GIF per page, no session
  needed once the page URLs are known).
- OCR of scanned House filings (Phase 2) — detected and flagged
  (`unparseable_scanned`), not read. `extract_text.py` is structured so
  Phase 2 only needs to add an OCR-backed alternative to
  `extract_digital_text()`.
- Schedule B (transactions), C (outside income), E (positions), gifts,
  travel — out of scope; only Schedule A (assets) / Part 3 and D
  (liabilities) / Part 7 feed net worth, House and Senate alike.
