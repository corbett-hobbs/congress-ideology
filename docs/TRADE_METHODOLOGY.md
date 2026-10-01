# Trade methodology (U.S. Census Bureau)

How `pipeline/fetch/census-trade.ts` → `pipeline/transform/trade.ts` (+ `trade-run.ts`)
turn Census files into the trade track. Schemas: `lib/trade-entities.ts`. Source
findings and the investigation that shaped this: `docs/TRADE_INVESTIGATION.md`.
Same family as the other non-Congress tracks (`DATA_CONVENTIONS.md` §8–§9): there is
no `bioguide_id`; the join key is `country_code`, and time joins are by date.

## What these numbers are

Trade **flows** during a period. A balance or a collected rate describes what the
statistics recorded then; nothing here attributes cause to a president or Congress.
All trade values are $ millions unless a field says whole dollars (duties).

## Series

| Output | What it is | Basis | Window |
| --- | --- | --- | --- |
| `trade_national.json` `basis=bop`, `frequency=annual` | U.S. exports, imports, balance of goods and services (`scope` goods_services / goods / services) | Balance of payments | 1991–2025 (source starts 1960) |
| `trade_national.json` `basis=census`, `scope=goods` | World goods total, monthly, seasonally adjusted (`sa`) and not (`nsa`), plus annual `nsa` | Census | 1991-01 – latest |
| `trade_by_country/<year>.json` | Goods exports and imports per partner: 12 monthly values, annual totals, annual balance | Census | 1991 – latest (source starts 1985) |
| `duties_by_country/<year>.json`, `duties_national.json` | Calculated duties, imports for consumption, derived rate. Each row carries `source`: `census_api` (2010-01 onward, refreshed weekly) or `usitc_dataweb` (**1993-01 – 2009-12**, a frozen one-time pull) | Census (entries) | **1993-01** – latest |
| `countries.json` | One row per Census partner code; the `country_code` join key | — | — |

**BOP basis vs Census basis differ by design** (BOP adjusts Census goods for coverage and
timing). 1991 goods: BOP −$76,937M vs Census −$66,723M. They are never reconciled or
mixed; each row says which it is. 2025 goods: BOP −$1,240,941M vs Census −$1,234,619M.

**Monthly goods and services is not built here.** Census's Seasonally Adjusted (Nominal) Data
page appears to list a monthly goods, services and total series (BOP basis) from 1992 (not
verified against the file; see `TRADE_INVESTIGATION.md`). It is out of scope for the first trade
page by decision: the monthly series here is goods only, Census basis. Annual goods and
services (BOP) covers the full window.

## Collected rate: what it is and is not

`rate = CAL_DUT / CON_VAL` from the Census international trade API (`imports/hs`):
**calculated duties** over **imports for consumption, customs value**, per country and month.

- *Calculated* duties are Census's computation from entry data (rate × dutiable value), not
  Treasury's customs receipts. 2025 sums to about $259B here; do not describe it as
  "tariff revenue collected" or compare it to the Monthly Treasury Statement without that caveat.
- **Denominator choice.** Imports for consumption (what is entered for domestic use, the
  population duties are assessed on) in customs value — *not* the general imports in
  `trade_by_country`, which also include goods entering bonded warehouses and trade zones.
  This is why a country's duties-file import value differs from its goods-file imports.
- It is an **average rate on all imports**, so it moves with the mix (zero-duty goods, shifted
  sourcing) as well as with tariff policy. It is not a statutory rate.
- The Census API has nothing before January 2010 (every endpoint returns 204 for 2009-12 and
  earlier). **1993-01 to 2009-12 comes from USITC DataWeb** (next section).
- Months with no import row for a country are 0 (rate `null`); months not yet published are `null`.

## Duties bridge, 1993–2009 (USITC DataWeb)

A **frozen, one-time pull**, not part of `fetch:all` or the freshness workflow, and not
automated. Run by `pnpm fetch:dataweb-duties` (needs `DATAWEB_TOKEN`, a six-month API key from a
DataWeb account) on 2026-10-01; raw files with their query parameters in
`pipeline/raw/dataweb-duties/<year>.json`. Query: Imports for Consumption, Calculated Duties and
Customs Value, all commodities aggregated, monthly, by country and all countries together. The
raw rows use the Census API's tuple shape and Census country codes (DataWeb's country `value`),
so the same transform builds both.

- **Same measure, same basis.** DataWeb serves the Census Bureau's entry data. Over a 36-month overlap
  (2010-01 to 2012-12) every one of 8,280 country-months (230 countries) and all 36 all-countries
  months equal the Census API values to the dollar, for both calculated duties and customs value.
  Tolerance proposed and used: exact for the overlap; the validation tolerance for the bridge
  years is the existing 0.1% country-sum check (measured worst: 0 in every month).
  Gaza Strip and West Bank are in the Census API but not DataWeb's country list; they carry no
  duties before 2010.
- **National cross-check.** DataWeb's 1989 national figures (duties $16,096,409,507; customs value
  $468,012,021,240) equal USITC's published table (1891–2025: $16,096,410K and $468,012,021K). Only
  that year was compared, from the search summary of the table; the PDF could not be fetched. The
  average rate is continuous across the source change (2009 1.37%, 2010 1.36%).
- **Why 1993, not 1991.** USITC states that dutiable value and calculated duties before 1993 are
  **overstated** (not adjusted for the nondutiable part of imports under HTS 9802.00.60 and
  9802.00.80). 1991–92 are therefore not on the same basis as later years and are not included. The
  data exists in DataWeb (1989 on); adding them would need a decision to show them flagged.
- **Granularity.** Monthly by country is available for the whole bridge; nothing is annual-only.
- **A real break to expect, not an artifact:** the average rate falls from 3.2% (1993) to about 1.4% by 2007,
  with a step down in 1995 (3.18% to 2.51%), the years of NAFTA and the Uruguay Round tariff cuts. The UI must not
  describe a 1993 vs 2010 difference as a source effect, or as policy alone (mix matters; see above).
- **Source flag.** `source: "usitc_dataweb"` on every 1993–2009 row (country and national), `"census_api"` from
  2010. A year has exactly one source (the build fails otherwise), so no chart point blends them. The UI can say
  earlier years come from USITC DataWeb.
- Recodes and dissolved states are handled by the existing crosswalk (same Census codes). A DataWeb name that
  is not in DataWeb's country list fails the fetch; none did for 1993–2009.
- Revisions: Census restates history; this pull is a snapshot as of `fetched_at` and is not refreshed.

## Country codes

`country_code` is the join key. Rows in `countries.json` are one per **Census code**
(`census_code` is the source id); a `country_code` can have several Census codes.

- **ISO 3166-1 alpha-3** from Census's own Schedule C alpha-2 (`country.txt`) widened in
  `trade-iso.ts`. 237 partners are `kind=country`; a Census "country" includes dependencies
  and special areas (Hong Kong, Greenland, Puerto Rico), not only sovereign states.
- **No clean ISO3:** Kosovo `XKX`, West Bank `XWB`, Gaza Strip `XGZ` (ISO files both of the
  latter under one entity; Census reports them separately, so each gets a user-assigned code).
- **Dissolved or superseded codes** keep an ISO 3166-3-style code: `SUN` (USSR), `CSK`
  (Czechoslovakia), `YUG` (Yugoslavia), `SCG` (Serbia and Montenegro), `ANT` (Netherlands
  Antilles), `NTZ` (Iraq–Saudi Neutral Zone). `kind=former`, with a note on the successors.
- **Recodes keep one series.** Where Census moved a country to a new code, the codes share
  one `country_code` and their months are summed (Ethiopia 7740→7749 in 1993, Sudan 7320→7321
  in 2011, Serbia 4802→4801 in 2009). Distinct codes are exclusive partners, so this cannot
  double count; a changeover month can carry both (Ethiopia June 1993 does). Ethiopia's old code
  7740 included Eritrea; Eritrea (`ERI`) is reported from 1993. Sudan through 2011 includes
  South Sudan, which reports separately (`SSD`) from 2011, so Sudan's series drops at that break.
  Czech Republic and Slovakia start in 1993 (`CSK` covers Czechoslovakia in 1992); Russia etc. start in 1992 (`SUN` covers 1991–92), so no country series spans those breaks.
- **Germany** is one code (`DEU`, 4280) across the window; no East/West split appears after 1991.
- **Unallocated:** `UNALLOC_8220` (Unidentified Countries), `UNALLOC_8500` (International
  Organizations) are Census residuals and **are part of the country sum**.
- **Aggregates** (`is_aggregate=true`, code `AGG_<census code>`): World (NSA/SA), EU, regions,
  NAFTA/USMCA, CAFTA-DR, Pacific Rim, Advanced Technology Products. Filter on `is_aggregate`
  before summing countries. Aggregate codes in the duties API use a different numbering
  (e.g. `0021` is a different group there) and are not carried; the duties files hold countries
  only, and `duties_national.json` is the API's own all-countries row.

## Grain and size

Sharded by year (the `line-items/<year>.json` precedent), one row per (country, year) with
12-month arrays, so a selected year's partner table is one file and a country's series is a
walk over shards at build time. Measured: `trade_by_country/*` 2.0 MB total, largest year
59 KB; `duties_by_country/*` 1.5 MB total, largest year 94 KB; `trade_national.json` 149 KB.
Nothing is fetched at runtime in the app.

## Validation (fails `pnpm transform`)

Zod on every output row, and, in `trade.ts` `validateTrade` (tolerances in `TOL`):

- exports − imports = balance (national within $1.5M — the BOP table is in whole $M;
  by-country within $0.1M); no negative exports/imports; no duplicate keys.
- Each country-year's 12 months sum to its annual column within $1M (measured worst: $0.4M).
- **Within the Census basis**, non-aggregate country rows sum to the World NSA total each
  month within 0.2% (measured worst, 1992 onward: 0.07%). Before 1992 Census itemizes only
  about 80 partners, so countries cannot sum to World: the tolerance there is 3% and the
  measured shortfall is 2.1% (worst month, 1991-12 exports). A page must not present 1991
  country shares as summing to 100%. BOP totals are never forced to match Census country sums.
- Duties: country rows sum to the all-countries row within 0.1% for duties and imports
  (measured worst: 0, both sources), `rate = duties / import value`, no duties row for an aggregate, and every
  row's `source` equals its year's all-countries source.
- No gaps: BOP annual 1991–latest; monthly goods (NSA and SA) 1991-01 – latest; duties
  1993-01 – latest; every year has country rows.
- An unmapped Census country code, a changed column layout in either spreadsheet, or a
  duties row with an unknown code fails with a specific message.

Spot checks against Census's own fetched tables run in `pipeline/transform/trade.test.ts`
(1985 BOP goods and services −$121,879M / $289,071M / $410,951M; 1991 BOP and Census-basis figures).

## Latest month

`country.xlsx` zero-fills months not yet published. The last published month is the newest
month where the World NSA total is non-zero; later months of that year are `null`. The duties
file's last month is the newest month the API returned. The two can differ.

## Revisions

Census restates history (annual revisions each June). Raw snapshots are replaced on refresh
and the weekly job (`trade-freshness.yml`) opens a PR when the rebuilt output differs;
never auto-merged. Values are the latest revised as of the fetch (`fetched_at` in the duties raw files).
