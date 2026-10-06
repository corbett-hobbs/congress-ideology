# National security (troops abroad) — Session 0 pre-flight inventory

Read and run on 2026-10-03/06. Evidence only: no feature code, nothing under `pipeline/output/`, `lib/`, `components/`, `app/`,
`lib/verticals.ts`, palette or workflows was touched. Every row is tagged **Confirmed** (how), **Not confirmed**, or **Contradicted**.
Scratch downloads are in `pipeline/raw/_scratch/` (see "Housekeeping"). Small extracts supporting the tables are in `docs/troops-preflight/`.

## 1. Summary

- The DMDC location tables are **scriptable with plain `curl`, no challenge, cookie or token**: the "JavaScript app" reads one public JSON endpoint
  (`/dwp/api/page?pageId=27`) and downloads are `/dwp/api/downloadZ?fileId=…&groupName=…`. All 67 files I tried returned 200.
- **The modern file set is clean:** 56 quarterly `.xlsx` location reports, Sep 2008 → **Mar 2026** (latest; June 2026 is not out). Country rows sum to the printed
  overseas total in 45 of 53 parseable periods (exceptions below). Dec 2025 values match the belief exactly (Japan 54,288, Germany 36,436, South Korea 23,495).
- **The 2017 break is real and is a reallocation, not a withdrawal:** overseas active duty 215,249 (Sep 2017) → 161,927 (Dec 2017) while the U.S. total rose 1,119,873 → 1,167,269. Afghanistan, Iraq and Syria print as **blank starred rows** Dec 2017–Sep 2021 and mostly vanish after Sep 2023.
- **Contradicted:** DMDC does **not** host country data for 1950–1994. Its site has the Sep 1995 xls, Sep 1996 pdf, Dec 1997–Sep 2005 quarterly PDFs (M05), then **nothing for 2006 and 2007** until Sep 2008. The "1950, 1953–1999, 1951–52 missing" belief describes `historydata`, not DMDC.
- `troopdata` has plain CSVs (no R needed). Its **quarter-format** file matches DMDC to the person for every large host; its **country-year file is inflated** (Germany 2008 = 110,855 vs 38,791) and must not be used.
- `troopdata` gaps that matter: **no Sep 30 snapshot before 1957** (1950–56 are June 30), **Iraq/Afghanistan/Kuwait 2003–05 are 0/absent** (worldwide non-U.S. 2003–04 is ~55k/45k vs DMDC 253k/288k), 2006–07 and 2018–2021 values are press/estimate-based, and **there is no estimate flag column**.
- Afloat / unassigned changed meaning in 2005–2008 (309A "Afloat" + "Undistributed" → location-table "UNKNOWN"/"ZZ-UNKNOWN", 6k–30k, sitting in the overseas section). U.S. territories also sit in the **overseas** section.
- The president table (`administrations.json`) starts with Clinton; Truman–Bush 41 are missing (Bush 41 exists only in `lib/economy-presidents.ts`).
- `national-security` is a free slug. Every sovereign host has a map outline; only territories (Guam, Puerto Rico, …) and former states (Yugoslavia, USSR, East Germany) have none.
- troopdata is GPL-3.0; this repo has no LICENSE file. Open question for Corby, not a conclusion.

**Top three risks**

1. **Comparability:** the Dec 2017 break (and the Dec 2022–Jun 2023 Army gap) means any total across it is not like-for-like; the S1 gate must treat these periods explicitly.
2. **History is thin and partly estimated:** nothing from DMDC before 1995, June-not-September before 1957, Sep 2006–07 absent, Iraq/Afghanistan 2003–2007 and 2018–2021 are estimates or zeros in the only backfill source, and the backfill's own country-year file is wrong.
3. **"Abroad" is not a column:** afloat/unknown, territories and (pre-2018) deployed forces are all inside or outside the overseas total depending on year; the page's headline number depends on rules the pipeline must encode and test.

## 2. Findings

### A. DMDC primary-source inventory

Discovery: the report page is an Angular shell (`/dwp/app/dod-data-reports/workforce-reports`, 45,804 bytes, "empty"). Its bundle `/dwp/main-OTOAU3J7.js` (note: relative to `<base href="/dwp/app">`) calls `GET /dwp/api/page?pageId=27`, which returns every file as JSON (`fileId`, `fileName`, `groupName`, `uploadDate`, `size`). Full list: `docs/troops-preflight/dmdc_file_inventory.csv`.

| # | Belief / task | Tag | Evidence |
| --- | --- | --- | --- |
| A1a | Location tables "State/Country", quarterly | **Confirmed** | pageItem 2, `groupName=milRegionCountry`, 56 files `DMDC_Website_Location_Report_YYMM.xlsx`, ~50–62 KB each. Sep 2008–Sep 2012 are **annual only** (Sep); Sep + Dec 2013 then every quarter through Mar 2026. |
| A1b | "Active Duty Military Personnel by Service by Region/Country" is a separate family | **Contradicted** | No such listing on page 27. The `groupName` `milRegionCountry` is the **same** location report. Region-grouped 309A tables exist only inside the historical zips (A1d). Pages 1–45 of the API were scanned; none lists it. |
| A1c | Active-duty strength by service (monthly PDFs, `AD_Strengths_FY1994-FY2012.xlsx`, `FY2013-FY2020.xlsx`, `AD_1954-1993.zip` "(Not DMDC Data)") | **Confirmed** | Worldwide totals only; **no countries** (opened `June1954.xls`, `September1980.xls`: grade tables). Useful only as a worldwide cross-check. |
| A1d | Historical "Worldwide Manpower Distribution by Geographical Area" zips | **Partly contradicted** | `M05.zip` (13 MB, pageItem 13) = **PDFs only**, Dec 1997–Sep 2005 (+ `hst1202`, `hst0303`, `hst0306`). Contains table "(309A) Active Duty Military Personnel Strengths by Regional Area and by Country" per quarter (text-extractable with pdfplumber; 128–175 rows each). `M01.zip` has `fy95/309A995.XLS` (Sep 1995, xls) and `FY96/Hst0996.pdf` (Sep 1996). `M02.zip` (Distribution by state/selected locations) is **U.S. states only** (no countries, checked FY05–FY09). `L03.zip` (Atlas) not opened beyond its listing. **Nothing for 1950–1994 and nothing military-only "1950, 1953–1999".** The M05 foreword itself says the 309A yearly tables "back to 1950" were once on the Internet; they are no longer on this site. |
| A1e | "Boots on the Ground" | **Not confirmed** | No DMDC page 1–45 mentions it. Web search shows CRS reports citing it (everycrsreport.com, not an allowed download host; not fetched). Treat as unavailable from the allowed hosts; hand-placement would need a human-supplied file. |
| A2 | Scriptability | **Confirmed: scripted fetch** | `curl` with no cookie: 200 on shell, API, and all downloads (`Content-Type: application/octet-stream`, `Content-Disposition: attachment`). The server sets `JSESSIONID` and `TS01…` cookies but I never sent them back. No `x-deny-reason`, no challenge. Stable key = `fileId` (new ids each quarter) so discovery must go through the page-27 JSON, not a templated URL. Fallback if the API changes: hand-placed files / `--adopt`. Log: `dmdc_download_log.tsv`. |
| A3 | Newest period and lag | **Confirmed** | Latest = Mar 31, 2026 (uploaded 2026-05-07, "Prepared … May 07, 2026"). Observed lag after quarter end: Mar 2026 37 d, Dec 2025 47 d, Sep 2025 70 d, Jun 2025 49–57 d; Sep/Dec 2024 uploaded together 2025-06-26 (~9 months). **June 2026 is not out** on 2026-10-03 (monthly rank/grade PDFs were refreshed 2026-09-10, location report was not), i.e. overdue vs. the normal 1.5–2.5 months. |
| A8 | Which years have a Sep 30 report | **Confirmed** | See table A8. |

**A4. Layout drift** (extract: `a4_layout_drift.csv`; every one of the 56 files was parsed, these are the changes)

| Change | First period | Notes |
| --- | --- | --- |
| Sheet name constant | all | `LOCATION COUNTRY REPORT`, one sheet. |
| Group-header row | row 6 through Mar 2022; row 8 Jun 2022–Jun 2024 (note lines added); row 5 from Sep 2024 | Parser must locate the "ACTIVE DUTY" cell, not use a fixed row. |
| Location column header | `LOCATION STATE / COUNTRY` → `DUTY STATE / COUNTRY` | Dec 2017 (and title "…Permanently Assigned"). |
| Section structure | Sep 2008–Sep 2017: `UNITED STATES` / `UNITED STATES TOTAL` / `OVERSEAS` / `OVERSEAS TOTAL` / `GRAND TOTAL` | In Dec 2017–2022 the `OVERSEAS` label moves into a footnote line; rows still follow `UNITED STATES TOTAL`. |
| Active-duty columns | Army, Navy, Marine Corps, Air Force, Coast Guard, Total (6) | **Air Force/Space Force merged** Dec 2021–Jun 2023; **Space Force separate** from Sep 2023 (7 columns, 24 total). |
| Army column | `N/A` in every row | **Dec 2022, Mar 2023, Jun 2023** ("Army did not provide military personnel data", IPPS-A conversion). Active-duty and grand totals are `N/A` too. |
| Name drift | `UNKNOWN` → `ZZ-UNKNOWN` (Dec 2019) → `UNDEFINED` (Jun–Sep 2022) → `ZZ-UNKNOWN`; `KOREA, SOUTH`, `BAHAMAS, THE`, `CONGO (KINSHASA)`, `PANAMA (1980 - PRESENT)`, `SERBIA (2006 - 2008)`, `NETHERLANDS ANTILLES (1991 - 2010)`, `GERMANY, FEDERAL REPUBLIC OF`, `UNION OF SOVIET SOCIALIST REPUBLICS`. | 230 distinct overseas labels across 56 files. |
| Units / totals | persons; one `OVERSEAS TOTAL` and `GRAND TOTAL`; **no regional totals, no afloat row** | |
| Footnotes | 2008–Sep 2017: boilerplate "may not accurately reflect current force totals"; Dec 2017–: "permanently assigned … does not include personnel on temporary duty"; 2022+: "Questions … referred to OSD Public Affairs"; Mar 2026 adds "Location … based on the Assigned Unit State and Country Code". | `Prepared on` dates include typos ("June 25. 2025", Dec 2025 "February 16, 2025"). |
| Data defects found | Mar 2017 `GRAND TOTAL` (1,315,609) equals Dec 2016's, 3,062 off U.S. + overseas; Sep 2013 has **two ZIMBABWE rows** (8 troops); Jun 2022 row `TOTAL` ≠ sum of branch columns for many hosts (Germany 36,056 vs 36,172); Jan 2017 re-preparation of 2008–2016 files ("CTS Deployment File (as of November 2016)"). | |

**A5. The 2017 break** (`a5_2017_break.csv`)

- **Confirmed** from the files' own notes. Dec 2017 and Mar 2018 footnotes say they do "not include personnel on temporary duty" (DMDC, Dec 2017 table) and defer Afghanistan/Iraq/Syria numbers to OSD Public Affairs. The Sep 2017 file (`…1709_old.xlsx`, prepared Nov 27, 2017) lists "CTS Deployment File" as a source; the Dec 2017 file does not.
- As printed, active duty / guard-reserve / grand total:

| Location | Sep 2017 | Dec 2017 | Mar 2018 |
| --- | --- | --- | --- |
| Afghanistan | 13,329 / 1,969 / 16,500 | `AFGHANISTAN*` blank row | blank row |
| Iraq | 7,402 / 1,490 / 9,123 | `IRAQ*` blank row | blank row |
| Syria | 1,547 / 173 / 1,723 | `SYRIA*` blank row | blank row |

- **Stimson figures (belief 2): Confirmed as AD + Guard/Reserve** in the Sep 2017 file: 13,329+1,969 = 15,298; 7,402+1,490 = 8,892; 1,547+173 = 1,720. They are not the active-duty-only numbers.
- Overseas active duty 215,249 → 161,927; U.S. total 1,119,873 → 1,167,269; worldwide 1,335,122 → 1,329,196. Largest drops Sep→Dec 2017: Afghanistan −13,329, UNKNOWN −11,249, Iraq −7,402, Kuwait −7,159 (9,241→2,082), Qatar −4,137, UAE −2,356, Djibouti −2,312, Jordan −1,748. **The break hits every CENTCOM host, not only the three blank rows.**
- The Dec 2017 table's own OS rows sum to 162,539 vs printed 161,927 (+612); branch columns differ by up to −998 (Army) / +1,191 (Navy). Not explained by the file.

**A6. Nine hosts, per period** (full grid: `nine_countries_by_period.csv`; Sep 30 summary below). Tags: R = reported number, B = Boots-on-the-Ground/estimate only (not in the DMDC files), S = row printed blank/starred, – = absent from table.

| Host | 2001–05 (M05 pdf) | 2006–07 | Sep 2008–Sep 2017 | Dec 2017–Sep 2021 | Dec 2021–Sep 2022 | Dec 2022–Jun 2023 | Sep 2023–Mar 2026 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Iraq | R (1 in 2001, absent 2002–05) | B | R (110,793 → 164 in 2012 → 7,402) | S | R (158, 11, 153, 149; Mar 2022 S) | N/A (no Army) | 0 in Sep 2023, then absent |
| Afghanistan | absent 2001–03; 9 in Dec 2001 | B | R (23,359 → 82,177 in 2011 → 13,329) | S | R (6 in Dec 2021); Sep 2021 S | N/A | absent |
| Syria | R (6–9) | R? (in troopdata 8–9) | R (0–4, 1,547 in Sep 2017) | S | Dec 2021 R (1); Mar 2022 S; later 0 | N/A | 0 / absent |
| Kuwait | R (4,208 Sep 2001; absent 2003–05 "Less OIF") | B | R | R (reported all quarters) | R | N/A | R |
| Qatar | R | R | R | R | R | N/A | R |
| Bahrain | R | R | R | R | R | N/A | R (3,151 Mar 2026) |
| Saudi Arabia | R | R | R | R | R | N/A | R |
| Niger | R (5–17) | R | R (1 → 510 Sep 2017) | R (7, 194, 8…) | R | N/A | R (10–17) |
| Djibouti | R (498 in 2003) | R | R | R | R | N/A | R (13–409) |

Notes: "R? 2006–07" = not in DMDC files I could fetch (the gap); the Kuwait/Iraq/Afghanistan figures in troopdata for 2006–07 are reverse-engineered estimates (its NEWS). Marker "absent" after Sep 2023 for Afghanistan, Iraq, Syria is a **row that no longer exists**, not a zero.

**A7. Totals reconciliation** (all 56 periods computed; this becomes the S1 gate)

Test: Σ overseas rows (active-duty total, **including** UNKNOWN/ZZ-UNKNOWN and territories) = printed `OVERSEAS TOTAL`; Σ U.S. rows = `UNITED STATES TOTAL`; U.S. + overseas = `GRAND TOTAL`.

| Result | Periods | Gap (troops) |
| --- | --- | --- |
| Exact (overseas rows = printed total) | 45 of 53 with numbers | 0 |
| Sep 2013 | duplicate ZIMBABWE row | +8 |
| Dec 2017 | rows exceed total | +612 (branch diffs Army −998, Navy +1,191, MC +498, AF −158, CG +79) |
| Dec 2020, Mar 2021, Jun 2021, Sep 2021 | printed total exceeds rows: blank starred rows still counted in total (almost all Marine Corps) | −534, −495, −427, −189 |
| Jun 2022 | rows' `TOTAL` column ≠ their branch sum; branch columns reconcile | −329 |
| Sep 2024 | | −11 (Army −3, MC −8) |
| Mar 2017 | printed grand total is a stale copy of Dec 2016 | 3,062 off |
| Dec 2022, Mar 2023, Jun 2023 | Army `N/A`; totals `N/A` | cannot be tested; Navy/MC/AF/CG columns still reconcile in Dec 2022 and Mar 2023 (Jun 2023: −2 MC, −1 AF) |

The U.S. rows always reconciled exactly. **There are no regional or afloat rows** in 2008+ tables, so "country rows + afloat + unknown + territories" is simply "all overseas rows"; the unit test should assert this, with a per-period tolerance table for the exceptions above (fail on any unlisted gap > 0).

**A8. Sep 30 availability**

| Years | Source | Nearest substitute when missing |
| --- | --- | --- |
| 1950–1956 | none on DMDC; `troopdata`: **June 30** only | label as June 30 |
| 1957–1994 | none on DMDC; `troopdata` carries "September YYYY" rows in its reports table | cite troopdata |
| 1995, 1996 | M01 xls / pdf (Sep) | — |
| **1997** | none (M05 starts Dec 1997) | Dec 1997 (M05) or troopdata Sep 1997 |
| 1998–2005 | M05 PDFs (Sep) | — |
| **2006, 2007** | **none** | troopdata (Kane 2006 / estimates) |
| 2008–2012 | location xlsx (annual) | — |
| 2013–2025 | location xlsx (every quarter) | Sep 2023 exists; Sep 2024 uploaded late |
| Latest | Mar 31, 2026 | partial-year hatch |

### B. Historical backfill (`troopdata`)

| # | Belief / task | Tag | Evidence |
| --- | --- | --- | --- |
| B1 | Plain CSV available | **Confirmed** | `github.com/meflynn/troopdata/data-raw/`: `troopdata-rebuild-country-year-quarter-format.csv` (29,719 rows, 31 cols), `troopdata-rebuild-country-year.csv` (13,135 rows), `troopdata-rebuild-reports.csv` (15,482 rows, raw DMDC report columns), `troopdata.csv` (old Kane-era 14,792 rows). `data/*.rda` also exist. CRAN tarball not fetched; not needed. Branch `master`; DESCRIPTION version **1.0.4.9000** (dev) vs CRAN 1.0.4. |
| B2a | Country-year 1950–2024 with COW + ISO3 | **Confirmed** (rebuild runs 1950–2025 in the quarter file; `ccode`, `iso3c`, `region`). ISO3 is blank for ~14 historical entities. |
| B2b | Sep 30 snapshots | **Contradicted for 1950–56** | Quarter file: 1950–56 **June only**; 1957–2012 June + September; 2013+ quarterly (Mar/Jun/Sep/Dec). June rows before 2013 are stamped `Kane 2006`; Sep rows say `September YYYY`. 330 rows are `Stepwise Imputation` (1951–52 and the Dec 2022–Jun 2023 gap). |
| B2c | Kane vs DMDC | **Confirmed** | `source = "Kane 2006"` for the June rows (original series to 2005, reused as fallback); `September YYYY` rows are scraped DMDC reports. |
| B2d | Estimate flag | **Contradicted** | No column. `source` is only `<Month YYYY>` or `Stepwise Imputation`. Press/estimate values (Iraq 2006 141,100, 2007 170,000; Kuwait 44,400, 48,500; Afghanistan 2018 14,000, 2019 13,000, 2020 8,600; Syria 1,700/1,000/900) are in `troops_ad` unmarked, identified only from NEWS. |
| B2e | NEWS lists missing country-years | **Contradicted** | `NEWS.md` documents fixes and estimates but contains no missing country-year list. |
| B2f | NEWS says 2018–2020 are press-based | **Confirmed** | NEWS 0.1.4: Afghanistan/Syria/Iraq 2018–2020 "estimated from reports"; Sep 2021 also press-based (Afghanistan 0, Syria 900, Iraq 2,500) in 0.1.4 data update; the current Sep-2021 quarter rows show 0/0/0. |
| B2g | Also found | — | NEWS 1.0.4.9000 says the CRAN rebuild had **duplication bugs inflating ~20% of country-year-quarter observations** (fixed in the dev version). The committed **country-year CSV is still inflated** (B3). |

**B3. Reconciliation against DMDC** (extracts: `b3_country_diffs.csv`, `b3_historydata_country_spotcheck.csv`)

Ten overlapping Sep 30 snapshots: 2008, 2009, 2011, 2013, 2015, 2017, 2019, 2021, 2023, 2024. Quarter-format Sep rows vs DMDC location tables, overseas active duty:

| Year | DMDC overseas AD | troopdata (non-U.S.) | gap | what the gap is |
| --- | --- | --- | --- | --- |
| 2008 | 370,449 | 339,992 | −30,457 | UNKNOWN 29,510 + Puerto Rico 591 + BIOT 322 |
| 2009 | 352,603 | 328,491 | −24,112 | UNKNOWN 23,026 + PR 643 + BIOT 304 |
| 2011 | 336,645 | 313,738 | −22,907 | UNKNOWN 21,673 + PR 680 + BIOT 468 |
| 2013 | 251,745 | 236,695 | −15,050 | UNKNOWN 13,655 + PR 667 + BIOT 451 |
| 2015 | 213,067 | 197,834 | −15,233 | UNKNOWN 13,992 + PR 725 + BIOT 486 |
| 2017 | 215,249 | 197,326 | −17,923 | UNKNOWN 17,301 + BIOT 264 + PR 176 |
| 2019 | 174,253 | 181,708 | +7,455 | **press estimates added** (Afghanistan 13,000, Syria 1,000, …); UNKNOWN 6,030 dropped |
| 2021 | 174,522 | 168,296 | −6,226 | ZZ-UNKNOWN 5,701 + BIOT + PR |
| 2023 | 168,571 | 161,354 | −7,217 | ZZ-UNKNOWN 6,214 + PR + BIOT |
| 2024 | 166,790 | 154,500 | −12,290 | ZZ-UNKNOWN 11,423 + PR 623 + BIOT 241 |

- **Every host with a name match agrees** except a handful: China (DMDC 22 vs 42, 2008; 59 vs 73, 2024), Congo (Brazzaville) vs DRC naming (troopdata `Congo` 2 vs DMDC 3), Marshall Islands/Yemen/Seychelles dropped (≤248), Czech Republic/Zimbabwe 2024 missing. Largest hosts (Germany, Japan, Korea, Italy, UK, Bahrain, Kuwait…) are identical.
- **Branch totals**: Army/AF within a few hundred–3,500; Navy differs by 35–66k = the UNKNOWN row (afloat Navy). Coast Guard and Space Force are **not in the branch columns** (`coast_guard_ad` all NA, `space_force_ad` all 0): branch columns do not sum to `troops_ad` in ~1,900 country-years (2008+).
- **Worldwide**: troopdata's "United States" row is **CONUS only** (it equals `historydata` CONUS in 1950, 1953, 1960, 1965); worldwide sums are therefore not comparable to DMDC's grand total (2017: 1,223,386 vs 1,335,122).
- **The country-year CSV is wrong**: 2008 non-U.S. sum 612,506 (DMDC 370,449); Germany 110,855 vs 38,791; 2009 Iraq 101,206 vs 72,368; Puerto Rico 12,407 vs 643. Do **not** use it.
- 1950–2007 spot checks:
  - vs `historydata::us_military_strengths` (MIT, v0.3.0; 50 rows 1950–1999, 1951–52 NA; also `data-raw/DoD_Worldwide_US_Military_Personnel.Report_1950_1999.xlsx`): 84 country-year checks over 1953/60/70/75/85/95/99 for DE, JP, OKI, KR, GB, IT, PH, VN, TR, ES, GU, PA: **71 match, 13 differ**, all explained by Okinawa (`historydata` separate, troopdata merges into Japan), the 1953 June data, and Guam's June rows missing.
  - vs DMDC M05 PDFs (Sep totals): 1999 worldwide 1,385,703 = `historydata` 1,385,703. Foreign-countries totals vs troopdata non-U.S.: 1999 252,763 vs 203,494; 2001 254,788 vs 205,991; 2002 230,484 vs 194,470 (**the gap is the "Undistributed"/afloat category**), **2003 252,764 vs 54,992 and 2004 287,802 vs 44,870 (Iraq/Kuwait/Afghanistan absent: "Less OIF")**, 2005 290,997 vs 217,733.
  - vs DMDC worldwide strength: 1954 June 3,302,104 vs `historydata` 3,279,579; 1980 Sep 2,050,627 vs 2,050,826; 1985 Sep 2,151,032 = `historydata` 2,151,032; 1990 Sep 2,043,705 vs 2,046,144 (small differences, not troop counts by country).
  - Sep 1957–1976 rows in troopdata differ from the same-year June (Japan 1957: 150,874 vs 121,619) so they are not copies; I could not check them against DMDC (no DMDC country files before 1995).

**B4. License and citation facts** (state facts, not legal conclusions)

- Repo `LICENSE.md` is GPL-3.0 (GitHub API: `gpl-3.0`); `DESCRIPTION`: `License: GPL (>= 3)`; maintainer Michael Flynn, authors in the README. Original data were compiled by Tim Kane (Heritage) from DMDC; DMDC files are U.S. Government publications. The `historydata` package is MIT.
- README requires citing: Allen, Flynn and Martinez Machain (2022), "Global U.S. military deployment data: 1950-2020," *Conflict Management and Peace Science* 39(3): 351-370; Kane (2005), "Global U.S. troop deployment, 1950-2003," Heritage Foundation technical report. (Vine 2015 and the APSR 2020 paper apply to basing/construction data, not used.)
- Not stated by the files: whether GPL-3.0 on the *package* extends to the *data tables* it ships, or what committing derived data in a repo with **no LICENSE file** implies. Open questions: (1) does Corby accept citing and linking in `docs/CREDITS.md` (existing pattern) as sufficient; (2) is a GPL notice needed on any derived file; (3) is it cleaner to derive 1957+ from DMDC directly where possible (only 1995–2005 PDFs and 2008+ xlsx are available).

### C. Crosswalk and map coverage

Extract: `c_crosswalk_all_names.csv` (name, peak active duty, ISO3 code, in `countries.json`, has outline, has marker).

| Source | Distinct names | Mapped to ISO3 | In `countries.json` | Have an outline in `world_map.json` |
| --- | --- | --- | --- | --- |
| DMDC location tables, 56 periods (all vintages) | 230 | 216 | 210 | 201 |
| DMDC M05 PDFs (Sep 1999, 2001, 2005) | 174 | 158 | 154 | 154 |
| troopdata (`countryname`, `iso3c`, `ccode`) | 217 | 203 | 194 | 190 |

Matching used folded names, a short alias table (Bahamas, The; Korea, South; Burma; Cote d'Ivoire; Congo variants; Virgin Islands, U.S.; …) and troopdata's own `iso3c`. `countries.json` keys real countries by ISO3 `country_code` (Kosovo `XKX`).

**Unmapped, by peak troops** (these are rows to classify by rule, not countries): M05 `Continental United States`, `Afloat` (104,226), `Ashore`, `Transients` (45,678), `Hawaii`, `Alaska`, `Forward Deployment Pacific Theater`, `NATO Countries`, `Includes deployed Reserve/National Guard`, `Korea` (300), `Macedonia, The Former Yugoslav Republic of`; DMDC `UNKNOWN` (31,388), `ZZ-UNKNOWN` (20,138), `UNDEFINED` (7,031), `SPRATLY ISLANDS` (91), `AKROTIRI` (73), `SVALBARD`, `CORAL SEA ISLANDS`, `BASSAS DA INDIA`, `BRITISH ATLANTIC OCEAN TERRITORY`, `ASHMORE AND CARTIER ISLANDS`, `GUERNSEY`, `ANTARCTICA`, `TRUCIAL STATES`; troopdata `Azores` (2,428), `British West Indies` (1,710), `Antarctica` (928), `Johnston Island`, `Eniwetok (J.T.F. 7)`, `Ascension Island`, `St. Helena`, `Easter Island`, `Line Islands`, `Kashmir`, `Sarawak`, `Abkhazia`, `Tibet`, `Zanzibar`. Names that mapped to a code but **are not in `countries.json`**: United States, Guam (17,222 peak), Midway/Wake/Johnston (UMI), American Samoa, U.S. Virgin Islands, Puerto Rico, Northern Mariana Islands, Saint Barthélemy, German Democratic Republic. West Germany: troopdata keeps `Germany` for the whole series (there is no West/East split except 58 GDR); USSR, Yugoslavia, Zaire (as Democratic Republic of the Congo in troopdata) are present with codes `SUN`, `YUG`, `COD`.

**Outline coverage** (reading `pipeline/output/world_map.json`: 215 `features`, 207 `recipients`, `undrawn` = China (Tibet), Czechoslovakia (former), French Guiana, Martinique, Netherlands Antilles (former), Pacific Island Trust Territory, Serbia and Montenegro (former)):

- **Confirmed**: outlines exist for all sovereign hosts with ≥50 troops in any year (`DEU`, `JPN`, `GBR`, `KOR`, `ITA`, `SGP`, `QAT`, `DJI`, `IOT`, `CUB`, `GRL`, `ISL`, `BHR`, `KWT` all present as features). `features` are all Natural Earth countries, not only aid recipients.
- **Misses (no outline key)**: Guam, American Samoa, U.S. Virgin Islands, Northern Mariana Islands, Midway/Wake/Johnston (UMI), Puerto Rico (`PRI` is not a feature; drawn size would be ~8 px²), St. Barthélemy, plus historical states Yugoslavia, Czechoslovakia, German Democratic Republic, USSR, Netherlands Antilles, Gibraltar (3,593 peak; `GIB` has no feature), Martinique, St. Pierre and Miquelon, Niue, Vatican City, Liechtenstein, Sint Maarten.
- **Markers**: `recipients[].marker` exists only for aid recipients; every mapped host was an aid recipient except **United States and Puerto Rico** (bbox 8 px², would need a marker if Puerto Rico were on the map). Hosts without a marker that are small: **Diego Garcia** is carried by `IOT` (marker present). For Okinawa, count in Japan (mock note).
- Verdict: the aid-built file covers the real-world hosts; adding territories/former states needs either an `undrawn` list entry (the "Not on the map" note) or markers.

**C3. Proposed fixed region map** (keyed by `country_code`; not implemented). Mock regions: Europe; East Asia & Pacific; Middle East & South/Central Asia; Africa; Western Hemisphere; Afloat & unassigned.

| Group | Rule |
| --- | --- |
| Europe | DEU GBR ITA ESP TUR(?) GRC BEL NLD PRT POL ROU + all European ISO3 incl. ISL, GRL(?), former SUN/YUG/DDR/CSK. Open: Turkey (DMDC 309A = Europe; troopdata = Europe & Central Asia), Greenland (troopdata North America, DMDC 309A Europe), Cyprus, Azerbaijan/Caucasus. |
| East Asia & Pacific | JPN KOR PHL THA TWN VNM AUS SGP + Pacific islands (GUM etc. only if territories are shown). |
| Middle East & South/Central Asia | KWT BHR SAU QAT ARE JOR EGY IRQ AFG SYR + IOT/Diego Garcia (troopdata puts Diego Garcia in "South Asia"). **DMDC 309A groups North Africa with the Near East in one region; the mock puts North Africa in Africa**. Egypt, Libya, Morocco, Tunisia, Algeria: pick one rule and state it. |
| Africa | Sub-Saharan Africa (troopdata `Sub-Saharan Africa`, 49 names) + DJI NER; DMDC puts Djibouti in "Sub-Saharan Africa" while troopdata puts it in the Middle East group. |
| Western Hemisphere | Canada, Latin America and Caribbean, Cuba, Panama; DMDC "Western Hemisphere", troopdata "North America" + "Latin America & Caribbean". |
| Afloat & unassigned | `UNKNOWN`, `ZZ-UNKNOWN`, `UNDEFINED`, pre-2005 `Afloat`/`Undistributed`/`Transients`. |

Differences to flag: DMDC 309A (1995–2005) is Europe / Former Soviet Union / East Asia & Pacific / North Africa-Near East-South Asia / Sub-Saharan Africa / Western Hemisphere / Undistributed, with an **`Afloat` row inside most regions** and the former Soviet Union as its own region; 2008+ tables have **no regions at all**; troopdata has 8 region labels that move Turkey, Greenland, Diego Garcia, Egypt differently. Moves between years: the 309A "Afloat" per region (e.g. Europe 5,285 in Mar 2003, NANESA 2,559) and `Undistributed` (101,074 Sep 2005) become the `UNKNOWN` row after 2008; **Sep 2005 State tables "now include Navy/MC personnel afloat"** in U.S. states (M02 note), so afloat shrinks overseas.

### D. Branches

| Question | Tag | Evidence |
| --- | --- | --- |
| Which columns, which periods (DMDC) | **Confirmed** | Army, Navy, Marine Corps, Air Force, Coast Guard from Sep 2008. **Space Force** is merged into Air Force Dec 2021–Jun 2023 and separate from Sep 2023 (it exists in the force from Dec 2019 but is inside Air Force until then). 1995–2005 M05: Army, Navy, Marine Corps, Air Force only. |
| troopdata branch split from which year | **Confirmed** | `army_ad`, `navy_ad`, `air_force_ad`, `marine_corps_ad` populated for every host from **1950** (checked 1950, 1953, 1957, 1970, 1990, 2000, 2005, 2008+). `coast_guard_ad` is entirely NA and `space_force_ad` all 0 in the Sep rows; **CG/SF are inside `troops_ad` but not in any branch column** (so `Other = total − four branches`; 1,923 country-years differ, 87–114 per year from 2008). |
| Conclusion | | The ranked list's branch split can run the **full history** with four named branches plus "Other (Space Force / Coast Guard)" computed as the remainder; the mock's combined "Space Force / Coast Guard" series is the right shape. Pre-2008 "Other" is ~0 by construction. |

### E. Presidents

- `pipeline/transform/administrations.ts` (24 lines) and `pipeline/output/administrations.json` (6 rows): Clinton (1993-01-20), G.W. Bush, Obama, Trump (2017), Biden, Trump (2025). Convention: `term_id` = inauguration date, consecutive terms are one tenure, non-consecutive stints get two rows; the table starts at 1993 because the Federal Register EO data does.
- `lib/economy-presidents.ts`: `BUSH_41` constant (`term_id "1989-01-20"`, end 1993-01-19) is prepended by `buildEconomyTerms`; `ORDINALS` maps `term_id` → number (41–47) and **throws** for an unknown `term_id`, so adding presidents there requires adding ordinals.
- `termIdForDate` is in `lib/indicator-derive.ts` (`x.start <= date && (x.end === null || date <= x.end)`).
- **Missing for 1950–2007 snapshots:** Truman (1945-04-12–1953-01-19), Eisenhower (1953), Kennedy (1961, to 1963-11-22), Johnson (1963-11-22–1969), Nixon (1969–1974-08-09), Ford (1974–1977), Carter (1977), Reagan (1981), and Bush 41 (outside the table). Sep 30 snapshot assignments need only the one in office on Sep 30 (Kennedy→Johnson and Nixon→Ford split mid-year but not on Sep 30).
- **Where to add:** adding rows to `ADMINISTRATIONS` would change `administrations.json`, which `pipeline/validate/validate.ts`, `executive-orders-run.ts`, `enforcement.ts`, `lib/indicator-derive.ts`, `lib/immigration-derive.ts`, `lib/foreign-aid-derive*.ts` and the EO page read, and the EO transform fails if the Federal Register's president disagrees. Safer: a national-security-specific list following the `BUSH_41` precedent (a small `lib/` file for Truman–Reagan + Bush 41), reusing `termIdForDate`. Not added.

### F. Site plumbing and component fit

Files opened: `lib/verticals.ts` (grepped section ids), `components/charts/StackedBars.tsx`, `StackedRows.tsx`, `ExtremeMarks.tsx`, `charts/use-zoom-pan.ts` (header), `lib/chart-extremes.ts` (exports), and by targeted grep `foreign-aid/MapCard.tsx`, `SpendingChart.tsx`, `FirstPlaceCard.tsx`, `ForeignAidFilterBar.tsx`, `MapAndRanked.tsx`.

- **Slug free**: **Confirmed**. `lib/verticals.ts` presidency sections: executive-orders, economy, trade, immigration, foreign-aid. `app/presidency/` has no `national-security`.

| Mock card | Reuse | Specific extension needed |
| --- | --- | --- |
| Pinned bar | `foreign-aid/ForeignAidFilterBar` shell + `FiscalYearControl`; `trade/CountryCombobox` | New bar component; swap Sector for Branch; year axis 1950–2026 (play/pause already in the control). |
| Chart 1, stacked by region | `charts/StackedBars` (`StackBand` terms, `StackSeries` with any SVG `fill`) | StackedBars' aria label is hard-coded "…executive orders" and y-axis format is `String(v)`; no partial-year hatch (hatch is inside `foreign-aid/SpendingChart`, so extract or copy `HatchDefs`); `ExtremeMarks` is line-chart-shaped (peak above point, low below, clamped) — for bars the low label must sit above the bar (the mock says so); a dashed definition-change marker with a tap-to-pin number (rule 6) via `immigration/InfoMarker`; 77 columns vs ~25 for EO years (label thinning). |
| Map | `foreign-aid/MapCard` + `use-zoom-pan` + `ZoomControls` | Fixed troop bins instead of dollar bins; "not reported" unfilled state per host-year; markers for hosts not in `recipients` (Puerto Rico only) and an `undrawn` note for territories; Troops/Change toggle. `world_map.json` already has all sovereign outlines. |
| Ranked list | `charts/StackedRows` + `ReversibleSortToggle` (options may be `disabled`, per the map) + height mechanism of `MapAndRanked` | Segments are branches (5 colors); delta needs the previous Sep 30 (or Sep 2025 for the latest quarter). |
| Chart 4, largest host | `foreign-aid/FirstPlaceCard` pattern (run-length spans, rotated labels, hatch) | Spans coloured by region (not sector); country-selected branch stack (currently sector mix); "ties alphabetical" rule; Iraq/Afghanistan/Syria cannot rank after the break; rule-10 label fallback for very short spans (1-year hosts). |

**F2. Mock vs `ARCHITECTURE_MAP.md` page-level rules; drift**

- **Rule 6**: the mock's Data note says "the dashed line at ① marks the December 2017 definition change". Rule 6: "no numbered key printed under the chart"; the marker's own note must carry the text. Fix in implementation.
- **Rule 5**: the mock's bar has President, Country, Branch and the slider. That equals the foreign-aid count (President, Country, Sector, slider), so compactness is achievable but the Branch select must follow the "narrow the others first" rule.
- **Rule 4**: the mock's Branch filter changes values rather than narrowing a time subset; that is a measure choice, not a subset filter, so it is consistent. Country filters the series (right) but should only highlight on map/list/chart 4 (the mock does this).
- **Rule 8**: solid colours only; the only hatch is the partial year. The mock complies. Region/branch colours are explicitly placeholders; they need `validate_palette.js` entries (`PALETTE_KEYS`, `NEW_KEYS`, `FORCED_PAIRS`) before building.
- **Rule 11a**: mock uses 28rem on phones for the ranked list. Complies.
- **Mock vs data**: the mock says "Iraq, Afghanistan and Syria are not reported after that point" (Dec 2017). **Contradicted in part:** they are blank/starred Dec 2017–Sep 2021 and then **reported again with small numbers Dec 2021–Sep 2022** (Iraq 158/11/153/149, Afghanistan 6 in Dec 2021), and the rows are removed after Sep 2023. The mock also says "September 30 snapshots 1950–present"; the 1950–56 data are June 30.
- **Drift**: none found in what I checked. The map's description of `ReversibleSortToggle` (disabled options with a hint) is newer than `docs/FOREIGN_AID_PREFLIGHT.md`, which still says it cannot disable options (the pre-flight is stale, not the map). `StackedRows` and `use-zoom-pan` exist where the map says. I did not verify every rule's reference file.

## 3. Reconciliation results

See A7 (DMDC internal) and B3 (troopdata vs DMDC, historydata, M05, DMDC strengths) above. Key numbers repeated for the gate design:

- DMDC internal: exact in 45/53 periods; 8 row-sum exceptions listed (plus the stale Mar 2017 grand total); 3 periods untestable (Army N/A).
- troopdata Sep quarter rows vs DMDC overseas AD: gaps = UNKNOWN + Puerto Rico + BIOT (2008–2017, 2021–2024); 2019 +7,455 from press estimates.
- Country-year CSV: +16% (2017) to +65% (2008) over DMDC overseas AD. Unusable.

## 4. Crosswalk and outline coverage

See C. Unmapped list by peak troops is the long bullet there; the full per-name list (all three sources, 621 rows) is in `docs/troops-preflight/c_crosswalk_all_names.csv`.

## 5. Recommended S1 / S2 scope, gates, fail conditions

**S1 — modern pipeline (Sep 2008 → latest quarter, DMDC only)**

- Fetch: read `/dwp/api/page?pageId=27`, select `groupName=milRegionCountry`, download by `fileId`, commit raw xlsx to `pipeline/raw/dmdc-location/` (like the other raw tracks). Not auto-run; weekly freshness workflow can poll the same JSON and open a PR only when a new period appears (June 2026 expected).
- Parser: locate headers by text, not row numbers; classify rows by position (U.S. section / overseas section / totals); treat `*` rows as suppressed (not zero); keep `N/A` as null; fold names via an alias table; classify `UNKNOWN`/`ZZ-UNKNOWN`/`UNDEFINED` as afloat/unassigned and territories (Guam, PR, American Samoa, N. Mariana, USVI) separately from hosts.
- Gates (fail the transform): every file parses and its `As of` date matches the filename; each period's Σ overseas rows − printed total is 0 **or** exactly the documented exception for that period (A7 table); U.S. rows reconcile; no unmapped name with ≥1 troop unless it is on the classification list; Dec 2022–Jun 2023 Army columns are null and the derived country totals for those periods are **not** emitted (or are flagged); the Dec 2017 break and the post-Sep-2023 removal of Afghanistan/Iraq/Syria rows are explicit metadata.
- Do not ingest contingency or press-estimate series (they exist; out of scope).

**S2 — historical backfill (1950–2007)**

- Source: `troopdata` quarter-format CSV only, Sep rows 1957+, June rows 1950–56 (labelled), citation in `docs/CREDITS.md`. Never the country-year CSV.
- Gates: reconcile 1995, 1996, 1998–2005 against DMDC M05/M01 309A (extract by pdfplumber, as done here): large hosts exact; "Total – Foreign" gap allowed only up to the afloat/undistributed amount; **fail** if a year's worldwide non-U.S. total is more than a documented tolerance below DMDC (2003–2004 will fail unless Iraq/Kuwait/Afghanistan rows are estimated and flagged).
- Mark 2006–07 and any press estimate as `estimate`; Sep 1997 and Sep 2006–07 are gaps: pick substitute (Dec 1997, troopdata) in metadata.

## 6. Decisions for Corby (G1–G6)

1. **Contingency forces** — Recommend **exclude, with the break marked** at Dec 2017 and Iraq/Afghanistan/Syria shown as "not reported" (not 0) through Sep 2021. Reason: the Sep 2017 table includes deployed forces (overseas 215,249 vs 161,927 three months later while U.S. total rose 47k), so a single series across the break is misleading. A separate chart needs estimates that are not in the DMDC files (out of scope).
2. **Territories** — Recommend **out of "abroad"** (the mock's rule), shown as a labelled "not on the map" line. Reason: location tables put Guam (7,137 in Mar 2026), Puerto Rico, American Samoa, Northern Marianas and USVI inside the **overseas** total, so the overseas total must be adjusted by an explicit, tested list.
3. **Chart 1 stack** — Recommend **region as default**, branch via the Branch filter. Reason: branch history is complete only for Army/Navy/Marine Corps/Air Force; CG/SF exist only as a remainder, while region needs a fixed map keyed by ISO3 that is reasonably stable (C3 lists the six judgement calls: Turkey, Greenland, North Africa, Djibouti, Diego Garcia, afloat).
4. **Backfill** — Recommend **ingest `troopdata` (quarter-format, cited)**, with DMDC 309A PDFs used as a reconciliation gate for 1995–2005 rather than re-parsed for everything. Reason: DMDC does not host country data before 1995, Sep 2006–07 do not exist on the site, and the quarter file ties to DMDC exactly where both exist.
5. **Grain** — Recommend **Sep 30 snapshots + latest quarter** from 1957, with 1950–56 shown as June 30 (labelled) and 2006–07 labelled as estimates, plus the hatched latest quarter (Mar 2026). Reason: that is what exists; DMDC Sep exists for 1995–96, 1998–2005, 2008+.
6. **S1 and S2 scope/gates** — See §5. Recommend S1 first (clean, scriptable, gate-able) and S2 second, behind its own approval of the license/citation questions in B4.

## 7. Appendix: commands and URLs

All fetches used `curl` (plain, no cookies, no user agent tricks). Status codes were 200 unless noted.

| What | URL / command | Status |
| --- | --- | --- |
| DMDC shell | `https://dwp.dmdc.osd.mil/dwp/app/dod-data-reports/workforce-reports` | 200 (45,804 B html) |
| DMDC old URL | `https://www.dmdc.osd.mil/appj/dwp/reports.jsp` | 302 → `/dwp/app/main` |
| DMDC API root | `https://dwp.dmdc.osd.mil/dwp/api/` | 404 |
| Bundle | `https://dwp.dmdc.osd.mil/dwp/app/main-OTOAU3J7.js` | 200 but returned the html shell (relative-to-base mistake) |
| Bundle (correct) | `https://dwp.dmdc.osd.mil/dwp/main-OTOAU3J7.js` | 200 (1,273,002 B js) |
| Page JSON | `https://dwp.dmdc.osd.mil/dwp/api/page?pageId=27` | 200 (131,247 B) |
| Page scan | `…/api/page?pageId=1…45` | 200 for 1–29, 33–45 (small bodies for 3, 4, 19, 23–26); 500 for 30–32 |
| 56 location reports | `…/dwp/api/downloadZ?fileId=<id>&groupName=milRegionCountry` | 56 × 200 |
| Historical | same pattern: `AD_1954-1993.zip`, `AD_Strengths_FY1994-FY2012.xlsx`, `…FY2013-FY2020.xlsx`, `L03.zip`, `M01.zip`, `M02.zip`, `M05.zip`, `M07.zip`, `ms0/ms1/ms2_202607.pdf` | 11 × 200 (log: `dmdc_download_log.tsv`, 67 rows total) |
| GitHub API | `https://api.github.com/repos/meflynn/troopdata` (+ `/contents`, `/contents/data`, `/contents/data-raw`) | 200 |
| troopdata files | `https://raw.githubusercontent.com/meflynn/troopdata/master/{DESCRIPTION,LICENSE.md,NEWS.md,README.md,CRAN-SUBMISSION}` and `data-raw/{troopdata-rebuild-country-year.csv, …-quarter-format.csv, …-reports.csv, troopdata.csv, build_data_20260604.csv}` | 10 × 200 |
| historydata | `https://api.github.com/repos/ropensci/historydata/contents/{data,data-raw}`; raw `DESCRIPTION`, `data/us_military_strengths.rda`, `data-raw/DoD_Worldwide_US_Military_Personnel.Report_1950_1999.xlsx` | 200 |
| Web search | "DMDC Boots on the Ground …" (results listed everycrsreport.com and apps.dtic.mil; none fetched) | n/a |

Tooling: throwaway venv outside the repo (`openpyxl`, `xlrd`, `pandas`, `pdfplumber`, `rdata`; `pyreadr` failed to build and was not needed because CSVs exist). Nothing downloaded was executed.

## Housekeeping

- `pipeline/raw/_scratch/` is **not** in `.gitignore`. I did not add it there; I added it to `.git/info/exclude` (local, untracked) so nothing under it can be committed by accident. Decide whether the repo wants a real `.gitignore` line.
- Scratch size is ~100 MB (the zips); only this report and `docs/troops-preflight/*` are committed.
- Not done, by scope: no code, no `ARCHITECTURE_MAP.md` edit, no ingestion of contingency/press series, no `data/*.rda` reading (CSVs make it unnecessary).
