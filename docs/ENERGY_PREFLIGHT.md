# Energy page — pre-flight inventory

Session 0 of the Energy plan. Investigation only: no pipeline code, no UI, no `lib/verticals.ts` change. Every number below was
fetched on **2026-10-06** (the "fetch date" in every table) unless a line says otherwise. Anything not verified this session is
labelled **UNVERIFIED**. Scratch samples live outside the repo (`/tmp/eia-preflight/`); nothing was committed from them.

Conventions followed: dates, never `bioguide_id`, are the join key (same as Economy and Trade); every proposed file reuses an
existing primitive (named inline).

---

## 1. Summary and verdict

**Energy is viable as a Presidency section, on a narrower claim than the working framing.** EIA publishes everything the page needs
with monthly or weekly cadence, back before the 1991 display window, free and in the public domain. The data fits the Economy/Trade
pattern with no new primitive: monthly series on `lib/indicator-time.ts`, one weekly series (SPR), a curated flags file in the
`tariff_actions.json` mould. One page, not two (section 10).

Only **one** series is close to "directly presidential": the Strategic Petroleum Reserve level, and even that is shared with Congress
(mandated sales, appropriations, and a 140 MMbbl cancellation of mandated sales, all per DOE's own pages). Everything else is
"conditions during a term", the same honest framing Economy uses. The page works if it says so out loud.

Main risks, in order:

1. **Timeliness and attribution of the live 2026 story.** The SPR fell from 413.5 to 283.8 MMbbl between 2026-01-02 and 2026-09-25, the lowest level in the weekly series
   since 1982-83 (the series starts 1982-08-20 at 270.5). DOE's own page ties that to a March 2026 presidentially authorized exchange release.
   It is an *exchange* (barrels come back, with a premium), not a sale. Flag wording has to say so.
2. **Definition traps** (section 4): crude vs total petroleum; MER's electricity table silently excludes small-scale solar (about
   24% of all solar in 2025); LNG "exports" before 2016 are not the shale-era trade.
3. **Silent truncation in the API:** `/data` returns at most 5,000 rows and gives **no warning** when it truncates (verified). The fetch
   script must page against `response.total`.
4. **Preliminary tails** with measurable vintage gaps (up to ~0.9% on the same month between two EIA products), so a partial-period
   treatment is required (section 5).
5. **Lagged policy.** LNG exports and crude exports moved years after the permits or statute that enabled them. A flag on a chart reads as
   cause unless the copy and placement avoid it (section 7).

---

## 2. Access, terms, attribution, update cadence, key

| Question | Finding (fetched 2026-10-06) |
| --- | --- |
| Current access method | **API v2** (`https://api.eia.gov/v2/`), key required. A keyless call returns `API_KEY_MISSING` (403). |
| Bulk download | Still live and refreshed: `https://www.eia.gov/opendata/bulk/manifest.txt` lists 27 datasets; `PET` was updated 2026-10-06 13:46, `NG` 2026-10-01, `TOTAL` (MER mirror) 2026-09-30, `ELEC` 2026-09-23. **`EMISS` is stale (last update 2023-07-12)**. Bulk files need no key (PET.zip 56 MB, NG 4.4 MB, TOTAL 3.2 MB, ELEC 293 MB). No page I fetched says whether bulk is deprecated; the API documentation page does not mention it. Treat bulk as a fallback, not the plan. |
| Recommended path | API v2 route **`total-energy`** (`/v2/total-energy/data`, facet `msn`): it serves the Monthly Energy Review tables. Verified byte-for-byte against the MER CSV for `PAPRPUS` (2026-08 = 13,850.419) and covers 1949 onward, monthly and annual. Weekly SPR from `petroleum/stoc/wstk` (series `WCSSTUS1`, 2296 rows, 1982-08-20 to 2026-09-25); its latest value matches the bulk file (283,767). One route family, one key, one paging loop. |
| Key and limits | Free key required (registered by the project owner; present in `.env.local` as `EIA_API_KEY`, never printed or committed). Documentation says rows are capped at 5,000 per request (XML 300), paged with `offset`/`length`. **Verified:** a request for `length=9000` over 566,061 matching rows returned exactly 5,000 with `warnings: null`. Rate limits are described only as "throttle per second and per hour", with temporary key suspension for abuse; **no numeric limit is published (UNVERIFIED)**. No `X-RateLimit` headers were returned. |
| Deprecated routes (do not build on) | `co2-emissions/*` is labelled "deprecated: see SEDS" and ends 2022; `seds` is annual and ends 2024; bulk `EMISS` ends 2021. The usable CO2 series is MER Table 11.1 via `total-energy` (section 3). |
| Licence | EIA content is public domain; reuse is free. EIA asks for an acknowledgment with the publication date (its example wording: "Source: U.S. Energy Information Administration (Oct 2008)"). The EIA logo and "Energy Ant" are trademarks and may not be used. The API Terms of Service Agreement the key registration refers to was **not fetched (UNVERIFIED)**. |
| Required notice | **None is required** (unlike FRED, which has `FRED_API_NOTICE`). Recommended: a plain open Source line, "Source: U.S. Energy Information Administration, Monthly Energy Review and Petroleum Supply Monthly, retrieved <date>". Existing Economy gasoline attribution already credits EIA via FRED; no conflict. |
| Cadence and lag | MER: monthly (current release 2026-09-29; "most tables present a new month ... usually preliminary (and sometimes estimated or forecasted) and likely to be revised the following month"). Petroleum Supply Monthly: data for **July 2026** released 2026-09-30, next 2026-10-30 (~2 months lag; "preliminary; final data appears in the Petroleum Supply Annual Vol. 2"). Weekly petroleum (SPR, stocks, crude production/trade estimates): weekly, last week ending 2026-09-25 when fetched. Electric Power Monthly: latest July 2026, released 2026-09-24. Natural gas monthly: through 2026-07 on v2, 2026-06 in MER. |

---

## 3. Series inventory

Verdict key: **include** = in the recommended v1; **defer** = real series, not in v1; **drop** = fails the honest-band test or duplicates.
"MSN" is the MER series name and is the facet value on `total-energy`. Last period is as fetched; "status" is what the
last observation is (see section 5). All MER monthly values are **not seasonally adjusted** (MER prints NSA; no adjusted variant exists in these tables).
Tier = section 6.

### 3a. Petroleum balance (MER Table 3.1, 3.3b, 3.3e; weekly and monthly PET bulk/v2)

| Concept | Route / series | Freq | First | Last (fetched 10-06) | Units | Adjust. | Status of last obs | Tier | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Crude oil production, total | MER `PAPRPUS` (T3.1) | M, A | 1973-01 mo / 1949 ann | 2026-08 mo / 2025 ann | thousand b/d | NSA | 2026-08 is beyond PSM (which runs to July), so it is MER-only and, per MER's own wording, may be estimated or forecasted (basis not fetched, UNVERIFIED); 2026-07 differs from PSM by 0.9% (13,817 vs 13,948) | 2 | **include** |
| Total petroleum field production (crude + NGL) | `PNPRPUS` | M, A | 1973-01 / 1949 | 2026-08 / 2025 | thousand b/d | NSA | as above | 2 | **include** (headline for the balance, see sec. 4) |
| Petroleum imports, total | `PAIMPUS` | M, A | 1973-01 / 1949 | 2026-08 / 2025 | thousand b/d | NSA | as above | 2 | **include** |
| Petroleum exports, total | `PAEXPUS` | M, A | 1973-01 / 1949 | 2026-08 / 2025 | thousand b/d | NSA | as above | 2 | **include** |
| Petroleum net imports | `PANIPUS` | M, A | 1973-01 / 1949 | 2026-08 (−3,784) / 2025 (−2,848) | thousand b/d | NSA | as above | 2 | **include** (derived by EIA, imports − exports) |
| Petroleum products supplied (consumption proxy) | `PATCPUS` | M, A | 1973-01 / 1949 | 2026-08 / 2025 | thousand b/d | NSA | as above | 3 | **include** (label "products supplied", not "consumption") |
| Crude oil imports / exports (crude only) | MER `COIMPUS` (T3.3b), `COEXPUS` (T3.3e); bulk `PET.MCRIMUS2.M`, `PET.MCREXUS2.M` | M, A | 1973-01 | 2026-08 MER; 2026-07 PSM | thousand b/d | NSA | as above | 2 | **include** (secondary line; it is where the 2015 repeal shows) |
| Weekly crude production / trade estimates | v2 `petroleum/...` (bulk `WCRFPUS2.W`, `WCREXUS2.W`, `WCRIMUS2.W`) | W | 1983 / 1991-02-08 / 1990-01-05 | 2026-09-25 | thousand b/d | NSA | weekly estimate, later superseded by PSM | 2 | **drop** (monthly is enough; avoid mixing weekly estimates with monthly finals) |

### 3b. Strategic Petroleum Reserve

| Concept | Route / series | Freq | First | Last | Units | Adjust. | Status | Tier | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SPR crude stocks, weekly | v2 `petroleum/stoc/wstk`, series `WCSSTUS1` (bulk `PET.WCSSTUS1.W`) | W | 1982-08-20 | 2026-09-25: 283,767 | thousand barrels | none (stock) | latest week is the weekly estimate; EIA's SPR figures come from DOE inventory, revision small (UNVERIFIED size) | 1 (shared with Congress) | **include** (headline SPR chart) |
| SPR crude stocks, monthly | MER `COSQPUS` (T3.4, million bbl); bulk `PET.MCSSTUS1.M` | M, A | 1977-10 | 2026-08 MER: 285.893 million bbl (PSM monthly series ends 2026-07: 304,810 thousand bbl) | million bbl (MER) | none | MER vs PSM differ by ~0.9 MMbbl for 2026-07 (303.935 vs 304.810) | 1 | **defer** (weekly is the primary; monthly only if the weekly axis is not wanted) |
| SPR crude imports | MER `COQIPUS` | M | 1977-10 | 2026-06 | thousand b/d | NSA | — | 1 | **drop** (context only) |
| **Machine-readable history of releases, sales, exchanges, purchases** | **None found.** DOE: `energy.gov/hgeo/opr/history-spr-releases` is narrative (no table); the "Historical SPR Oil Sales and Exchanges" PDF is dated 2016-08-10 and ends at 2014; `energy.gov/hgeo/opr/spr-sales-and-exchanges` has no table or download. EIA publishes stock levels, not an action list. | — | — | — | — | — | — | 1 | **hand-curated** like `tariff_actions.json` (section 7) |

SPR level by inauguration (nearest weekly observation, MMbbl, fetched): 1993-01-22 **575.1**; 2001-01-19 **540.7**; 2009-01-23 **702.8**; 2017-01-20 **695.1**;
2021-01-22 **638.1**; 2025-01-17 **394.6**; latest 2026-09-25 **283.8**. All-time weekly peak **726.6** (week of 2010-01-01).
These are conditions at a date, not a score; the Biden-era fall (2021 638 to 2025 395) and the 2026 fall are both exchanges/sales whose purposes differ (DOE pages in section 7).

### 3c. Natural gas

| Concept | Route / series | Freq | First | Last | Units | Adjust. | Status | Tier | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dry natural gas production | MER `NGPRPUS` (T4.1); bulk `NG.N9070US2.M/.A` | M, A | 1973-01 / 1949 (bulk annual 1930) | 2026-06 MER / 2026-07 v2/bulk | Bcf (MER), MMcf (bulk) | NSA | MER tail preliminary (MER note); v2 is one month ahead | 2 | **include** (context for the energy-supply story; unit conversion is a pipeline item) |
| LNG exports | bulk `NG.N9133US2.M/.A`; MER T4.1 has total exports `NGEXPUS` (pipeline + LNG) | M, A | **1997-01 mo / 1985 ann** | 2026-07 mo / 2025 ann: 5,508,984 MMcf | MMcf | NSA | preliminary | 2 | **include** (candidate); v2 route for LNG was not isolated this session (**UNVERIFIED**), bulk id verified |
| Natural gas pipeline exports | bulk `NG.N9132US2.M` | M | 1997-01 | 2026-07 | MMcf | NSA | preliminary | 2 | **drop** (not the story) |

Scale check: annual LNG exports 2015 = 28,381 MMcf, 2016 = 186,841, 2017 = 707,542, 2020 = 2,389,963, 2024 = 4,367,170, 2025 = 5,508,984.
Monthly: 2016-01 = 26 MMcf, 2016-02 = 3,309, 2016-03 = 10,078, so large-scale exports from the lower 48 begin in **February 2016** (the series starts
earlier because it counts all LNG leaving the U.S.; what produced the pre-2016 volumes is **UNVERIFIED**).

### 3d. Electricity generation by source

| Concept | Route / series | Freq | First | Last | Units | Adjust. | Status | Tier | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Net generation by fuel, all sectors, **utility-scale** | MER T7.2a: coal `CLETPUS`, gas `NGETPUS`, nuclear `NUETPUS`, conv. hydro `HVETPUS`, wind `WYETPUS`, solar `SOETPUS`, petroleum `PAETPUS`, other (wood `WDETPUS`, waste `WSETPUS`, geothermal `GEETPUS`, other gases `OJETPUS`, pumped storage `HPETPUS`), total `ELETPUS` | M, A | 1973-01 mo / 1949 ann (solar 1984, wind 1983, pumped storage 1990, other gases 1989) | 2026-06 mo / 2025 ann | million kWh | NSA | EPM wording (fetched): "values for 2024 and prior years are final; 2025 and 2026 are preliminary" | 3 | **include** (shares, stacked) |
| Small-scale solar PV (estimated) | v2 `electricity/electric-power-operational-data`, `fueltypeid=DPV`, `sectorid=99`, `location=US`; total solar = `TSN` | M, A | **2014** | 2026-07 mo (10,925 thousand MWh) / 2025 ann: 93,148 | thousand MWh | NSA | estimated; EPM table: values for 2024 and prior final | 3 | **include as one separate line** (see sec. 4) |
| Sector-level (electric power sector only) | MER T7.2b `*EGPUS` | M, A | 1973-01 | 2026-06 | million kWh | NSA | as above | 3 | **drop** (all-sectors is the definition that matches 1989+ practice; one definition only) |

2025 mix of utility-scale net generation (all sectors, share of MER total): coal 16.6%, gas 40.8%, nuclear 17.7%, hydro 5.6%, wind 10.5%, solar 6.7%.
1991: coal 51.7%, gas 12.4%, nuclear 19.9%, hydro 9.4%, wind 0.1%, solar 0.0%. (Solar 2025 excludes small-scale; adding it, solar is 388,820 vs 295,671 thousand MWh.)

### 3e. Energy CO2

| Concept | Route / series | Freq | First | Last | Units | Adjust. | Status | Tier | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Energy-related CO2, total | MER T11.1 `TETCEUS` via `total-energy` | M, A | 1973-01 / 1973 | 2026-06 / 2025: 4,916.4 | million metric tons CO2 | NSA | MER tail preliminary; **derivation method (activity x coefficient) not fetched, UNVERIFIED** | 3 | **defer** |

Annual: 1991 = 4,992.9; 2007 = 6,015.3; 2019 = 5,147.0; 2020 = 4,585.2; 2025 = 4,916.4. The v2 `co2-emissions` route (ends 2022, deprecated) and bulk `EMISS` (ends 2021) are not usable.
Verdict is defer because it fails the honest-band test at the series level (tier 3) and adds a chart that cannot carry a clean policy flag; it costs nothing to add later (same route).

### 3f. Overlap and extras

- **Retail gasoline:** already on the Economy page (`GASREGW`, weekly, source EIA, via FRED; `docs/INDICATORS_METHODOLOGY.md`). **Not inventoried here.** MER T9.4 also has monthly retail gasoline (`RUUCUUS`, 1976-); do not add it.
- **Add (short):** Total primary energy production vs consumption (MER T1.1: `TEPRBUS`, `TETCBUS`, quadrillion Btu, monthly 1973- / annual 1949-, last 2026-06 / 2025) and renewable share (T1.2, `REPRBUS`; note solar here starts 1984, wind 1983). Tier 2/3, **defer**: they restate the oil and electricity charts in a different unit (Btu), which would add a second unit system.
- **Crude price** (MER T9.1, refiner acquisition cost `RACPUUS`, monthly 1974-): tier 3, **drop** (not directly attributable; the Economy page already carries pump prices).

---

## 4. Definition breaks and traps

1. **Crude vs petroleum products vs total petroleum.** Three different things, all "petroleum" in headlines.
   - Crude oil production, 2025 annual: **13,662** thousand b/d (`PAPRPUS`). Total petroleum field production (adds natural gas liquids): **21,177** (`PNPRPUS`). Products supplied (the consumption proxy): **20,736** (`PATCPUS`).
   - Putting crude production beside product supplied makes the U.S. look like a 13-vs-21 importer. Comparing like with like needs the total-petroleum family: production incl. NGL, imports, exports, supplied, with net imports as a derived line.
   - Net imports of **total petroleum** turned negative on an annual basis in **2020** (within 1991-2025; −2,848 in 2025). Crude-only net imports are a different number (2025: crude imports ~6,166, crude exports ~3,964 thousand b/d, monthly averages from bulk).
   - **Recommendation: headline = total petroleum**, series labelled "petroleum" with a note, and crude shown as a secondary line named "crude oil only". The label must say "thousand barrels per day, total petroleum (crude plus products)".
2. **Units.** Monthly MER petroleum flows are **thousand barrels per day** (a rate; a month's volume is rate x days). SPR and stocks are **stocks** (thousand barrels on the PET routes, **million barrels in MER T3.4**). Gas is Bcf (MER) vs MMcf (bulk). Electricity is **million kWh** in MER, **thousand MWh** in v2 (equal values). Normalize in the transform and state units per chart.
3. **Small-scale solar.** MER Table 7.2 is utility-scale only (its footnote: "does not include small-scale solar photovoltaic generation"). The v2 electricity route estimates small-scale PV separately (`DPV`) **from 2014**: 2014 = 11,233; 2025 = 93,148 thousand MWh, i.e. 31.5% on top of MER's 2025 solar (295,671) and 24.0% of total solar (388,820, `TSN`). MER solar therefore understates solar from 2014 on, and electricity totals understate total generation. **Recommendation:** use MER's utility-scale series for the stack, label the chart "utility-scale", and add DPV as its own "small-scale solar (estimated, from 2014)" line. Splicing DPV into the stack would mix two routes and invent a break, and the electricity route only starts 2001, so 1991-2000 total solar cannot come from it.
4. **Sector coverage.** Table 7.2 footnote: through 1988 data are for electric utilities only; from 1989, electric utilities and independent power producers (and "all sectors" adds commercial/industrial plants). The display window starts 1991, so this does not cut the chart, but it must stay in the notes if anyone widens the window. Also: pumped storage is split from conventional hydro from 1990; "other" categories (waste, non-renewable waste, propane) shift in 2001 and 2011 per the table footnotes.
5. **Preliminary months, two products, two answers.** MER and PSM disagree for the same month because they are different vintages (2026-07 crude production: 13,817 MER vs 13,948 PSM/bulk; 2026-06: 13,792 vs 13,844). Pick one source per series and say so; never splice the MER tail onto a PSM history.
6. **API truncation.** 5,000-row cap, no warning (section 2). A no-facet monthly pull over `total-energy` matches 566,061 rows and returns 5,000. The v2 `total-energy` metadata also reports `endPeriod: 2121-12`; ignore the metadata range and use the data.
7. **LNG start.** The series starts 1997-01 (annual 1985); lower-48 large-scale exports begin 2016-02. A chart from the window start would show a long flat line then a ramp; copy must say "exports of LNG began at scale in 2016".
8. **Not seasonally adjusted.** No seasonally adjusted variants were found for these series (`all NSA`); monthly petroleum and electricity swing seasonally, so the chart should offer a 12-month average line or use year-on-year views rather than imply a trend from month-to-month moves. (Economy shows SA series where the source provides them; here none exist.)
9. **Russia/Soviet and other partner series** (section 9) change code patterns mid-history; relevant only to the deferred trade join.

---

## 5. Window and axis fit

- **1991 coverage.** Every recommended series reaches back before 1991 (monthly from 1973; SPR weekly from 1982; MER annual from 1949) except: LNG monthly begins 1997 (annual 1985) (**starts earlier**, so the window rule applies), small-scale solar begins 2014 (**starts later**; `late_start` handling, like diesel `GASDESW`), wind 1983 and solar 1984 (earlier). Nothing begins later than 1991 except DPV. **Fetch full history, window at display** (`INDICATORS_DISPLAY_START = 1991-01-21`, `lib/indicator-data.ts`).
- **Axis.** All monthly series date to the first day of the month (FRED convention in `INDICATORS_METHODOLOGY.md`); `monthIndexOfIso` / `AXIS_START` in `lib/indicator-time.ts` place them. The weekly SPR series dates to its week-ending day, so it needs no resampling, exactly as the weekly gas series does on Economy. **No annual-only series survives** the recommendation, so no "implied monthly precision" problem arises. If CO2 or annual totals are ever added, draw annual points as a step/bar spanning its calendar year (the way `MEHOINUSA672N` and the deficit are handled on Economy), never as a monthly line.
- **Partial period (proposal, consistent with the foreign-aid `is_partial` treatment).** Add `status: "final" | "preliminary"` per observation, computed in the transform from a per-series rule, and shown with the same diagonal hatch the foreign-aid chart uses for a partial year (a status, not a series; ARCHITECTURE_MAP rule 8):
  - Electricity (EPM wording, verified): **preliminary = the current and previous calendar year**; final before that.
  - Petroleum and gas: PSM is preliminary until the Petroleum Supply Annual; the lag is **UNVERIFIED**, so propose "last 12 months preliminary" until verified; the MER-only month beyond PSM (2026-08) is additionally flagged "estimate".
  - SPR weekly: latest week "latest week"; no hatch (a stock reading).
  - Hover/readout text names the status ("preliminary, may be revised").
- **Revisions measured this session** are limited to two same-month vintage comparisons (MER vs PSM): crude production 2026-07 +0.9%, 2026-06 +0.4%; SPR 2026-07 +0.9 MMbbl. **No history of past revisions was fetched (UNVERIFIED)**; the weekly freshness job should record prior values to make this measurable.

---

## 6. Attribution tiers

| Series | Working tier | Assessment |
| --- | --- | --- |
| SPR level | 1 directly presidential | **Partly.** Emergency drawdowns and exchanges are presidential (March 2026 release "presidentially authorized", DOE; the 2021 and 2022 releases directed by the president). But Congress mandates sales and cancels them (DOE 2024-11-08: 140 MMbbl of the 200 MMbbl refill total came from congressional cancellation of mandated sales; the history page lists "2017-23 congressionally mandated" sales) and sets appropriations. Call it **tier 1, shared**: label flags by authority type. |
| Petroleum production, exports, imports, LNG | 2 policy-enabled | **Agree**, with a stronger caveat for exports and LNG: the enabling acts lead the trade by years (repeal Dec 2015, crude exports 465 thousand b/d in 2015 to 2,982 in 2019; LNG large-scale exports start Feb 2016 from projects permitted earlier). A flag on the date of the act shows the move after it, not because of it. Say "enabled", not "caused". |
| Products supplied (consumption) | 2 (framing) / **3 (mine)** | **Disagree.** Consumption is demand: prices, the economy, weather, vehicle fleet. Tier 3. |
| Electricity mix | 3 weakly attributable | **Agree.** The IRA (2022) and the 2025 reconciliation law (Pub. L. 119-21 terminates wind and solar credits) are real, dated congressional actions, but plant build cycles run years. Show the mix as context with the two laws as flags, no causal copy. |
| CO2 | 3 | Agree; **defer** (also because the series is derived). |
| Gas price | 3 | Already on Economy; no duplication. |
| Net imports | 2 | Agree; it is the headline "energy dependence" metric; derived from tier-2 flows. |

**Drop test:** nothing recommended fails outright, but products supplied and the electricity mix are explicitly "context", and the page intro must say so in the same words Economy uses ("conditions during a presidency, not attributions of cause").

---

## 7. Candidate policy-action inventory

Rules: **V** = date and substance confirmed on a primary page fetched this session (URL given). **V\*** = verified, but a detail (named in the note) was not on the page. **UNVERIFIED** = not confirmed from a primary page. Authority: E executive, C congressional, A agency. "Flaggable" says whether it can sit on a time-series chart without implying cause; "avoid cause" means flag only with enabled-not-caused copy. 24 candidates.

| # | Date | Action | Auth. | Status | Primary source (fetched) | Flaggable on |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1991-01 | Desert Storm SPR drawdown; 33.75 MMbbl authorized, 17.3 offered and sold | E (Bush) | V\* (day not on page) | https://www.energy.gov/hgeo/opr/history-spr-releases (and 2016 PDF) | SPR level (any caveat: before the 1991-01-21 window start; mark at the edge) |
| 2 | 2005 | Hurricane Katrina SPR exchange, 11.0 MMbbl | A/E | V\* (year only on page) | same DOE history page | SPR (year only; month UNVERIFIED) |
| 3 | 2011 | IEA-coordinated Libya SPR sale, 30.6 MMbbl | E | V\* (year only) | same page | SPR |
| 4 | 2015-11-06 | State Dept. decides Keystone XL not in national interest; President agrees | E | V | https://obamawhitehouse.archives.gov/the-press-office/2015/11/06/statement-president-keystone-xl-pipeline | no series (event marker only); avoid cause |
| 5 | **2015-12-18** | **Crude oil export ban repealed**: Pub. L. 114-113 (H.R. 2029), title I sec. 101 (in Division O) repeals EPCA sec. 103 and bars federal restrictions on crude exports (IEEPA savings clause) | **C** (signed by Obama) | V | https://www.govinfo.gov/content/pkg/PLAW-114publ113/html/PLAW-114publ113.htm | crude exports; avoid cause (exports 465 thousand b/d 2015, 591 in 2016, 2,982 in 2019) |
| 6 | 2017-01-24 | Presidential memorandum inviting Keystone XL re-application | E | V | https://www.federalregister.gov/documents/2017/01/30/2017-02035/construction-of-the-keystone-xl-pipeline | event marker |
| 7 | 2017-03-23 | Presidential permit for Keystone XL (the March 2017 permit itself was **not** fetched; date is as cited by the 2019 permit text) | E | V\* | cited in https://www.federalregister.gov/documents/2019/04/03/2019-06654/authorizing-transcanada-keystone-pipeline-lp-to-construct-connect-operate-and-maintain-pipeline | event marker |
| 8 | 2017-03-28 | EO 13783 "Promoting Energy Independence and Economic Growth" | E | V | https://www.federalregister.gov/documents/2017/03/31/2017-06576/promoting-energy-independence-and-economic-growth | any; avoid cause |
| 9 | 2017-06-01 | President announces U.S. withdrawal from the Paris Agreement | E | V | https://trumpwhitehouse.archives.gov/briefings-statements/statement-president-trump-paris-climate-accord/ | event marker (CO2/emissions if added) |
| 10 | 2017-08 (notification) / 2020-11-04 (effective) | Formal Paris notification and withdrawal taking effect | E | **UNVERIFIED** (the State Dept. page returned unreadable content) | https://2017-2021.state.gov/on-the-u-s-withdrawal-from-the-paris-agreement/ (fetch failed) | event marker once verified |
| 11 | 2019-03-29 | Presidential permit for Keystone XL (supersedes March 2017) | E | V | https://www.federalregister.gov/documents/2019/04/03/2019-06654/authorizing-transcanada-keystone-pipeline-lp-to-construct-connect-operate-and-maintain-pipeline | event marker |
| 12 | 2021-01-20 | EO 13990 sec. 6 revokes the March 2019 Keystone XL permit | E | V | https://www.federalregister.gov/documents/2021/01/25/2021-01765/protecting-public-health-and-the-environment-and-restoring-science-to-tackle-the-climate-crisis | event marker |
| 13 | 2021-01-27 | EO 14008 "Tackling the Climate Crisis": cites the instrument of acceptance to rejoin the Paris Agreement. (Acceptance date and effective date, believed 2021-01-20 and 2021-02-19, **UNVERIFIED**.) | E | V\* | https://www.federalregister.gov/documents/2021/02/01/2021-02177/tackling-the-climate-crisis-at-home-and-abroad | event marker |
| 14 | 2021-11-23 | SPR: 50 MMbbl made available (up to 32 MMbbl exchange plus accelerated 18 MMbbl mandated sale), coordinated with other countries | E (Biden) | V | https://www.energy.gov/ceser/articles/doe-make-available-release-50-million-barrels-crude-oil-strategic-petroleum-reserve | SPR |
| 15 | 2022-03-31 | SPR: 180 MMbbl release over ~6 months (DOE history page confirms a 180 MMbbl 2022 emergency sale; **the exact date and the 1 MMbbl/day rate come from a search summary only; the White House fact-sheet fetch returned 404**) | E | V\* / UNVERIFIED (date) | https://www.energy.gov/hgeo/opr/history-spr-releases | SPR |
| 16 | 2022-08-16 | Inflation Reduction Act, Pub. L. 117-169 (H.R. 5376); energy provisions, e.g. clean electricity production credit text confirmed present | **C** | V | https://www.govinfo.gov/content/pkg/PLAW-117publ169/html/PLAW-117publ169.htm | electricity mix; avoid cause |
| 17 | 2024-01-26 | DOE pauses decisions on pending non-FTA LNG export applications; already-authorized 48 Bcf/d unaffected | E/A | V | https://www.energy.gov/articles/doe-update-public-interest-analysis-enhance-national-security-achieve-clean-energy-goals | LNG exports; avoid cause (exports kept rising) |
| 18 | 2024-11-08 | DOE: final SPR refill purchase, 200 MMbbl total at $74.75 average (59 purchased, 140 from congressional cancellation of mandated sales) | E/A + C | V | https://www.energy.gov/articles/biden-harris-administration-makes-final-purchase-strategic-petroleum-reserve-secures-200 | SPR |
| 19 | 2025-01-20 | DOE ends the LNG pause, returns to "regular order" | E/A | V | https://www.energy.gov/articles/us-department-energy-reverses-biden-lng-pause-restores-trump-energy-dominance-agenda | LNG; avoid cause |
| 20 | 2025-01-20 | EO 14154 "Unleashing American Energy" (includes LNG-export and deepwater-port provisions) | E | V | https://www.federalregister.gov/documents/2025/01/29/2025-01956/unleashing-american-energy | any |
| 21 | 2025-01-20 | EO 14156 "Declaring a National Energy Emergency" | E | V (title/date; body not read) | https://www.federalregister.gov/documents/2025/01/29/2025-02003/declaring-a-national-energy-emergency | any |
| 22 | 2025-01-20 | EO 14162 directs formal written notification of Paris withdrawal (sec. 3(a)); effective date **UNVERIFIED** | E | V\* | https://www.federalregister.gov/documents/2025/01/30/2025-02010/putting-america-first-in-international-environmental-agreements | event marker |
| 23 | 2025-07-04 | Pub. L. 119-21 (H.R. 1), including termination of wind and solar facilities' sec. 45Y credit | **C** | V | https://www.govinfo.gov/content/pkg/PLAW-119publ21/html/PLAW-119publ21.htm | electricity mix; avoid cause |
| 24 | **2026-03-11** | SPR: presidentially authorized 172 MMbbl emergency exchange (U.S. share of a 400 MMbbl coordinated IEA action), ~120 days, with an announced plan to replace it with ~200 MMbbl within a year | E (Trump) | V | https://www.energy.gov/articles/united-states-release-172-million-barrels-oil-strategic-petroleum-reserve | SPR (**say "exchange", not "sale"**) |

Also fetched, not counted as separate rows: EO 14261 (2025-04-08, coal industry; https://www.federalregister.gov/documents/2025/04/14/2025-06380/reinvigorating-americas-beautiful-clean-coal-industry-and-amending-executive-order-14241), EO 13868 (2019-04-10, energy infrastructure; FR 2019-07656). Refill purchase solicitations 2023-2025 exist on energy.gov (found via search; not fetched, **UNVERIFIED** as rows).

**Not verified:** Keystone XL's Biden cancellation by TC Energy (June 2021), the 2026 war/market context beyond what DOE's own pages say, and the March 2026 delivery progress (search summaries mention completion of 172 MMbbl; **not confirmed on a primary page**). Do not cite those as flags until fetched.

---

## 8. EO and monument angle (report only)

**EOs from the repo (no new source).** `pipeline/classification/eo_topics.json` carries a `topic` per EO; `energy_environment` (code `N`) is one of nine topics. Counted from `pipeline/output/executive_orders.json` (1,541 EOs, 1994-):

| Term | `energy_environment` | all EOs |
| --- | --- | --- |
| Clinton (1993-01-20) | 36 | 307 |
| G. W. Bush | 17 | 291 |
| Obama | 21 | 276 |
| Trump (first) | 15 | 220 |
| Biden | 9 | 162 |
| Trump (second, to fetch date) | 28 | 285 |
| **Total** | **126** (8.2%) | 1,541 |

- 9 of the 126 are `needs_review`; 119 are model-classified, 7 inherited from a parent EO.
- **The topic is "energy and environment" together:** only 44 of 126 titles contain an energy-type word (energy, oil, gas, pipeline, electric, fuel, coal, nuclear, solar, wind, power, renewable, climate, emission, drilling, offshore, LNG), so a count would overstate "energy". EO 13766 (Keystone-adjacent infrastructure reviews) is classed `economy_labor`.
- **Feasible with data already in the repo:** yes, as a small per-year strip or as `links.eo_numbers` on the curated flags (the field `tariff_actions.json` already uses). The eight EOs above are all present with `energy_environment` except 13766.
- **Antiquities Act monuments:** a structured source exists in principle: the Federal Register API returns presidential proclamations, keyless; a keyword search for "National Monument" since 1993 returns **120** proclamation documents, but it includes non-designations (e.g. an ADA-anniversary proclamation), so 120 is an upper bound before classification. Fetching and classifying designations vs modifications vs reductions, plus acreage, is its own session (needs the NPS or agency lists for acreage; **not fetched, UNVERIFIED**). Not required for v1.

---

## 9. Trade-join feasibility (short)

EIA publishes petroleum imports by country of origin: bulk series `PET.MTTIM<code>2.M/.A` ("U.S. Imports from <country> of Crude Oil and Petroleum Products"), **monthly from 1973-01 to 2026-07, annual 1973-2025**, 136 country/group labels. Names versus `countries.json` `name` (exact, case-insensitive): **117 of 136 match; 19 do not**: aggregates (OPEC, Non-OPEC, Persian Gulf Countries), territories (Puerto Rico, Virgin Islands, Midway, Spratly), and variants (Burma, Czechia, Turkiye, Korea, Syria, Yemen, Germany, Denmark, Congo x2, Ivory Coast, Bahama Islands). So a **small alias table (~12) is needed; not a zero-cost join.** Series IDs are not uniform (Russia is `PET.MTTIM_NUS-NRS_2` and ends 2023-11). The v2 `crude-oil-imports` route (company-level, by origin and grade) starts 2009-01. Deferred idea; join key would be date plus ISO3.

---

## 10. Proposed pipeline and page shape (proposal only; nothing created)

**Pattern:** indicators track (key-based fetch, not in `fetch:all`, weekly freshness workflow, materiality rule), plus the tariff-actions curated-file pattern.

| Piece | Name / location | Notes |
| --- | --- | --- |
| Raw | `pipeline/raw/eia/<series>.json` | Full paged responses with `fetched_at`, request params and `response.total` (assert fetched rows equal `total` to catch silent truncation). One file per series, like `pipeline/raw/fred/`. |
| Fetch | `pipeline/fetch/eia.ts`, script `fetch:eia` | Reads `EIA_API_KEY` from `.env.local`; pages with `offset`/`length=5000`; not in `fetch:all` (same as FRED/Census). Repo secret `EIA_API_KEY` for Actions. |
| Transform | `pipeline/transform/energy-run.ts` + pure `energy.ts` | Unit normalisation (Bcf/MMcf, million vs thousand barrels, kWh), per-observation `status`, dates to first-of-month, weekly dates as published. |
| Schemas | `lib/energy-entities.ts` | Series catalog, `ENERGY_DISPLAY_START` (re-export `INDICATORS_DISPLAY_START`; do not add a second constant). |
| Outputs | `pipeline/output/energy_series.json`, `energy_observations.json`, `energy_report.json`, `energy_actions.json` (+ report) | Series catalog; observations at `(series, date)` grain, full history, same shape as `indicator_observations.json`; flags file from curated `pipeline/reference/energy-actions.json`. |
| Reader | `lib/energy-data.ts` (`server-only`) + pure `lib/energy-derive.ts` | Reuse `lib/indicator-derive.ts` windowing and `termIdForDate`; `lib/indicator-time.ts` axis; `lib/economy-presidents.ts` for the Bush 41 term. |
| Size (estimate, not measured) | ~35 series x 428 months (1991-01 to 2026-08) + 1,860 weekly SPR points ~ **16k-18k observations**; with full history from 1973 ~ 25k. **Well under 1 MB; no sharding** (the `DATA_CONVENTIONS` sharding is for multi-MB files). Flags ~25 rows. |
| Freshness | `.github/workflows/energy-freshness.yml`, weekly | Rebuild, PR only if materially different; **never auto-merged**. **Materiality rule (proposed):** open a PR when (a) a new period appears, (b) any final-status observation changes, or (c) a preliminary value moves by more than 1% (observed vintage gaps were up to 0.9%). Compare against `fred-diff.ts` for shape. |
| Methodology | `docs/ENERGY_METHODOLOGY.md` | Modelled on `INDICATORS_METHODOLOGY.md` and `TRADE_METHODOLOGY.md`: definitions in section 4, tiers in section 6, source line, revision policy. Curation guide for flags modelled on `docs/TARIFF_ACTIONS_CURATION.md` with a staleness workflow like `tariff-actions-review.yml`. |

**Recommended v1 charts (one page, `/presidency/energy`, section id `energy`, label "Energy"):**

1. **Oil: where it comes from and where it goes.** Total petroleum field production, products supplied and net imports, monthly, shared axis; crude-only exports as a secondary line (this is where the 2015 repeal shows). Tier 2/3.
2. **Strategic Petroleum Reserve.** Weekly level 1991-, term band, **SPR flags** from the curated file (1991, 2005, 2011, 2021, 2022, 2024, 2026 actions), with the authority type on each flag. Tier 1 shared. This is the page's anchor.
3. **Electricity by source.** Monthly net generation, utility-scale, stacked or share-of-total, plus the small-scale solar line from 2014; IRA and 2025-law flags. Tier 3.
4. **LNG exports** (small card, optional in v1; section 3c): shows the 2016 ramp with the 2024 pause and 2025 reversal flags. Include only if the owner wants the trade-policy story.

**Deferred:** CO2; primary energy production vs consumption; renewable share; EO and monument strips; origin-country imports.

**One page or two?** **One.** Argued from the data: (a) no series is annual-only, so there is no second grain to separate; (b) there is no country or other dimension that needs its own page the way Trade needed a partner view; (c) the SPR and the oil balance share the same axis and the same flags file; (d) three or four charts is less than Economy's nine. A second page (Climate or Electricity) would only be justified later if CO2, monuments and the EO strip are added.

Reused primitives, no forks: `charts/RangeSelector` + `charts/TermBand` pinned bar (rule 5b), `trade/EraLayers` (term band, NBER shading) via the shared day axis, `charts/ExtremeMarks` (rule 12), `MethodologyNote` (rule 7), `useStickyTooltip` for hover (rule 6a), numbered tap-to-pin flags as in `trade/TradeTariffChart` (rule 6), `HowToRead`, `PageHeader`.

---

## 11. Decisions (settled 2026-10-06: the project owner accepted every recommendation below)

1. **One page or two?** Recommend **one**, `/presidency/energy` (section 10).
2. **Headline petroleum definition.** Recommend **total petroleum** for the balance chart (field production incl. NGL, imports, exports, supplied) with crude-only exports as a secondary line, and the label "thousand barrels per day, total petroleum (crude plus products)".
3. **Small-scale solar.** Recommend MER utility-scale series for the stack (labelled "utility-scale") **plus** one separate "small-scale solar (estimated, from 2014)" line from v2 `DPV`; do not splice.
4. **SPR flags: build a curated `energy-actions.json`** in the tariff-actions mould, with authority type per row and "exchange" vs "sale" vs "mandated" vs "refill" as an explicit field. Recommend **yes** (no machine-readable DOE history exists).
5. **Which of the 24 candidates seed v1 flags?** Recommend the SPR rows (1, 14, 15, 18, 24), the crude-export repeal (5), the IRA and 2025 law (16, 23), LNG pause and reversal (17, 19), and Paris and Keystone as plain markers (9, 11, 12, 22) only after their dates are verified. Items 10, 13 (dates), 15 (date) need a primary-source fetch first.
6. **Show the 2026 draw-down now?** Recommend **yes**, flagged "emergency exchange" with DOE's stated plan to repay, and a "Latest developments" list left out (same deferral as Trade).
7. **Preliminary treatment.** Recommend hatch plus tooltip status (section 5), electricity rule verified, petroleum rule "last 12 months" until the PSM-to-final lag is verified.
8. **CO2.** Recommend **defer**; same route when wanted.
9. **LNG card in v1?** Recommend **yes, small**, because the 2024 pause and 2025 reversal are the only discrete executive actions on a trade-relevant series; skip it if you would rather keep v1 to two charts.
10. **Attribution line.** Recommend the plain Source line (no mandatory notice); EIA asks only for acknowledgment with date.
11. **Actions secret.** Add `EIA_API_KEY` as a repo secret before the workflow lands.
12. **Window start.** Recommend reusing `INDICATORS_DISPLAY_START` (1991-01-21); the SPR Desert Storm sale (Jan 1991) sits at the left edge and should be labelled, not clipped silently.

---

**Carry-over to the build session:** items 10 and 13 (Paris dates), 15 (2022-03-31 date) and months for rows 2-3 must be verified against primary pages before they become flags; the PSM-to-final lag must be checked before the petroleum "last 12 months preliminary" rule is hard-coded. Nothing here has been built.

---

## 12. What I could not verify, and why

- **Rate limits:** not published numerically; no `X-RateLimit` headers returned.
- **Bulk-download deprecation status:** no page stating it either way; bulk files are updated daily (manifest), `EMISS` is stale.
- **Revision history:** only two same-month vintage gaps (MER vs PSM) were measured; past vintages were not available. The size of weekly SPR revisions is unknown.
- **PSM to final lag** (when a petroleum month becomes final): not on the page fetched.
- **MER CO2 method** (derived from consumption x coefficients?): not fetched.
- **LNG exports before 2016:** what the pre-2016 volumes were (e.g. Alaska) is **UNVERIFIED**; v2 route for LNG not isolated (bulk id used).
- **Electricity v2 route** starts 2001 and small-scale solar 2014; earlier small-scale estimates were not found, so **none is assumed**.
- **Paris:** formal 2017 notification and 2020 effective dates, the 2021 acceptance and effective dates, and the 2025 withdrawal effective date: the State Dept. page returned unreadable content (**fetch failed**) and no other primary page was fetched.
- **White House 2022-03-31 fact sheet:** returned 404; the 180 MMbbl release is confirmed only by DOE's history page, the exact date and rate only by a search summary.
- **Month-level dates** for the 2005 and 2011 SPR actions (DOE page gives the year only).
- **Refill solicitations 2023-2025, March 2026 delivery completion, Keystone's cancellation by TC Energy:** surfaced by search, **not fetched**.
- **NPS/agency monument lists and acreage:** not fetched.
- **EIA API Terms of Service Agreement:** not fetched.
- **One shortcut to disclose:** before the key was added, I made a **single** request using EIA's public `DEMO_KEY` to list the petroleum sub-routes (it returned data). I did not use it again, and everything else came from the bulk/MER keyless endpoints or, after you added it, your key.
- **Fetched content as instructions:** none of the fetched pages contained text directed at me.

Fetched, but not sourcing any row above: MER tables T1.1-T1.3, T3.1-T3.5, T4.1, T7.2a-c, T9.1, T9.4, T11.1-T11.3 (CSV endpoint), bulk `PET`, `NG`, `TOTAL`, `PET_IMPORTS`, `EMISS`, `manifest.txt`, the Federal Register API, DOE (energy.gov) pages, and govinfo laws; all kept in `/tmp/eia-preflight/`, not in the repo.
