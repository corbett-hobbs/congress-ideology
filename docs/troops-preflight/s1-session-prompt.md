# Session S1 — DMDC troop-location pipeline (Sep 2008 → latest quarter)

Effort: **medium**. Data pipeline only: fetch, parse, transform, validate, tests, methodology doc. **No page, no UI, no components, no `lib/verticals.ts` change** (the `national-security` section stays unregistered until a later UI session).

## Read first (in this order)

1. `docs/TROOPS_PREFLIGHT.md`: §2 Findings, §3 Reconciliation, §5 (S1/S2 scope and gates), §6 (decisions). Everything below restates §5; if they disagree, §5 wins and tell me.
2. `docs/troops-preflight/` extracts: `dmdc_file_inventory.csv` (all 56 location files with fileId/date), `a4_layout_drift.csv`, `a5_2017_break.csv`, `nine_countries_by_period.csv`, `c_crosswalk_all_names.csv`.
3. The foreign-aid pipeline as the template for shape and conventions: `pipeline/fetch/foreign-assistance.ts`, `foreign-assistance-lib.ts`, `pipeline/transform/foreign-aid.ts`, `foreign-aid-run.ts`, `foreign-aid.test.ts`, `docs/FOREIGN_AID_METHODOLOGY.md`, `docs/DATA_CONVENTIONS.md`, `.github/workflows/foreign-assistance-freshness.yml`, and the `package.json` scripts (`fetch:*`, `transform`, `pipeline:check`).
4. `AGENTS.md` / `CLAUDE.md`. Read the Next.js docs in `node_modules/next/dist/docs/` only if you touch Next code (you should not).

## Settled decisions (do not reopen)

- **G1** Contingency/deployed forces are excluded. The Dec 2017 break is explicit metadata. Afghanistan/Iraq/Syria are "not reported" (null/suppressed), never 0, through Sep 2021.
- **G2** Territories (Guam, Puerto Rico, American Samoa, N. Mariana Islands, U.S. Virgin Islands) are classified separately from hosts. They sit inside DMDC's overseas total, so the "abroad" figure subtracts an explicit, tested territory list.
- **G3–G5** are S2 / UI concerns; S1 only has to leave the data able to support them (region mapping is a later session; here just carry ISO3 where known).

## Scope

### 1. Fetch (`pipeline/fetch/dmdc-location.ts` + lib, script `fetch:dmdc-location`)
- `GET https://dwp.dmdc.osd.mil/dwp/api/page?pageId=27` (JSON). Select files with `groupName=milRegionCountry`. Download `https://dwp.dmdc.osd.mil/dwp/api/downloadZ?fileId=<id>&groupName=milRegionCountry`. Plain requests, no cookies or tokens.
- `fileId`s change every quarter: never hard-code them; always discover via the page JSON.
- Save raw `.xlsx` unchanged to `pipeline/raw/dmdc-location/` named by period (e.g. `2025-09.xlsx`), plus a small manifest (fileId, groupName, uploadDate, size, sha256, fetched-at). Skip files already present with the same hash.
- Only periods Sep 2008 and later (the 2008+ xlsx tables). Older DMDC material is S2.
- Not in the default `transform`/CI path (network). Mirror how `fetch:foreign-assistance` is wired.

### 2. Parser + transform (`pipeline/transform/troops-location.ts`, `troops-location-run.ts`)
- Locate header rows by **text**, not row number. Group-header row drifts (row 6 through Mar 2022, row 8 Jun 2022–Jun 2024, row 5 from Sep 2024).
- Classify rows by position: U.S. section / overseas section / totals. Read the "As of" date from the file and assert it matches the filename period.
- `*` = suppressed (keep as a distinct state, not 0). `N/A` = null. Blank starred rows are still rows (they are included in some printed totals, which is why the exception table exists).
- Branch columns: Army, Navy, Marine Corps, Air Force, Space Force, Total. Space Force is merged into Air Force Dec 2021–Jun 2023 and separate from Sep 2023; record that as metadata, do not split it. Army is `N/A` for Dec 2022, Mar 2023, Jun 2023.
- Alias table (explicit, in a checked-in file) folding name variants to one canonical name + ISO3 where a real country (`countries.json` keys real countries by ISO3 `country_code`; see `c_crosswalk_all_names.csv`). `UNKNOWN`/`ZZ-UNKNOWN`/`UNDEFINED` → class `afloat_unassigned`. Territories → class `territory`. Everything else → `host`. Unmapped names fail the transform if they carry ≥1 troop and are not on the classification list.
- Output: one flat file under `pipeline/output/` (same single-file approach as foreign aid; see memory note `foreign-aid-single-output-file`) plus `_meta.json` and `_report.json`. Row grain: period × name × branch counts, with `class`, `iso3`, `state` (value/suppressed/null). Meta carries: periods covered, data-through, latest period, break metadata, removal metadata, the exception table, and per-period flags. Zod schemas in `lib/troops-entities.ts` (pattern: `lib/foreign-aid-entities.ts`). No page-facing reader in this session.
- Derived "abroad" totals: overseas total minus territories. **Not emitted** for Dec 2022–Jun 2023 country totals (Army null); emit with a flag only if you can justify it, otherwise omit and say so in meta.

### 3. Gates (the transform fails, loudly, on any of these)
1. Every file parses; header text found; "As of" matches filename.
2. Per period, Σ overseas rows − printed overseas total is **0 or exactly** the documented exception: Sep 2013 +8 (duplicate ZIMBABWE row), Dec 2017 +612, Dec 2020 −534, Mar 2021 −495, Jun 2021 −427, Sep 2021 −189, Jun 2022 −329, Sep 2024 −11. Dec 2022–Jun 2023 are untestable (Army N/A): assert that explicitly rather than skipping silently. Expect 45 exact of 53 numeric periods. If your count differs, stop and investigate before relaxing anything.
3. U.S. rows reconcile with the U.S. printed total (Mar 2017's printed grand total is a stale copy of Dec 2016: treat as a documented exception, do not "fix" it).
4. No unmapped name with ≥1 troop unless on the classification list.
5. The Dec 2017 break and the post-Sep-2023 removal of Afghanistan/Iraq/Syria rows exist in meta and are asserted by a test.
6. Re-parse determinism: running the transform twice is byte-identical.

### 4. Tests (Vitest, over the real committed raw files, `foreign-aid.test.ts` pattern)
- Gate 2 table as a test, row-for-row.
- Spot values from `nine_countries_by_period.csv` for several periods across all three layout eras.
- Suppressed vs 0 vs null distinction (Afghanistan Dec 2017–Sep 2021 suppressed; Dec 2021 = 6; Iraq Dec 2021 = 158).
- Territory subtraction; Space Force merge flag; N/A Army periods.
- Negative tests: a file with a wrong "As of" date, an unmapped country, a broken total each fail.

### 5. Wiring and docs
- Add `pipeline/transform/troops-location-run.ts` to the `transform` script chain; make sure `pnpm pipeline:check` and CI (`typecheck` → `lint` → `test` → `pipeline:check` → `build`) pass.
- `docs/TROOPS_METHODOLOGY.md`: source, URL discovery, what the series is and is **not** (permanent assignment only from Dec 2017; contingency excluded; territories rule; suppressed ≠ 0), gate list, exception table, refresh procedure.
- `docs/CREDITS.md`: DMDC entry (public domain U.S. government data; cite the report name and URL).
- Freshness: add `.github/workflows/dmdc-location-freshness.yml` modelled on `foreign-assistance-freshness.yml` (weekly, polls the page JSON, opens a PR only when a new period appears, never auto-merges). If you judge this too much for one session, say so and stop at the fetch script instead; do not half-build it.
- Add `pipeline/raw/_scratch/` to `.gitignore`.
- Do **not** edit `ARCHITECTURE_MAP.md` yet.

## Out of scope
S2 (troopdata, 1950–2007, license/citation question still open). Contingency or press-estimate series. Region mapping. Any UI, `lib/verticals.ts`, `world_map.json`, `administrations.json`, president list. Do not touch existing pipelines.

## Done means
- `pnpm typecheck && pnpm lint && pnpm test && pnpm pipeline:check` all pass; paste the tail of each.
- Gate 2 result printed per period (exact / documented exception / untestable counts).
- Latest period in the output matches the newest file on the DMDC page (Mar 2026 expected; say if June 2026 has appeared).
- Output file size and row count reported.
- Commit `pipeline: DMDC troop-location ingest (S1)`, push to `main` (pull --rebase first if rejected). Final message: summary, the gate table, anything that deviated from §5 and why, and any decision you need from me.
