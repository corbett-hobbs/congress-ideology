# Immigration enforcement — methodology

Data-only track (no routes yet). Source findings and the year-by-year inventory:
`docs/IMMIGRATION_SOURCE_NOTES.md`. Schemas: `lib/enforcement-entities.ts`.

## What the series is

**ICE removals, by fiscal year (Oct 1 – Sep 30), FY2003–FY2025**, from ICE's own
documents only. Key `(period, metric, scope)` with `metric = removals`,
`scope = ice` (required — no default — so a CBP or DHS-wide series can never be
spliced in silently). `period` is the year the fiscal year ends in. No member
or `bioguide_id` key; it joins to presidents by date (§ Attribution).

A **removal** is DHS's formal term for what is commonly called deportation: the
confirmed departure of a non-citizen from the U.S. enforced by the government.

## What ICE-only includes and excludes

- **Includes** removals ICE carries out of people ICE arrested in the interior
  **and** of people CBP/Border Patrol apprehended at the border and handed to ICE
  (FY2013: 133,551 interior + 235,093 border = 368,644).
- **Excludes** removals executed by CBP itself (expedited removals and voluntary
  returns of people ICE never took into custody — published by CBP), Title 42
  expulsions, and everything DHS-wide.
- **Includes "returns"** from FY2007 on (voluntary returns/departures, withdrawals
  under docket control) — ICE's own definition. FY2003–FY2006 do not.

**Never compare these figures with DHS-wide counts** (e.g. the 438,421 FY2013
figure often quoted), OHSS yearbook tables, CBP data, or DHS press-release
totals ("millions have left"). Different agencies, different inclusions; the press
totals have no published methodology and are never ingested.

## Known reporting changes (annotated per row via `note_ids`)

`enforcement_notes.json` carries each with the fiscal-year range it applies to:
returns excluded before FY2007; returns included from FY2007; the October 5 lock
and "lag" (headline figures only — never the alternate "excluding lag" totals);
FY2010's 76,732 excluded CBP expedited removals; the June 1, 2013 CBP handoff;
Title 42 expulsions excluded (FY2020–23); ICE Air expedited removals included from
May 12, 2023; FY2003 as a part-year (ICE began March 1, 2003); FY2021 read from a
chart; FY2025 from a budget document. A UI should draw the first of these (the
FY2006→FY2007 definition break) as a visible series break, not a trend.

## Attribution to administrations

Computed, never hand-assigned. Tenures come from the single existing table
(`ADMINISTRATIONS` → `administrations.json`; no second terms file) through
`termIdForDate`. A fiscal year is attributed to the administration **in office on
its last day, Sept 30** (`administration_term_id`). Per row:

- `blended` — true if the administration changed within the year;
- `administration_days` — calendar days under each administration (a Jan 20 day
  belongs to the incoming president).

Blended years: **FY2009, FY2017, FY2021, FY2025** (111 days outgoing / 254
incoming each). **The removal count is NOT split** — no ICE source resolves
removals by date (see source notes §3), and nothing is estimated. FY2025 is
therefore attributed to Trump's second term by the Sept 30 rule while ~30% of its
days (and an unknown share of its removals) fall under Biden; a chart must mark
it as blended.

## Status and preliminary years

`final` = ICE has published the figure as a locked year-end total. `preliminary` =
anything ICE has not locked: the in-progress year always, and **FY2025** (taken
from ICE's FY2027 budget overview; no annual report yet). The build fails if a
year that ends on or after the retrieval date is marked `final`. FY2026 is absent
(no ICE file) — missing is missing, never interpolated or filled from another
agency.

## Validation (fails the build, `pnpm transform`)

Zod on the catalog and outputs; every figure's quoted evidence must appear
verbatim in the snapshot's text extract and contain the number; xlsx table values
are checked by column; corroborating documents are checked the same way; ICE's
published FY2013 (368,644) and FY2023 (142,580) are hard anchors; FY2013 interior
+ border = total; no negatives, no duplicate `(period, metric, scope)`, strictly
increasing periods; unknown note ids fail. Results: `enforcement_report.json`
(rows, gaps, status counts, blended years, which years are corroborated by a second
ICE document, which are single-source, the FY2021 chart read, source hashes).

## Refreshing

**Manual.** ICE's year-end figures are locked once published, and its URLs are
unstable (dead links, new locations each year, dashboards with no export), so a
scheduled scraper would be brittle and no GitHub Action was added. To add a year
or replace a preliminary one: (1) add the ICE document to `sources` in
`pipeline/reference/ice-removals-catalog.json`, plus a `years` row with a
verbatim quote; (2) `pnpm fetch:ice` (needs `pdftotext` and `unzip`) to snapshot
it and write the text extract; (3) `pnpm transform`; (4) review the diff. Append
the next inauguration to `ADMINISTRATIONS` first when a new term starts.
