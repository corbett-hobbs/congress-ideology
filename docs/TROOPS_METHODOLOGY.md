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
