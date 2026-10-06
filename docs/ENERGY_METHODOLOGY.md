# Energy methodology (U.S. Energy Information Administration)

How `pipeline/fetch/eia.ts` -> `pipeline/transform/energy.ts` (+ `energy-run.ts`) turn EIA API v2 responses into the
energy track, and how `pipeline/reference/energy-actions.json` becomes the flags file. Schemas and the series catalog:
`lib/energy-entities.ts`, `lib/energy-actions-entities.ts`. Source findings and the decisions behind this design:
`docs/ENERGY_PREFLIGHT.md`. Same family as the indicators track (`DATA_CONVENTIONS.md` section 8): no `bioguide_id`; time joins are
by date, through `ADMINISTRATIONS` + `termIdForDate`.

## What these numbers are

**Conditions during a period, not attributions of cause.** A production, import or generation figure during a presidency or a
Congress describes what was true then. Only the Strategic Petroleum Reserve level is close to presidential, and even it is shared with
Congress (mandated sales, appropriations, cancellations). Each series carries a `tier` (1 shared presidential, 2 policy-enabled but
mostly market/technology, 3 weakly attributable context). Any page that shows these series must say the above.

## Series

Fetched 2026-10-06 (counts and last periods are in `pipeline/output/energy_report.json`). Native units are kept; nothing is converted.
All series are **not seasonally adjusted**.

| Group | Series (id) | Route | Freq. | First | Last | Units |
| --- | --- | --- | --- | --- | --- | --- |
| Petroleum | `PNPRPUS` total petroleum field production; `PAPRPUS` crude production; `PAIMPUS`, `PAEXPUS`, `PANIPUS` total petroleum imports, exports, net imports; `PATCPUS` products supplied; `COIMPUS`, `COEXPUS` crude imports, exports | `total-energy` (Monthly Energy Review), facet `msn` | monthly | 1973-01 (`COEXPUS` 1973-05) | 2026-08 | thousand barrels per day |
| SPR | `WCSSTUS1` SPR crude stocks | `petroleum/stoc/wstk` | weekly (week-ending) | 1982-08-20 | 2026-09-25 | thousand barrels |
| Gas | `NGPRPUS` dry production | `total-energy` | monthly | 1973-01 | 2026-06 | billion cubic feet |
| Gas | `N9133US2` LNG exports | `natural-gas/move/expc`, facet `series` | monthly | 1997-01 | 2026-07 | million cubic feet |
| Electricity | `CLETPUS` coal, `NGETPUS` gas, `NUETPUS` nuclear, `HVETPUS` conventional hydro, `WYETPUS` wind, `SOETPUS` utility-scale solar, `PAETPUS` petroleum, `ELETPUS` total | `total-energy` | monthly | 1973-01 (wind 1983-01, solar 1984-01) | 2026-06 | million kilowatthours |
| Electricity | `ELEC_SMALL_SOLAR` small-scale solar PV (estimated), fuel type `DPV`, all sectors, U.S. | `electricity/electric-power-operational-data` | monthly | 2014-01 | 2026-07 | thousand megawatthours |

Not ingested, on purpose: energy CO2 (deferred), total primary energy balance, crude prices, retail gasoline (already on the Economy page
through FRED), weekly crude estimates, sector-level electricity.

## Dates

Monthly periods (`YYYY-MM`) are stored as the **first day of the month**, like FRED monthly series. Weekly SPR dates are the
published week-ending day. Full history is always ingested; the display window (`ENERGY_DISPLAY_START`, an alias of
`INDICATORS_DISPLAY_START` = 1991-01-21) is applied only by the serving layer. LNG (1997) and small-scale solar (2014) start after the
window and are checked from their own first observation (`late_start`).

## Traps (read before drawing)

1. **Crude vs total petroleum.** `PAPRPUS` is crude only (13,662 thousand b/d in 2025); `PNPRPUS` adds natural gas liquids (21,177);
   products supplied is 20,736. Compare like with like: the balance uses the total-petroleum family; crude-only series are labelled
   "crude oil".
2. **Units.** Petroleum flows are *rates* (thousand barrels per day); the SPR is a *stock*. Electricity is million kWh in MER and thousand MWh
   from the v2 electricity route; the two are numerically equal and are labelled separately.
3. **Small-scale solar.** The MER electricity table is **utility-scale only**. The estimated small-scale series begins in 2014 and was
   93,148 thousand MWh in 2025 against 295,671 utility-scale: leaving it out understates solar (and total generation) from 2014. It is a
   separate series; it is not spliced into the utility-scale one.
4. **Sector coverage.** Through 1988 the electricity table covers electric utilities only; from 1989, utilities and independent power
   producers (and all-sectors adds commercial and industrial plants). Pumped storage is split from conventional hydro from 1990.
5. **Missing markers.** The API returns text, not blanks, for missing values: `Not Available` (wind before 1983, solar before 1984) and
   `No Data Reported` (crude exports 1973-01 to 1976-09). These rows are skipped, never coerced to 0; any other non-numeric string fails
   the build. Small negative values in the early solar and wind history are genuine and kept.
6. **LNG start.** The series starts in 1997; large-scale exports from the lower 48 begin in February 2016 (26 MMcf in 2016-01, 3,309 in
   2016-02, 10,078 in 2016-03). What the earlier volumes were is not verified.
7. **API truncation.** The API returns at most 5,000 rows per request and does not warn. Every series is paged by `offset`, and the fetch
   fails unless the rows received equal `response.total`; the transform fails again if a snapshot's row count differs from its stored total.
8. **Redefinition guard.** The transform fails if EIA reports different units for a series than the catalog expects.

## Status: final or preliminary

Each observation has `status`. Rules (`lib/energy-entities.ts`, `statusFor` in `transform/energy.ts`):

- Petroleum and gas (`trailing_12_months`): the last 12 months up to the series' last observation are preliminary. EIA's monthly
  petroleum figures are preliminary until the Petroleum Supply Annual; the real lag was **not verified**, so 12 months is a conservative
  placeholder. Revise it when verified.
- Electricity (`current_and_prior_calendar_year`): EIA's Electric Power Monthly states that values for 2024 and prior years are final and 2025 and
  2026 are preliminary; the rule is the year of the fetch and the year before it.
- SPR: a stock reading, always `final`.

The newest petroleum month can come from the Monthly Energy Review and run beyond the Petroleum Supply Monthly (2026-08 vs 2026-07 at the
time of writing); the Monthly Energy Review says its newest month is "sometimes estimated or forecasted". Do not splice a Monthly Energy
Review tail onto a Petroleum Supply Monthly history. Observed vintage gaps between the two for the same month: crude production
2026-07 13,817 vs 13,948 (0.9%), 2026-06 13,792 vs 13,844 (0.4%).

## Revisions and the weekly job

`.github/workflows/energy-freshness.yml` (Tuesdays; needs the repo secret `EIA_API_KEY`) re-fetches, applies the rule in
`pipeline/fetch/energy-diff.ts`, and opens a PR only when it trips; auto-merged only after the CI gate passes:

- a new period, a removed one, or a missing<->value flip always counts;
- a revision to a **final** observation always counts, however small;
- a revision to a **preliminary** observation counts only above the series' `revision_tolerance` (about 1%, in the series' units).

Every revision, material or not, is listed in the PR body, largest first. `fetched_at` is kept while the data is unchanged, so an idle week
produces no diff. No vintages are stored; values are the latest as of the fetch.

## Source and attribution

EIA content is public domain. EIA asks for an acknowledgment with the publication date; there is no required notice (unlike FRED).
The page shows a plain source line (`EIA_ATTRIBUTION`) and does not use EIA's logo or "Energy Ant" mark.

## Policy actions (`energy_actions.json`)

Curation rules: `docs/ENERGY_ACTIONS_CURATION.md`. A flag is a *date beside a series*, never a claim of cause; `lagged_effect` marks the
actions whose enabling act precedes the market by years (crude export repeal, LNG decisions, energy tax credits).

## Grain and size

`energy_observations.json`: 20 series, about 12,400 rows, **1.04 MB** (full history from 1973; one row per line). `energy_series.json`
15 KB, `energy_actions.json` 18 KB. Raw snapshots 0.43 MB in `pipeline/raw/eia/`. One flat file, no sharding (`DATA_CONVENTIONS.md`
sharding is for multi-megabyte files). The windowed page payload will be a fraction of this (monthly series from 1991).

## Validation (fails `pnpm transform` / `pnpm validate`)

Zod on every output row and, in `transform/energy.ts` `validateEnergy`: every catalog series present and nothing extra, `(series_id, date)`
unique, series rows agree with the observation file (count, first, last), the display-window coverage assertion (no gap over twice the
nominal frequency; late starts checked from their own first observation), and no final observation after a preliminary one. Spot checks run
in `pipeline/transform/energy.test.ts` against figures taken from independent EIA files (monthly 1991 coal and total generation sum to MER's
own annual totals; the latest crude production month; the latest weekly SPR value; the 2016-02 LNG value).
