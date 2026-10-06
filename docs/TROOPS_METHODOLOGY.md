# Troops abroad methodology (DMDC location tables)

How `pipeline/fetch/dmdc-location.ts` and `pipeline/transform/troops-location{,-parse,-run}.ts` turn the Defense Manpower
Data Center's quarterly location reports into `pipeline/output/troops_location.json`, `troops_location_meta.json` and
`troops_location_report.json`. Schemas: `lib/troops-entities.ts`. Evidence behind the design: `docs/TROOPS_PREFLIGHT.md`
and `docs/troops-preflight/`. This is the data layer only; no page reads it yet and `national-security` is not registered
in `lib/verticals.ts`.

## Source and access

- Report: DMDC, *Military and Civilian Personnel by Service/Agency by State/Country (Updated Quarterly)*, the location
  report (`groupName=milRegionCountry`). Public U.S. government data. Page: `https://dwp.dmdc.osd.mil/dwp/app/dod-data-reports/workforce-reports`.
- The page is a JavaScript shell over one JSON endpoint, `GET https://dwp.dmdc.osd.mil/dwp/api/page?pageId=27`. Files
  download from `GET https://dwp.dmdc.osd.mil/dwp/api/downloadZ?fileId=<id>&groupName=milRegionCountry`. Plain requests:
  no cookie, token or challenge (verified 56 of 56).
- **`fileId`s change every quarter**, so they are never hard-coded: `pnpm fetch:dmdc-location` reads the page JSON,
  keeps `milRegionCountry` xlsx files from Sep 2008, and derives each period from the file name
  (`DMDC_Website_Location_Report_YYMM[_old].xlsx`; `0809` is September 2008). Two files for one period fail the fetch.
- Raw files are committed unchanged as `pipeline/raw/dmdc-location/<YYYY-MM>.xlsx` with `manifest.json` (fileId,
  groupName, uploadDate, size, sha256, fetched_at). A file already present with the same hash is not rewritten.
  `--check` fetches only the page JSON.
- 56 periods, Sep 2008 to Mar 2026: Sep-only through 2012, then every quarter from Sep 2013. Older DMDC material
  (PDF and xls, 1995-2005) is a separate session.

## What the series is, and is not

- **Active-duty personnel by place of duty**, from the active-duty columns only (Army, Navy, Marine Corps, Air Force,
  Space Force, Coast Guard, Total). Guard/Reserve and civilians are not carried.
- **Dec 2017 is a break, not a trend.** Through Sep 2017 the counts include personnel deployed in support of contingency
  operations (the file lists the CTS Deployment File as a source). From Dec 2017 the title becomes "Permanently Assigned"
  and temporary duty and contingency deployments are excluded. Overseas active duty fell 215,249 to 161,927 between Sep
  and Dec 2017 while the U.S. total rose: a reallocation. The break hits every CENTCOM host, not only the three blank rows.
  `meta.break` and each period's `basis` and flags state this; do not draw one line across it without saying so.
- **Afghanistan, Iraq and Syria are "not reported", never 0**, from Dec 2017 through Sep 2021: the rows print as blank
  starred rows (the table is deferring to OSD Public Affairs). They are `state: "suppressed"` with every count null. Real
  values come back at Dec 2021 (Afghanistan 6, Iraq 158, Syria 1). Mar 2022 prints Afghanistan, Syria and Yemen blank/starred
  again (Iraq 11).
- **Removal.** Afghanistan has no row from Sep 2023; Iraq and Syria print 0 in Sep 2023 and have no row from Dec 2023.
  An absent row is not a zero (`meta.removal`).
- **Suppressed is not 0, N/A is not 0.** `*` = `suppressed`; `N/A` = null. A starred row is emitted with null counts even if
  the file prints a 0 in its Total cell (DMDC's Sep 2021 Iraq and Syria rows do); the transform refuses to hide a positive count.
  Blank starred rows are still counted in some printed totals (Dec 2020-Sep 2021, almost all Marine Corps), which is why
  the exception table exists.
- **Army did not report Dec 2022, Mar 2023 and Jun 2023** (IPPS-A conversion): Army and every Total column are `N/A`.
  Rows have `state: "null"`, `army` and `total` null, and the other branches keep their numbers.
- **Space Force** is folded into the Air Force column (header `AIR FORCE/SPACE FORCE`) Dec 2021 to Jun 2023 and has its
  own column from Sep 2023. It is recorded as metadata and not split: `air_force` is not comparable across Sep 2023, and
  `space_force` is null before it. Coast Guard is carried as its own column (it is inside `total`).
- **Territories** (American Samoa, Guam, Northern Mariana Islands, Puerto Rico, U.S. Virgin Islands) sit inside DMDC's
  *overseas* section. They are `class: "territory"`, an explicit list in `TERRITORY_SOURCES` that a test pins. **Wake
  Island** is not on that list and stays a `host` (a handful of troops; a decision for the UI session if it matters).
- **`afloat_unassigned`**: `UNKNOWN` / `ZZ-UNKNOWN` / `UNDEFINED` (6k-30k people DMDC cannot place, in the overseas
  section). There are no regional or afloat rows in 2008+ tables.
- **Derived "abroad"** = printed OVERSEAS TOTAL minus the territory rows (so it includes `afloat_unassigned`; the
  per-period meta carries `afloat_unassigned_total` to subtract it). It is **not emitted for Dec 2022 to Jun 2023** (null,
  listed in `meta.derived.abroad_omitted_periods`): Army is N/A, so there is no like-for-like figure.
- Grain: `troops_location.json` has one row per period x canonical place, overseas section only (9,723 rows). U.S. state
  rows are parsed and gated, and their printed totals are in meta, but not emitted.

## Regions and the page

`lib/troops-regions.ts` is a fixed map keyed by ISO3 (name fallback for the few places with no code), six regions: Europe,
East Asia & Pacific, Middle East & South/Central Asia, Africa, Western Hemisphere, and Afloat & unassigned. Settled with Corby:
Turkey, Greenland, Cyprus and the Caucasus are Europe; Morocco, Algeria, Tunisia and Libya are Africa (not the Middle East),
as is Djibouti; Egypt is Middle East & South/Central Asia (the Sinai force, CENTCOM); Diego Garcia (IOT) and Central Asia
are Middle East & South/Central Asia. Territories have no region. A host with no region fails the payload build; a test pins
every call above.

The page is `/presidency/national-security` (registered as a Presidency section). `lib/troops-data.ts` (server-only, Zod at
the boundary) -> `lib/troops-derive.ts` (pure, tested over the real files) -> `components/troops/`. Choices recorded so they
are not re-litigated: the chart stacks by region and the Branch filter swaps the measure (All branches, Army, Navy, Marine
Corps, Air & Space Force, Coast Guard); Air & Space Force is Air Force + Space Force so it is comparable across Sep 2023; bars
are Σ rows over hosts and afloat (territories out), so a few years differ from the printed total by a documented gap; **bars are
federal fiscal years** (Oct 1 to Sep 30, labelled by the year they end, like the other Presidency pages), each showing DMDC's
Sep 30 table, the one table published every year since 2008, and the year in progress shows its latest quarter hatched as
partial (FY2026 = Mar 2026); each year is coloured by the president in office for most of it (`termForFiscalYear`); the
quarterly tables stay in the pipeline data but the page does not draw them. The three Army-N/A quarters (Dec 2022, Mar 2023,
Jun 2023) are not September tables, so every fiscal year on the page has an Army figure; the "Army did not report" columns and
marker 2 exist in the code but do not fire today. No percent change is shown across the FY2017/FY2018 break (the Dec 2017
table is the first permanent-assignment one, so it falls in FY2018), for the partial year, or for an Army-N/A year; the President filter narrows the years, the Country filter
shows that place's own series and only highlights on the map and list. Not built: a "No. 1 strip", a Military-share style
second measure, and the pre-2008 history (S2).

## History, 1950-2007 (S2)

`pipeline/output/troops_history.json` (+ `_meta`, `_report`) continues the series backward to June 1950 and ends at Sep 2007;
Sep 2008 onward is `troops_location.json`. Schemas: `lib/troops-entities.ts` (`historyRow`, `historyMeta`). No page reads it yet.

**Two sources, each where it is better.**
- **DMDC's own 309A tables** ("Active Duty Military Personnel Strengths by Regional Area and by Country"), Sep 30 of 1996 and
  1998-2005: extracted from the DMDC `M01.zip`/`M05.zip` PDFs by `pipeline/reference/extract-309a.mjs` (needs `pdftotext`; run by hand;
  the PDFs are not committed, the extract `pipeline/reference/dmdc-309a-sep.csv` is). Public domain, with the four branch columns, the
  afloat and undistributed rows, and 2003-04.
- **troopdata's quarter-format file** (`pipeline/raw/troopdata/`, pinned to a commit, `pnpm fetch:troopdata`, GPL-3.0 with its
  `LICENSE.md` beside it; cited in `docs/CREDITS.md`): June 1950 and June 1953-56, Sep 1957-1995, Sep 1997 and Sep 2006-07. Never the
  country-year file (inflated). Where both sources cover a year, troopdata is a gate, not a source.

**What the series is, and is not.**
- One row per (year, place), same classes as the location series: `host`, `territory` (Guam, Puerto Rico, U.S. Virgin Islands, American
  Samoa, Northern Mariana Islands), `afloat_unassigned`. Branches are Army, Navy, Marine Corps, Air Force (no Coast Guard or Space Force in
  these tables). `snapshot` is `june` for 1950-56 and `september` after.
- **Not comparable across 1995/1996 or 2007/2008 without saying so.** DMDC years carry an afloat/unassigned row (regional Afloat +
  Undistributed, 6k to 100k people: the same idea as the 2008+ `UNKNOWN` row); troopdata years have none, so their `abroad_total` is lower by
  that amount. Each year's meta says which source it is and whether `afloat_unassigned_total` exists.
- **1951-52 are left out**: troopdata fills them by stepwise imputation, not from a report.
- **Sep 2006 and Sep 2007 are flagged `estimate`** (all rows). DMDC publishes no table for them; troopdata's figures are compiled and
  press-based (Iraq 141,100 and 170,000; Kuwait 44,400 and 48,500).
- **Iraq, Kuwait and Afghanistan are `suppressed` (not reported, never 0) in 2003, 2004 and 2005**: DMDC prints them "(See OIF Table)",
  "(See Deployment Section)" or "(not available)" with a 0, and the 2003-04 printed foreign total is "Less OIF". troopdata has no Sep 2003
  or Sep 2004 figure for any large host (Germany is 0 with no source) and a Kuwait press estimate of 47,000 that is not used.
- **The forces in and around Iraq and Afghanistan are annotated, not added.** Under each 309A table DMDC prints separate deployment totals: Iraq (OIF) 183,002 on Sep 30, 2003 (active duty), 170,647 in 2004 and 192,600 in 2005 (both *including* deployed Reserve/National Guard, 2005 "not complete - rounded strengths"), and Afghanistan (OEF) 19,500 in 2005 (same basis). They are in `troops_history_meta.json` `contingency` (from `pipeline/reference/dmdc-309a-contingency.csv`, transcribed by hand from the PDFs; the transform checks that each one's branches add to its total and that it sits on a suppressed country row). They are on a different basis from the country rows and may overlap them (forces deployed from Germany are also in Germany), so no abroad total includes them. A chart of 2003-05 must carry them: without them those years understate presence in the region by a large amount (Iraq alone is more than the whole 2003 country-row total of Germany and Japan combined).
- **Unstamped rows.** troopdata prints some positive figures with source `NA`: South Vietnam every year 1957-74 (537,377 in 1968),
  and a few others. They are kept and listed in the year's `flags` (`unstamped_source: ...`); a 0 with source `NA` is an absent host and
  is not emitted. troopdata's `United States` row is continental U.S. only and is not emitted. Sep 1995 DMDC is an `.xls` the extract
  does not read (troopdata's Sep 1995 rows, the same report, are used) and Sep 1997 has no DMDC table online (flagged).
- Names go through `pipeline/transform/troops-history-aliases.json` (per source system). South Vietnam and Vietnam are both `Vietnam`
  (they never overlap in a year), Zaire is the DR Congo, Yugoslavia/Czechoslovakia/USSR/East Germany stay their own names.

**Gates (the transform fails, listing every failure).**
1. Each DMDC year's rows add up: Σ host rows + regional afloat + Undistributed = the printed `Total - Foreign Countries`, and Σ region
   totals + Undistributed agrees (exact in all nine years).
2. troopdata equals DMDC exactly for every host DMDC puts at 1,000 or more (99 of 104 hosts across the seven overlapping years; the other five are the Serbia rows below), the one
   documented exception being Serbia (DMDC "Serbia (includes Kosovo)": 6,410 in 1999 and 5,427, 5,679, 2,804, 1,801 in 2000-02 and 2005);
   troopdata's Yugoslavia row is blank those years. In 2003 and 2004 the gate asserts troopdata is empty for those hosts.
3. No unmapped name carries a troop (either source); no row wrongly flagged `reported`/`estimate`; only 1951-52 may be imputed.
4. The year set is exactly June 1950, June 1953-56, Sep 1957-2007; Iraq/Kuwait/Afghanistan are suppressed 2003-05.
5. Re-parse determinism (tested).

**Refresh.** The history is static. To change it: edit `TROOPDATA_COMMIT` in `pipeline/fetch/troopdata-lib.ts`, `pnpm fetch:troopdata`,
`pnpm exec tsx pipeline/transform/troops-history-run.ts`, review the diff. To rebuild the DMDC extract, download `M01.zip` and `M05.zip`
from the DMDC page JSON (`groupName` of the historical reports), unzip, and run `node pipeline/reference/extract-309a.mjs <dir>`.

## Parsing

Headers are found by text: the cell reading `ACTIVE DUTY` locates the active-duty columns (up to the next group header)
and the row under it names the branches (a trailing `***` on `ARMY` in the N/A periods is ignored). The group-header row
drifts (row 5 to 6, row 8 Jun 2022 to Jun 2024, row 5 again from Sep 2024). Rows are classified by position, not label:
after `UNITED STATES` to `UNITED STATES TOTAL` is the U.S. section; then to `OVERSEAS TOTAL` is overseas (Dec 2017 on the
`OVERSEAS` label moves into a footnote); `GRAND TOTAL` ends the table. The "As of" line is read from the file.

Names go through `pipeline/transform/troops-location-aliases.json` (source label to canonical name, class, ISO3).
Where DMDC prints a legacy and a current label side by side in one period (Germany and "Germany, Federal Republic of",
Montenegro and "Montenegro (2006 - 2008)"), the rows are summed into one and `source_name` joins both with ` + `.
`CONGO (KINSHASA)` is COD (the preflight crosswalk had COG for both Congos).

## Gates (the transform fails, listing every failure)

1. Every file parses, the header text is found, and the file's "As of" date falls in the filename's period.
2. Per period, Σ overseas row Totals − printed OVERSEAS TOTAL is 0 or exactly the documented exception. 45 of 53 numeric
   periods are exact, 8 are documented exceptions, and Dec 2022 / Mar 2023 / Jun 2023 are asserted untestable (Army N/A);
   that set must equal the Army-not-reported list.
3. U.S. rows sum to the printed U.S. total in every testable period; printed GRAND TOTAL = U.S. + overseas, except Mar 2017.
4. No unmapped name carries a troop. A label with only zero or suppressed counts falls back to an unmapped `host`
   and is listed in the report.
5. The Dec 2017 break and the Afghanistan/Iraq/Syria removal exist in meta and match the data exactly.
6. Re-parse determinism: the build has no clock or I/O and is byte-identical across runs (tested).

| Period | Gap (rows − printed) | Reason |
| --- | --- | --- |
| 2013-09 | +8 | ZIMBABWE printed twice (8 each); the printed total counts one. One row is emitted; the dropped duplicate is recorded in the period's `duplicate_rows_dropped`. |
| 2017-12 | +612 | Rows exceed the total; not explained by the file. |
| 2020-12 / 2021-03 / 2021-06 / 2021-09 | −534 / −495 / −427 / −189 | Printed total exceeds rows: blank starred rows still count in it. |
| 2022-06 | −329 | Rows' TOTAL differs from their branch sum for many hosts; branch columns reconcile. |
| 2024-09 | −11 | Army −3, Marine Corps −8; unexplained. |
| 2017-03 (grand total only) | −3,062 | Printed GRAND TOTAL is a stale copy of Dec 2016's. Documented, not fixed. |

For the three Army-N/A periods the other branch columns still reconcile (Jun 2023: −2 Marine Corps, −1 Air Force); that is
in the report, not gated.

## Refresh procedure

1. `pnpm fetch:dmdc-location` (the weekly workflow `.github/workflows/dmdc-location-freshness.yml` runs `--check` and
   opens a PR only when a period is new; never auto-merged).
2. `pnpm exec tsx pipeline/transform/troops-location-run.ts`. A new label with troops, or a total that does not
   reconcile, fails here: add the alias or document the exception (table above and `OVERSEAS_EXCEPTIONS`) on purpose.
3. `pnpm pipeline:check`, then review `troops_location_report.json`.

DMDC publishes late and in clumps; June 2026 had not appeared as of 2026-10-06.
