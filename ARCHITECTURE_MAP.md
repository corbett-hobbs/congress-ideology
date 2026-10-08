# Architecture map

A one-page index of where things live: the data layer, the routes, and the
shared components every view is built from. Paths here are verified against the
tree as of the ICE-removals data session (2026-10-06; the data tracks above each have a `/presidency/<section>` page, listed under Routes). When you touch an area, correct
anything that has drifted.

---

## Data layer

The pipeline (`pipeline/`) fetches raw snapshots, validates them, and transforms
them into normalized JSON in `pipeline/output/` (all committed). The app reads
those at build time and joins them into page-shaped data — nothing pre-joined is
stored. See `docs/DATA_CONVENTIONS.md` for the full contract.

| `pipeline/output/`            | Grain                                     | Key                            | Built by                     | Read by |
| ---------------------------- | ----------------------------------------- | ------------------------------ | ---------------------------- | ------- |
| `id_crosswalk.json`          | one row per `icpsr`                        | `icpsr`                        | `transform/crosswalk.ts`     | transform only |
| `legislators.json`           | one row per person                         | `bioguide_id`                  | `transform/legislators.ts`   | `lib/congress-data.ts`, `lib/demographics-data.ts` |
| `terms.json`                 | (legislator, Congress, chamber)            | `bioguide_id`+`congress`+`chamber` | `transform/terms.ts`     | `lib/congress-data.ts`, `lib/demographics-data.ts` |
| `ideology_scores.json`       | (legislator, Congress, chamber)            | `bioguide_id`+`congress`+`chamber` | `transform/scores.ts`    | `lib/congress-data.ts` |
| `committees.json`            | one row per top-level committee (119th)    | `committee_id` (THOMAS id)     | `transform/committees.ts`    | `lib/committee-data.ts` |
| `committee_memberships.json` | (legislator, committee) (119th)            | `bioguide_id`                  | `transform/committees.ts`    | `lib/committee-data.ts` |
| `member-photos.json`         | which current members have a photo         | —                              | `fetch/photos.ts`            | `lib/congress-data.ts` |
| `wikipedia_summaries.json`   | one row per current member with a usable Wikipedia article (trimmed lead) | `bioguide_id` | `fetch/wikipedia.ts` (+ `wikipedia/trim.ts`) | `lib/wikipedia-bio.ts` → `profile/ProfileHeader` |
| `_report.json`               | run summary / sanity numbers               | —                              | `transform/index.ts`         | humans |
| `subcommittees.json`         | one row per subcommittee (119th)           | `subcommittee_id`              | `transform/committees.ts` (`buildSubcommittees`) | `lib/committee-data.ts` |
| `subcommittee_memberships.json` | (legislator, subcommittee) (119th)      | `bioguide_id`                  | `transform/committees.ts`    | `lib/committee-data.ts` |
| **Supreme Court track** (`court/`) — separate from Congress | | | | |
| `court/justices.json`        | one row per justice (person)               | `justice_id` (SCDB numeric)    | `transform/court.ts` via `court-run.ts` | `lib/justice-data.ts` |
| `court/mq_scores.json`       | (justice, term)                            | `justice_id`+`term`            | `transform/court.ts`         | `lib/justice-data.ts` |
| `court/court_terms.json`     | (term[, segment a/b])                      | `term`+`segment`               | `transform/court.ts`         | `lib/justice-data.ts` |
| `court/court_median_probabilities.json` | (term[, segment], justice)      | `term`+`segment`+`justice_id`  | `transform/court.ts`         | `lib/justice-data.ts` |
| `court/justice_bios.json`    | one row per justice with a matched Wikipedia article (+ public-domain portrait) | `justice_id` | `fetch/justice-bios.ts` (not the transform) | `lib/justice-data.ts` |
| `court/_report.json`         | run summary                                | —                              | `transform/court-run.ts`     | humans |
| `financial_disclosures.json` | (legislator, reporting year), band-count grain | `bioguide_id`+`year`       | Python sidecar: `pipeline/financial_disclosures/build.py` / `build_senate_html.py` / `build_ocr.py` | `lib/wealth-data.ts` |
| `line-items/<year>.json`     | (legislator, reporting year) that reconciled, item grain | `bioguide_id`+`year`, sharded by `year` | `pipeline/financial_disclosures/build_line_items.py` | `lib/line-items-data.ts` |

| **Executive orders track** — separate from Congress and the Court (DATA_CONVENTIONS §7) | | | | |
| `executive_orders.json`      | one row per executive order, 1994-present  | `eo_number` (Federal Register number — **not** a `bioguide_id`) | `transform/executive-orders-run.ts` (pure logic: `transform/executive-orders.ts`) | `lib/executive-orders-data.ts` |
| `administrations.json`       | one row per uninterrupted presidential tenure | `term_id` (inauguration date) | `transform/executive-orders-run.ts` from the hand-maintained `transform/administrations.ts` | `lib/executive-orders-data.ts` |
| `executive_orders_report.json` | run summary + anchors                     | —                              | `transform/executive-orders-run.ts` | humans |
| `pipeline/classification/eo_topics.json` | committed topic cache, one row per EO | `eo_number`           | `pnpm classify:eos` (`pipeline/classify/executive-orders.ts`) — **never** run by CI or `pnpm transform` | `transform/executive-orders-run.ts` |

| **Economic indicators track** — separate from Congress, the Court and the Presidency; time series joined through dates, not people (DATA_CONVENTIONS §8) | | | | |
| `indicator_series.json`      | one row per FRED series (10)               | `series_id`                    | `transform/indicators-run.ts` (pure logic: `transform/indicators.ts`) | `lib/indicator-data.ts` |
| `indicator_observations.json` | one row per (series, date), **full history, raw levels only** | `series_id`+`date` | `transform/indicators-run.ts` | `lib/indicator-data.ts` (applies the display window) |
| `indicators_report.json`     | counts, last observation per series, skipped missing values | —       | `transform/indicators-run.ts` | humans |

Indicators raw source: `pipeline/raw/fred/<SERIES_ID>.json` (`pnpm fetch:fred`, needs `FRED_API_KEY` — `.env.local` locally, a repo secret in Actions; not part of `fetch:all`). Weekly `.github/workflows/indicators-freshness.yml` applies the materiality rule in `pipeline/fetch/fred-diff.ts` and opens a PR only when it trips; auto-merged only after the CI gate passes. Schemas, the series catalog and `INDICATORS_DISPLAY_START`: `lib/indicator-entities.ts`. Pure derivations (jobs added, inflation, windowing, date → Congress / presidential `term_id`): `lib/indicator-derive.ts`. Reader: `lib/indicator-data.ts` (`server-only`; reads `indicator_series.json` + `indicator_observations.json`; `getIndicatorObservations(id)` is display-windowed, `{ fullHistory: true }` returns everything; `getJobsAdded()` and `getInflation()` derive over full history, then window), consumed by the Economy page. Methodology: `docs/INDICATORS_METHODOLOGY.md`.

| **Energy track** — U.S. Energy Information Administration time series plus curated policy actions; separate from Congress; joined to presidents through dates, never `bioguide_id` (DATA_CONVENTIONS §13) | | | | |
| `energy_series.json`         | one row per series (20): petroleum, SPR, natural gas, electricity | `series_id` (**not** a `bioguide_id`) | `transform/energy-run.ts` (pure logic: `transform/energy.ts`) | `lib/energy-data.ts` |
| `energy_observations.json`   | one row per (series, date), **full history from 1973, source units**, `status` final/preliminary, ~1.04 MB flat file | `series_id`+`date` | `transform/energy-run.ts` | `lib/energy-data.ts` (applies the display window) |
| `energy_report.json`         | counts, last observation, preliminary counts, skipped missing markers | — | `transform/energy-run.ts` | humans |
| `energy_actions.json`        | one row per curated action (SPR sale/exchange/refill, permits, LNG, treaty, statutes, EOs), 2015-; file-level `last_reviewed` | `action_id` (`<date>-<slug>`); optional `links.eo_numbers` into `executive_orders.json` | `transform/energy-actions-run.ts` (pure checks: `transform/energy-actions.ts`; schema `lib/energy-actions-entities.ts`) from hand-curated `pipeline/reference/energy-actions.json`; `energy_actions_report.json` for humans | `lib/energy-data.ts` (flags on the energy cards). Staleness: `.github/workflows/energy-actions-review.yml`. Guide: `docs/ENERGY_ACTIONS_CURATION.md` |

**Data-refresh auto-merge.** Every `*-freshness.yml` workflow ends by calling the shared composite action `.github/actions/gate-and-merge`: it checks out the PR commit, runs `pnpm validate` and `pnpm transform` (committing any regenerated `pipeline/output` to the PR branch), then typecheck, lint, tests, `pnpm pipeline:check` and the build, and squash-merges the PR only if all pass. If a step fails the run goes red and the PR stays open for a human (a PR pushed with `GITHUB_TOKEN` does not trigger `ci.yml`, which is why the gate runs the same commands itself). Repo settings needed: Actions may create and approve PRs, and auto-merge is not required (the action merges directly; `main` is unprotected).

Energy raw source: `pipeline/raw/eia/<SERIES_ID>.json` (`pnpm fetch:eia`, EIA API v2, needs `EIA_API_KEY` — `.env.local` locally, a repo secret in Actions; not part of `fetch:all`; pages by `offset` because the API truncates at 5,000 rows without a warning). Weekly `.github/workflows/energy-freshness.yml` applies the materiality rule in `pipeline/fetch/energy-diff.ts` and opens a PR only when it trips; auto-merged only after the CI gate passes. Schemas and the series catalog: `lib/energy-entities.ts` (the display window is `INDICATORS_DISPLAY_START`; no second constant). Methodology: `docs/ENERGY_METHODOLOGY.md`; pre-flight and decisions: `docs/ENERGY_PREFLIGHT.md`. Page: `/presidency/energy` (Routes below); reader `lib/energy-data.ts`, pure derivations `lib/energy-derive.ts`.

| **Supreme Court decisions track** — SCDB institutional counts; separate from the Court's Martin–Quinn track; keyed by `term` + `issue_area_id`, never `bioguide_id` or `justice_id` (DATA_CONVENTIONS §14) | | | | |
| `decisions_counts.json`      | one row per `(term, issue area)` with a case: `n`, dissent buckets `d0..d4`; null area = unclassified; 1946-, ~77 KB | `term`+`issue_area_id` | `transform/decisions-run.ts` (pure logic + gates: `transform/decisions.ts`; schemas `lib/decisions-entities.ts`) | `lib/decisions-data.ts` |
| `decisions_landmarks.json`   | the cases Wikipedia's landmark list names that are on the page (339): Wikipedia article title, the list headings it sits under, how it joined (cite / docket / name+year) | `case_id` | `transform/decisions-run.ts` (`transform/landmarks.ts`) from `pipeline/raw/wikipedia-landmarks/` | `lib/decisions-data.ts` |
| `decisions_articles.json`    | the Wikipedia article for each case a volume or term list names (3.4k of 8,251): title, or null = the list shows it as a red link (no article); a case on no list has no row; landmarks keep the landmark list's own link | `case_id` | `transform/decisions-run.ts` (`transform/wikipedia-cases.ts`) from `pipeline/raw/wikipedia-cases/` (`pnpm fetch:wikipedia-cases`: ~300 volume/term list pages + redirect map; weekly `.github/workflows/wikipedia-cases-freshness.yml` re-fetches, re-runs the transform and opens a gated PR only when a row, link or redirect changed) | `lib/decisions-data.ts` (tuple field 10 of `DecisionCase`) |
| `decisions_summaries.json`   | one sentence per linked case saying how the Court ruled (~2.6k of the 3.4k): `via: "wikipedia"` = Wikipedia's own words from the opening of the case's article, name and cite cut off; `via: "claude"` (~630) = written by the Claude API from that opening where it states the ruling less directly, held to the article's own words; ≤300 chars; no clean ruling in the opening = no row | `case_id` | `transform/decisions-run.ts` (`transform/wikipedia-case-summaries.ts`: pure picker + gate; report `case_summaries`) from `pipeline/raw/wikipedia-cases/leads.json` + the committed model cache `pipeline/classification/case_summaries.json` (`pnpm summarize:cases`, needs `ANTHROPIC_API_KEY` in `.env.local` or the repo secret; incremental, never overwrites) (`pnpm fetch:wikipedia-case-leads`: first 1,000 chars of each linked article's lead, 20 titles a request, incremental, `-- --all` refetches; the weekly workflow runs it after the lists) | `lib/decisions-data.ts` (tuple fields 11 = sentence, 12 = 1 when model-written, of `DecisionCase`) → `CaseListCard` |
| `decisions_cases.json`       | one row per case in scope (oldest first, ~1.6 MB): name, cite, date, issue area, dissent band, vote; gate: aggregates back to the counts | `case_id` | `transform/decisions-run.ts` (`buildCaseRows`, `prettyCaseName`) | `lib/decisions-data.ts` (`getDecisionCases`, served at `/data/decisions/cases`) |
| `decisions_meta.json`        | SCDB version, data-through term, exclusions, citation, Chief Justice spans (+ appointing president/party), issue-area catalog | — | `transform/decisions-run.ts` from `pipeline/reference/{decision-issue-areas,chief-justices}.json` | `lib/decisions-data.ts` |
| `decisions_report.json`      | totals by bucket/decade/issue area, gate results | — | `transform/decisions-run.ts` | humans |

Decisions raw source: `pipeline/raw/scdb/{SCDB_<YYYY_NN>_caseCentered_Citation.csv,manifest.json}` (`pnpm fetch:scdb`; keyless, latin-1; manual refresh, not in `fetch:all`; monthly `.github/workflows/scdb-freshness.yml` probes for a newer release, opens a PR, warns instead of failing when the host is down). Methodology: `docs/DECISIONS_METHODOLOGY.md`; pre-flight: `docs/SCDB_PREFLIGHT.md`.

| **Immigration enforcement track** — ICE removals by fiscal year; separate from Congress; joined to presidents through dates (DATA_CONVENTIONS §9) | | | | |
| `enforcement_series.json`    | one row per `(period, metric, scope)`: ICE removals, FY2003–FY2025 | `period`+`metric`+`scope` (**not** a `bioguide_id`) | `transform/enforcement-run.ts` (pure logic: `transform/enforcement.ts`; also runs `assertEnforcementInvariants` from `lib/immigration-derive.ts`) | `lib/immigration-data.ts` |
| `enforcement_notes.json`     | definition/reporting changes with the fiscal-year range each applies to | `id` | `transform/enforcement-run.ts` | nothing yet |
| `enforcement_report.json`    | run summary: gaps, status counts, blended years, corroboration, source hashes | — | `transform/enforcement-run.ts` | humans |
| `removals_by_country.json`   | one row per `(fiscal_year, country_key)`: ICE removals by country of **citizenship** (not destination), FY2014–FY2024; zero-removal countries have no row; `needs_review` marks wrapped/merged names | `fiscal_year`+`country_key` (the trade `country_code`; non-ISO entities `XUN`, `XST`, `XKO`, `PSE` documented in the methodology) | `transform/removals-country-run.ts` (pure logic: `removals-country.ts`, table readers `removals-country-parse.ts`, names `removals-country-names.ts`); fails unless each table sums to its printed Total, each year sums to `enforcement_series.json` (zero tolerance), and overlapping ICE documents agree | `lib/removals-country-data.ts` |
| `removals_by_country_report.json` | per-year source document, run date, row counts, printed vs. national totals, uncovered years (FY2013 top ten only, FY2025 none) | — | `transform/removals-country-run.ts` | `lib/removals-country-data.ts` |

Enforcement raw source: ICE documents snapshotted in `pipeline/raw/ice/` with a `.txt` extract each; the curated catalog (values + verbatim quotes + notes) is `pipeline/reference/ice-removals-catalog.json`; `pnpm fetch:ice` downloads/extracts (manual refresh, no workflow — ICE URLs are unstable). Schemas: `lib/enforcement-entities.ts`. Presidential attribution reuses `ADMINISTRATIONS` + `termIdForDate` (no second terms table). Methodology: `docs/IMMIGRATION_ENFORCEMENT_METHODOLOGY.md`; source findings: `docs/IMMIGRATION_SOURCE_NOTES.md`.

| **Trade track** — U.S. Census trade statistics; separate from Congress; joined by `country_code` and by date, never by `bioguide_id` (DATA_CONVENTIONS §10) | | | | |
| `countries.json`             | one row per Census partner code (261: 244 partners + 17 aggregates) | `census_code` (source id); `country_code` = ISO3 join key (several Census codes may share one) | `transform/trade-run.ts` (pure logic: `transform/trade.ts`, `trade-iso.ts`) | nothing yet (no UI) |
| `trade_national.json`        | `(period, frequency, basis, scope, adjustment)`: annual BOP goods+services 1991-, monthly Census-basis goods (NSA + SA) 1991- | as listed | `transform/trade-run.ts` | nothing yet |
| `trade_by_country/<year>.json` | (country, year) with 12 monthly goods exports/imports, annual totals and balance, Census basis, 1991- | `country_code`+`year`, sharded by `year` | `transform/trade-run.ts` | nothing yet |
| `duties_by_country/<year>.json` | (country, year) with 12 monthly calculated duties, imports for consumption, rate; whole $, **1993-**; `source` = `usitc_dataweb` (1993–2009, frozen) or `census_api` | `country_code`+`year`, sharded by `year` | `transform/trade-run.ts` | nothing yet |
| `duties_national.json`       | one row per month, 1993-: all-countries duties, imports, rate, `source` | `period` | `transform/trade-run.ts` | nothing yet |
| `trade_report.json`          | per-source rows/first/last period, countries vs aggregates, file sizes, reconciliation gaps | — | `transform/trade-run.ts` | humans |
| `tariff_actions.json`        | one row per curated tariff action or court ruling, 2018-; file-level `last_reviewed` | `action_id` (`<effective date>-<slug>`); `countries` use `country_code`; optional `links.eo_numbers` into `executive_orders.json` | `transform/tariff-actions-run.ts` (pure checks: `transform/tariff-actions.ts`; schema `lib/tariff-actions-entities.ts`) from hand-curated `pipeline/reference/tariff-actions.json` | nothing yet (Chart 2 / Chart 4 later); `tariff_actions_report.json` for humans. Staleness: `.github/workflows/tariff-actions-review.yml`, threshold `TARIFF_ACTIONS_STALE_DAYS`. Guide: `docs/TARIFF_ACTIONS_CURATION.md` |

Trade raw source: `pipeline/raw/census-trade/{country.xlsx,gands.xlsx,country.txt,duties/<year>.json}` (`pnpm fetch:census-trade`; the API needs `CENSUS_API_KEY`, `.env.local` locally / a repo secret in Actions; not part of `fetch:all`). Duties 1993–2009: one-time `pnpm fetch:dataweb-duties` (needs `DATAWEB_TOKEN`; not in CI, not in `fetch:all`) -> `pipeline/raw/dataweb-duties/<year>.json`, read by the same transform. Weekly `.github/workflows/trade-freshness.yml` rebuilds and opens a PR only if `pipeline/output/` differs; auto-merged only after the CI gate passes. `.xlsx` is read by `transform/xlsx.ts` (no dependency). Schemas: `lib/trade-entities.ts`. Methodology: `docs/TRADE_METHODOLOGY.md`; source findings: `docs/TRADE_INVESTIGATION.md`.

| **Foreign assistance track** — ForeignAssistance.gov; joined to trade by `country_key` = `countries.json` `country_code` (DATA_CONVENTIONS §11) | | | | |
| `foreign_assistance.json` | (recipient, fiscal year, sector category), FY2001-: nominal `disbursements_usd` (headline), `obligations_usd?`, `military_disbursements_usd`; `recipient_type` country/regional/global (all kept) | `recipient_type`+`recipient_name`+`fiscal_year`+`sector_category`, single file, ~7.4 MB | `transform/foreign-aid-run.ts` (pure logic: `transform/foreign-aid.ts`) | `lib/foreign-aid-data.ts` |
| `foreign_assistance_meta.json` | `data_through`, per-year `is_partial` (calendar rule), taxonomy | — | `transform/foreign-aid-run.ts` | `lib/foreign-aid-data.ts` (default year = latest non-partial) |
| `world_map.json` | Natural Earth 1:50m outlines projected (Natural Earth projection, 1000 wide), simplified, 114 KB raw / 36 KB gzipped; per-recipient outline keys, small-recipient markers, `undrawn` list | outline `key` = trade `country_code` (Kosovo `XKX`) | `transform/world-map-run.ts` (pure: `transform/world-map.ts`; raw `pipeline/raw/natural-earth/`) | `lib/foreign-aid-data.ts` (`getWorldMap`) |
| `foreign_assistance_report.json` | crosswalk results incl. unmapped entities, reconciliation vs Pew targets, file sizes | — | `transform/foreign-aid-run.ts` | humans |
| `troops_location.json` | (quarter, canonical place), overseas section only, Sep 2008-: active-duty counts by branch, `class` host/territory/afloat_unassigned, `iso3`, `state` value/suppressed/null | `period`+`name`, single file, ~2 MB | `transform/troops-location-run.ts` (logic + gates: `transform/troops-location.ts`; parser `troops-location-parse.ts`; aliases `troops-location-aliases.json`) | `lib/troops-data.ts` |
| `troops_location_meta.json` | periods covered, data-through, the Dec 2017 break, Afghanistan/Iraq/Syria removal, Space Force merge, exception table, per-period printed totals/gaps/flags, derived `abroad_total` | — | `transform/troops-location-run.ts` | `lib/troops-data.ts` |
| `troops_location_report.json` | gate counts per period (45 exact / 8 documented exception / 3 untestable), row counts, unmapped fallbacks, file size | — | `transform/troops-location-run.ts` | humans |
| `troops_history.json` | (year, canonical place), June 1950-56 and Sep 1957-2007: active-duty total + four branches, `class`, `iso3`, `state` value/suppressed, `source` troopdata/dmdc_309a, `quality` reported/estimate | `year`+`name`, single file, ~1.5 MB | `transform/troops-history-run.ts` (logic + gates: `transform/troops-history.ts`; aliases `troops-history-aliases.json`) | `lib/troops-data.ts` (merged into the one payload) |
| `troops_history_meta.json` | per-year source, snapshot, abroad total, afloat/unassigned total (DMDC years only), flags, 1951-52 gap, Sep 1995/1997/2006-07 substitutions, comparability notes, `contingency` (DMDC's OIF/OEF in/around Iraq and Afghanistan totals for 2003-05; `buildTroopsPayload` writes them into the Iraq/Afghanistan rows, this keeps the caveat) | — | `transform/troops-history-run.ts` | `lib/troops-data.ts` (merged into the one payload) |
| `bases.json` | one row per known overseas installation (`base_id`), name/country/`iso3`/lat/lon/`site_type`, build-time projected `x`,`y`, `needs_review`; one undated snapshot "through 2018", no headcounts | `base_id`; joins the troop series by `iso3` only | `transform/bases-run.ts` (logic + gates: `transform/bases.ts`; schema `lib/bases-entities.ts`; runs after `world-map-run`; raw `pipeline/raw/troopdata/basedata.csv`) | `lib/bases-data.ts` (`getBasesPayload`, inline, ~18 KB gzipped) |
| `bases_report.json` | rows per country/type, excluded rows and why, ISO overrides/exceptions, troops-without-bases and reverse, size | — | `transform/bases-run.ts` | humans |
| `troops_history_report.json` | gate results (DMDC foreign totals exact, troopdata reconciliation per year), row counts, file size | — | `transform/troops-history-run.ts` | humans |

Foreign-assistance raw source: `pipeline/raw/foreign-assistance/{<fy>.json,meta.json}` (`pnpm fetch:foreign-assistance`; keyless public API; re-runnable, not in `fetch:all`; weekly `.github/workflows/foreign-assistance-freshness.yml` opens a PR only when the source moved). Schemas: `lib/foreign-aid-entities.ts`. The transform reads `output/countries.json`, so it runs after `trade-run.ts` in `pnpm transform`. Methodology and source findings: `docs/FOREIGN_AID_METHODOLOGY.md`.

DMDC troop-location raw source: `pipeline/raw/dmdc-location/{<YYYY-MM>.xlsx,manifest.json}` (`pnpm fetch:dmdc-location`; keyless; discovers files from the page JSON; not in `fetch:all`; weekly `.github/workflows/dmdc-location-freshness.yml` opens a PR only when a period is new). Schemas: `lib/troops-entities.ts`. Methodology and gates: `docs/TROOPS_METHODOLOGY.md`.

Troops history raw sources: `pipeline/raw/troopdata/` (`pnpm fetch:troopdata`; pinned commit; GPL-3.0 `LICENSE.md` committed beside it; `lib`: `pipeline/fetch/troopdata-lib.ts`) and `pipeline/reference/dmdc-309a-sep.csv` (hand-run extract of DMDC's 309A PDFs: `pipeline/reference/extract-309a.mjs`, needs `pdftotext`). Methodology: `docs/TROOPS_METHODOLOGY.md` "History".

Executive-orders raw source: `pipeline/raw/federal-register/executive_orders.json`
(`pnpm fetch:executive-orders`; weekly `.github/workflows/executive-orders-freshness.yml`
opens a PR, auto-merged only after the CI gate passes). Schemas: `lib/executive-orders-entities.ts`.
`docs/eo-topic-audit.csv` is the 100-row human-review sample (reviewed, all agree).

Court raw sources: Martin-Quinn `pipeline/raw/mq/<year>/{justices,court}.csv` (hand-placed/`--adopt`ed — the host bot-challenges scripts; fetch: `fetch/mq.ts`, pure helpers `fetch/mq-check.ts`) and FJC bios `pipeline/raw/fjc/*.csv` (`fetch/fjc.ts`); committed hand-reviewed crosswalk `pipeline/transform/court-crosswalk.json`; schemas `lib/court-entities.ts`. Freshness: `.github/workflows/mq-freshness.yml` (monthly, warns instead of failing on a challenge). See DATA_CONVENTIONS §6.

Raw sources: Voteview `HSall_members.csv` / `HSall_parties.csv`;
`@unitedstates/congress-legislators` `legislators-current.yaml`,
`legislators-historical.yaml`, `committees-current.yaml`,
`committee-membership-current.yaml`. Committee data is **current-Congress only**
— there is no historical roster file — so the committee views are pinned to the
latest Congress and carry no trend chart.

### Build-time joins (`lib/`, `server-only`)

| Module                | Produces                                                     |
| --------------------- | ----------------------------------------------------------- |
| `lib/congress-data.ts`| `ChamberCurrent` / `ChamberHistory` / `MemberProfile`; `getCurrentMemberIndex()` (shared by committee-data) |
| `lib/committee-data.ts`| `CommitteeSummary` / `CommitteeProfile` — joins the roster to each member's latest-Congress score and **blends each committee to a `(dim1, dim2)` point** (unweighted mean) + `spread` (`max−min` dim1). Also resolves `compassColorClass` (chamber → fill class, via `lib/committee-palette.ts`) once per committee here, at the data-prep layer — `CommitteeCompass` just reads the field, no member-vs-committee branching in the chart component. Also builds `byMember` (`committee_memberships.json` inverted to `bioguide_id`-keyed) for `getMemberCommitteeMemberships()` — a member's own committee list, role-then-seniority sorted. Client-safe shapes in `lib/committee-types.ts`. |
| `lib/committee-palette.ts` | Committee-compass **chamber**-identity colours (House / Senate / joint→neutral) — a deliberate departure from `lib/party-palette.ts`'s majority-party colouring, scoped to compass dots only (`committee/CommitteeCompass`). "How each committee votes" (`CommitteeSwarm`) still uses party colours per member seat, unaffected. Validated via `validate_palette.js` (see its `FORCED_PAIRS`/`NEW_KEYS` — these colours never co-occur with a real `party_code`, so the automatic co-occurrence detection can't see them; they're checked explicitly instead). |
| `lib/neighbors.ts`    | `nearestNeighbors` — generic over any `{dim1, dim2}` entity (members *and* committees), with `ideologicalDistance` |
| `lib/wealth-data.ts`  | Reads `financial_disclosures.json` + `terms.json`, `server-only`. `getWealthData()` — every current member joined to usable filing years (cohort-wide, for `/wealth`). `getMemberWealthProfile(bioguideId)` — one member's *every* row (not just usable), classified per year by `buildProfileYears` (`lib/wealth-derive.ts`), plus reconciled line-item rows — the profile card's payload. Re-exports `lib/wealth-derive.ts` in full. |
| `lib/wealth-derive.ts`| Pure, unit-tested data-shaping (no file I/O): `isUsableRow`, `buildWealthMembers`, `annualizedRate`, `hasDataGap`, `buildProfileYears` (the profile card's 4-state year classification: usable / needs_review / not_extractable / no_filing), `filingYearOf`, the compact client payload codec (`toWealthPayload`/`fromWealthPayload`). |
| `lib/wealth-bands.ts` | EIGA band label → `(lo, hi)` bounds, TS restatement of `pipeline/financial_disclosures/bands.py`; `filingRange()` sums a filing's band counts into a net worth range. |
| `lib/line-items-data.ts` | Reads `pipeline/output/line-items/<year>.json`, `server-only` — the **first sharded** pipeline output (every other `lib/*-data.ts` reader assumes one flat file). Indexes all shards once by `bioguide_id` then `year`; degrades to empty (not an error) if the directory doesn't exist yet in a checkout. |
| `lib/executive-orders-data.ts` | Reads `executive_orders.json` + `administrations.json`, `server-only`. `getExecutiveOrdersData()` — year x topic x president aggregates (`aggregateByYear`, by **signing** year; a transition year carries both presidents) plus each year's order list. Client-safe shapes, the fixed topic order and topic styling (3 colour families x 3 fills) in `lib/executive-orders-types.ts`. |
| `lib/demographics-data.ts` | Reads `legislators.json` (now carries a full `birthday`) + `terms.json` + `administrations.json`, `server-only`, Zod at the boundary. `getDemographicsPayload()` — 47 Congresses (73rd-) x 3 chamber views (Both / Senate / House): seat-holders, age median/average by caucus, women by caucus, tenure bands. Pure, unit-tested shaping in `lib/demographics-derive.ts` (roster = every voting member who held a seat at any time in the Congress; age on the convening day; convening dates and the non-voting rules in `lib/demographics-entities.ts`, verified against the raw YAML by a test); chart helpers (year window, term band, readout rows) in `lib/demographics-chart.ts`; client-safe shapes in `lib/demographics-types.ts`. The payload is small (a few tens of KB), so there is no separate codec. Presidents: `HISTORICAL_ADMINISTRATIONS` in `lib/troops-presidents.ts` (now starts with Roosevelt, 1933) + `administrations.json`. Methodology: `docs/DEMOGRAPHICS_METHODOLOGY.md`. |
| `lib/disclosure-url.ts` | `sourceDocUrl(sourceSystem, sourceDocId, year)` — the app-side restatement of `fetch.py`'s House PDF URL template and `senate_fetch.py`'s Senate report URL template (no such builder existed before Session 6). |

---

## Routes (`app/`)

| Route                                               | Kind | Renders |
| --------------------------------------------------- | ---- | ------- |
| `/`                                                 | static | Hub — Presidency is a full-width directory (EO-by-year chart + total from `getExecutiveOrdersData()` on the left; on the right a linked row per section with its one-sentence `blurb` from `lib/verticals.ts`, so a new section only needs its `blurb` there), (rows are `components/HubSectionList`, shared with the cards below); the half-width cards stack their pages as rows pinned to the card bottom (`mt-auto`), so extra height from the taller neighbour goes into the centred chart area, not a gap above the rows; then a half-width card each for Congress (party-mean sparkline + dim-1 gap stat for the latest Congress, from `getBothTrend()`) and Supreme Court (median justice's name for the latest term + court-median sparkline, from `getCourtHubSummary()` in `lib/justice-data.ts`; no numeric score). Redirect target of nothing; bare `/` never redirects. |
| `/supreme-court/ideology`                           | static | `CourtExplorer` — "How Does the Supreme Court Lean?": sticky toolbar (Appointed by party pills + president dropdown, term slider), chart 1 `JusticeStrip` (beeswarm of the selected term), chart 2 `PresidentRows` (career average by appointing president), chart 3 `JusticeTrajectory` (every justice over time). One shared `term` / `appointed` / `president` / `selectedId` in `CourtExplorer`. `/supreme-court` 308s here. |
| `/supreme-court/decisions`                          | static | `DecisionsPageClient` — "How Does the Supreme Court Decide?": pinned `DecisionsFilterBar` (Issue area dropdown, a **"Landmark cases" checkbox** (Wikipedia's list of landmark decisions; narrows every chart, the heatmap and the list; beside the dropdown on phones), the Years-shown slider with the **Chief Justice** term band under it, tinted by the appointing president's party; no President dropdown), then four cards on one `DecisionsState` (years window, issue area, landmark-only, dissent band, hovered / pinned term): `CasesCard` (argued cases decided per term, stacked by issue area via `charts/StackedBars` — the six biggest areas plus "Other areas" in the seven `--fuel-*` colours — with a Number / Share of term toggle; the **legend entries are filters** that set the page's issue area, a second click clears; peak/low re-picked for what is drawn, Chief band under the axis), `SplitCard` (the same terms as a stacked **area** of five dissent bands, `SplitChart`, **per term while a term holds enough cases to read a share from, and grouped by decade (`SplitDecadeBars`: 100% stacked bars with "n=…" under each decade) once the selection is thin** — median under 15 cases a term, i.e. the landmark filter or a small issue area; `splitGrain` in `lib/decisions-derive.ts`; one decade or fewer in the window stays per term (automatic only: there is no toggle, since per term on a thin selection is the spiky view the grouping avoids): Share / Number toggle, band names in the band where thick enough via `placeBandLabels` else in a right gutter on wide charts, legend entries and gutter labels isolate a band and switch to the count view, few-cases note when the selection's median is under 15 cases a term; stacked bars were tried in #66 and reverted) and `AreasCard` ("Which kinds of cases split the Court?": on `lg` two panels side by side, a **decade heatmap** (`DecadeHeatmap`: issue areas down, decades across; the card's **one toggle** — Cases / 5–4 / Unanimous, `ReversibleSortToggle`, a second click reverses — sets the heatmap's measure and the order of both charts' rows: a case count ("1.1k" in a phone-width cell, full number in the title and on wide screens), or the share that split 5–4 or were unanimous; one solid colour on one scale for every cell ("All issue areas" on its own scale in the count view), thin share cells outlined not shaded, decades outside the years window faded, click picks the area) on the left and the rows on the right, stacked on phones; `charts/StackedRows`: "All issue areas" pinned first, one 100% bar per area over the years window, `ReversibleSortToggle` Cases / Unanimous / 5–4, a row or heatmap click sets the same Issue area as the dropdown and dims the other rows; the rows scroll in a fixed-height box on phones only). Crosshair and pin linked across cards 1 and 2. Card 2's band pick (legend or band name) is the page's **vote filter**: it also narrows card 1 to those cases. `CaseListCard` ("Every case" — on phones each row is the name, then date and citation with the vote on the right, then issue area and the landmark badge; from `sm` four columns; the executive-order list pattern: fixed-height scroll box, rows added on scroll, newest first, a case name links to its Wikipedia article (landmarks, and every case Wikipedia's volume and term lists tie to one by U.S. cite, docket, or name+year: `wikiCaseUrl`), to nothing when the lists show the case as a red link, and to Wikipedia's go-search only for the few cases on no list; Justia links were dropped, they did not work) lists every case matching the window, issue area (incl. "Other areas"), vote band and a pinned term, each active filter a chip that clears itself; a search box top right of the card filters the list by title, citation, issue area, landmark heading or summary keyword (every word must match; shows as a chip); it fetches `/data/decisions/cases` on mount. Data notes + View as table per card, one open Source line (SCDB citation). Data `getDecisionsPageData()` (`lib/decisions-data.ts`), no `outputFileTracingIncludes` entry (reads at build time). Components in `components/decisions/`. Browser check: `pnpm check:decisions`. |
| `/supreme-court/justices/[justice_id]/[name_slug]`  | SSG + dynamic | `JusticeProfileView` — one page per justice in the Martin-Quinn data (49). SCDB `justice_id`; stale slug → 308, unknown/non-numeric id → `not-found.tsx`. Identity row, "Ideology over time" card, "Where {Last} sits" swarm + roster card (one shared Served alongside / Nearest neighbors toggle), shared `AboutScoresCard`. In `sitemap.xml`; `outputFileTracingIncludes` covers `pipeline/output/court/*.json`. |
| `/congress/ideology`                                | static | `SenateExplorer` — the compass / delegation / trend explorer, with a Members ↔ Committees toggle (119th only). Reads `?chamber`, `?state`, `?show`. |
| `/congress/senators/[bioguide_id]/[name_slug]`      | SSG + dynamic | `MemberProfileView` (stale slug → 308, bad id → 404) |
| `/congress/house/[bioguide_id]/[name_slug]`         | SSG + dynamic | `MemberProfileView` |
| `/congress/committees/[committee_id]/[name_slug]`   | SSG + dynamic | `CommitteeProfileView` — same shape as a member profile minus the trajectory chart |
| `/data/[chamber]`                                   | static JSON | the scrub-through-time payload, fetched on demand |
| `/congress/wealth`                                  | static | `WealthPageClient` — chamber/state filter bar, the net worth scatter ("where they started, where they are now"), highest/lowest lists. |
| `/congress/demographics`                            | static | `DemographicsPageClient` — "Who Serves in Congress?": pinned `DemographicsFilterBar` (Chamber switch + the Years-shown slider, 1933-2027, with the presidential-term band under it; no President dropdown), a three-tile `StatStrip` for the pinned Congress (the latest when none is pinned; one row, detail lines dropped on phones, sticking under the pinned bar via `data-pinned-bar` at every width), then three cards on one chamber view, one years window and one pinned Congress (a dashed playhead and a readout above each chart; `shared.tsx` `CongressReadout`): `AgeCard` (`AgeChart`: Democrats / Republicans lines, Median / Average, legend isolate, one example value per line), `WomenCard` (`charts/StackedBars`: women by caucus, Share / Number of members, axis fit to the data, peak/low labels, legend isolate), `TenureCard` (`StackedBars`: Up to 2 years / 3–10 / 11–20 / Over 20 years, `--tenure-*`, every bar 100%). Term strip under each axis via `TermBandSvg`, the president in office on the Congress's first day. Data notes + View as table under each chart, one open Source line. Data `getDemographicsPayload()` (`lib/demographics-data.ts`), no `outputFileTracingIncludes` entry (reads at build time). Components in `components/demographics/`. |
| `/presidency/executive-orders`                      | static | `ExecutiveOrdersPageClient` — "How Many Executive Orders Does Each President Sign?": executive orders per signing year stacked by topic (`StackedBars`), Count / Share-of-year toggle, topic highlight filter (mobile: two-row horizontally scrolling chip strip), pinned President dropdown + Years-shown slider, president-term bands, click a year to list its orders (links to the Federal Register; the list sits inside the same card, directly under the term bands, with Data notes and the table below it), `<details>` table fallback. The Presidency vertical's default section; The pinned bar also has a Topic dropdown bound to the same state as the topic chips. |
| `/presidency/economy`                               | static | `EconomyPageClient` — "What Was the Economy Like?": misery-index hero + eight cards (gas, inflation, jobs added, unemployment, mortgage, household income, deficit, debt) on one shared day axis (`lib/indicator-time.ts`), NBER recession shading, a president band under every chart, optional House/Senate majority rows (`pipeline/reference/congress-control.json`), pinned `EconomyFilterBar` (Years-shown slider with the presidential-term band under it (no President dropdown; `charts/TermBand`, terms add up), active-date status, Clear date); the Congress-control checkbox is a chart option, not a filter, so it sits above the cards (default off, unchecked), rows drawn under every chart when on, linked crosshair/pin and president selection through one `EconomyState` provider (hover rAF-throttled; each chart's static layer is memoized so only the crosshair overlay re-renders), `<details>` table fallbacks, `aria-live` announcement on pin only. Payload codec `lib/indicator-payload.ts`; date→reading rules `lib/indicator-lookup.ts` (reused by the hover/pin layer); presidents `lib/economy-presidents.ts` (`administrations.json` + Bush 41). Components in `components/economy/`. |
| `/presidency/trade`                                 | static | `TradePageClient` — one-line pinned `TradeFilterBar` (Country combobox you can type into or scroll (`CountryCombobox`, `lib/trade-country-search.ts`), the Years-shown slider with the presidential-term band under it (no President dropdown), Clear date; the Congress-control checkbox sits above Chart 1, default off), then Chart 1 `TradeBalanceCard`/`TradeBalanceChart`: goods balance or exports and imports, monthly, national line seasonally adjusted, country view unadjusted (its file is fetched from `/data/trade/countries/[code]` on first selection), term bands, NBER recessions, optional House/Senate rows, linked crosshair/pin through one `TradeState` provider, `<details>` table. Same day axis and era layers as Economy (`getEraLayers` in `lib/indicator-data.ts`). Chart 2 `TradeTariffCard`/`TradeTariffChart`: calculated duties ÷ imports for consumption, monthly from 1993 on the same axis and linked crosshair as Chart 1 (national, or the country with a faint all-countries line), a light no-data zone before the series starts, a dashed marker where the source changes (USITC DataWeb to 2009, Census API from 2010), and event flags from the curated `tariff_actions.json`; flag layout is pure and tested (`lib/trade-flags.ts`: grouping, lanes, right-anchoring, priority-2 only where there is room, past-the-end flags pinned to the edge, numbered markers on narrow screens), rate helpers in `lib/trade-chart.ts`. Shared time-axis layers (recessions, year axis, president band, chamber rows) live in `components/trade/EraLayers.tsx`, used by Charts 1 and 2. Below them, **Chart 3 is one card, "Who the U.S. trades with"** (`TradePartnersCard`): a play button, the Year dropdown (`charts/YearPicker`, play steps one year at a time) and a reversible Total trade / Balance toggle (no A–Z), right-aligned in the card header like the foreign-aid and national-security map cards (`charts/ChartCard`), drive both the partner list and the choropleth beside it (`TradeMap`, model `lib/trade-map.ts`: fixed absolute bins, world outlines from `getWorldMap()` shipped in `TradePageData.worldMap`); the map's shading key sits under the map and the Imports / Exports key under the list; one Data notes and one table. Chart 5 is full width under them, labelling the five biggest partners by latest-year total trade.** Chart 3 `TradePartnersCard`: every partner for the year picked in the card's own year picker as an imports (filled) / exports (hollow) dumbbell on a symmetric-log scale through `SwarmRows`, signed balance at right, a list that shows 10 rows and scrolls vertically (every width), `ReversibleSortToggle` (Balance / Total trade / A–Z, all reversible), row click picks that country in the filter bar, partial-year note, `<details>` table; year files fetched from `/data/trade/years/[year]` on demand (latest year ships inline); model in `lib/trade-partners.ts`, display names in `lib/trade-names.ts`. Chart 5 `TradeScatterCard`: did tariffs shift trade? One dot per country, change in duty rate (percentage points, linear) against change in imports for consumption (symmetric log, outliers pinned as triangles), dot area sized by the country's latest-year total trade (sqrt scale, 3-10px radius; `totals` prop from the partner year), top partners labelled where they don't collide, in-card search, `<details>` table with months covered; model in `lib/trade-scatter.ts` (windows, per-country changes, axes, label placement), computed at build in `getScatter()` and shipped inline (~230 rows); tap behaviour follows `(hover: hover)`, not width. A before/after-the-ruling chart was built and then removed (see git history, `35f009b`). **Phones** (the mobile board in the Trade mockup): the bar is Country (label beside it, rule 5a) with the Years-shown slider and term band on a second pinned line, each time chart prints the pinned or latest month above it (`MobileReadout`), touch drag pins a month, a scatter tap fills a card below instead of a tooltip. Not built yet: the Latest developments list (own session). Data: `lib/trade-data.ts` (`server-only`; `getTradePageData()`), pure pivot `lib/trade-payload.ts`, types `lib/trade-types.ts` (monthly arrays, month 0 = 1991-01), chart math `lib/trade-chart.ts`, window/sort math `lib/trade-derive.ts` (all unit-tested). Components in `components/trade/`. |
| `/presidency/energy`                                | static | `EnergyPageClient` — "How Has U.S. Energy Changed?": pinned `EnergyFilterBar` (the Years-shown slider with the presidential-term band under it; no President dropdown, no other filter), then five full-width cards, in this order (electricity leads as the broadest summary, oil cards grouped, LNG after them, the Reserve last), on one shared day axis and one `EnergyState` (hover/pin date, year window; linked crosshair, `<details>` table per card): `SprCard` (Strategic Petroleum Reserve, weekly, the page's anchor; numbered tap-to-pin flags from `energy_actions.json`, each naming its authority and, for SPR rows, sale / exchange / sale and exchange / refill), `SupplyDemandCard` ("Oil supply and demand": total-petroleum production against products supplied, two lines, no flags) and `OilTradeCard` ("Oil imports and exports": Balance | Exports & imports toggle, opening on Balance; net imports with its zero line, or imports and exports with crude-only exports as a thin dashed line in that view; the 2015 export-repeal flag), `ElectricityCard` (utility-scale stack, Share of total / Amount toggle, `other` = total minus the six named fuels, with each fuel named in its band where the band is thick enough (`placeBandLabels` in `lib/energy-chart.ts`: best x, clear of the preliminary hatch) and otherwise in a right gutter on wide charts (phones keep the legend for the thin bands), with estimated small-scale solar as a separate line panel from 2014, never spliced; IRA and 2025-law flags), `LngCard` (small; 2024 pause and 2025 reversal flags). Shared chart shell `energy/EnergyChart` (one or two panels on one axis: recessions, year axis, president band, flags, hatch, peak/low labels, crosshair; geometry in `lib/energy-chart.ts`), card chrome and tables in `energy/shared.tsx`. Preliminary observations (the `status` field) are a diagonal-hatch band across the plot, named "preliminary, may be revised" in the tooltip; flags with `lagged_effect: true` carry the "enabled, not caused" note. Plain open Source line (`EIA_ATTRIBUTION`), one Data notes per chart. Not on the page (no Congress-control rows; Paris, Keystone and general executive-order markers have no series and sit on no card). Payload codec/shape `lib/energy-types.ts`; windowing, `other`, status boundaries, date lookups and flag mapping `lib/energy-derive.ts` (unit-tested over the real files); reader `lib/energy-data.ts` (`server-only`, Zod at the boundary, Economy's `getEraLayers`). Components in `components/energy/`. |
| `/presidency/immigration`                           | static | `ImmigrationPageClient` — "How Many People Does ICE Remove?": pinned `ImmigrationFilterBar` (one two-handle fiscal-year slider with the presidential-term band under it, no President dropdown), then `RemovalsCard`: ICE removals by fiscal year FY2003–FY2025 (`RemovalsChart`), numbered definition-change markers, a `BarCard` per year, legend, chart footnote, `<details>` table. State is the fiscal-year window `range` (filters the timeline) plus one selected `fy` (follows the slider's last year; marked on the timeline, picks the country list's year; clicking a bar also sets it). `getImmigrationPageData()` in `lib/immigration-data.ts`. Below the timeline, `RemovalsCountryCard` ("Who gets removed", see the Immigration section). |
| `/presidency/foreign-aid`                           | static | `ForeignAidPageClient` — "Where Does U.S. Foreign Aid Go?": pinned `ForeignAidFilterBar` (Country via the trade `CountryCombobox`, Sector, and the two-handle fiscal-year slider with the presidential-term band under it, no President dropdown; the selected year is a separate value, default = latest complete year, set by a bar click or the `YearPicker` in the map card, but it jumps to the window's last year whenever the slider moves (same on troops, immigration and the trade partners card), which also plays through the window), then four cards on one `AidState` (`ForeignAidState.tsx`: year, window `range`, country, sector): `SpendingCard`/`SpendingChart` (stacked bars by sector FY2001-, six color slots, term band, hatched partial year, click/drag/arrow keys set the year), `MapAndRanked` = one card, `MapCard` (choropleth on fixed absolute bins, markers for small recipients, "Not on the map" note) with `RankedList` beside it (every recipient via `charts/StackedRows`); one `ReversibleSortToggle` (Dollars / Military share) sets the map's measure and the list's ranking, and clicking the active button reverses the list only, then `FirstPlaceCard` (No. 1 recipient per year as run-length spans + sector-mix bars). Each card has a `<details>` table view. Data: `lib/foreign-aid-data.ts` (`getAidPayload`, `getWorldMap`; Zod at the boundary) -> pure `lib/foreign-aid-derive.ts` + `lib/foreign-aid-map.ts` (all unit-tested), dense exact-dollar payload (`lib/foreign-aid-types.ts`, 574 KB / 199 KB gzipped, inline). Components in `components/foreign-aid/`. Browser check: `pnpm check:foreign-aid`. Methodology: `docs/FOREIGN_AID_METHODOLOGY.md`; pre-flight inventory: `docs/FOREIGN_AID_PREFLIGHT.md`. |
| `/presidency/national-security`                     | static | `TroopsPageClient` — "Where Are U.S. Troops Stationed Abroad?": pinned `TroopsFilterBar` (Country, Branch, two-handle years-shown slider with a presidential-term band under it), then `TroopsChartCard` (stacked bars by region, one per year 1953-2026, tap-to-pin markers) and `MapCard` (choropleth + ranked hosts by branch, with an optional "Known installations (source through 2018)" layer, off by default). See "National security page". Data: `getTroopsPayload()` in `lib/troops-data.ts`, `getBasesPayload()` in `lib/bases-data.ts`. |
| `/data/decisions/cases`                             | static JSON | every argued case as compact arrays (`DecisionCase`), newest first, ~8,251 rows; fetched once by the Decisions case list |
| `/data/trade/countries/[country_code]`              | static JSON | one country's monthly goods trade + calculated duties, all years (241 files, largest ~15 KB, ~7.5 KB gzipped); fetched when a country is selected |
| `/data/trade/years/[year]`                          | static JSON | every partner's annual goods trade + duties for one year (1991-, ~12 KB); fetched by the year slider |
| `/sitemap.xml`, `/robots.txt`, `/opengraph-image`   | static | — |

`next.config.ts` `redirects()` (all 308): `/wealth` → `/congress/wealth`; `/executive-orders` → `/presidency/executive-orders`; `/congress`, `/supreme-court`, `/presidency` → their default section (generated by `verticalRedirects()` in `lib/verticals.ts`, live verticals only); and, for each explorer query param (`chamber`, `state`, `show`), `/?<param>` → `/congress/ideology` (query carried through). Bare `/` serves the hub. The `#delegation` hash can't be redirected server-side.

Each `*/[.../name_slug]` route also has `opengraph-image.tsx` (rendered on
demand) and `not-found.tsx`. Routes that read `pipeline/output/*.json` via `fs`
are listed in `next.config.ts` `outputFileTracingIncludes` (keyed by route; the static pages `/`, `/congress`, `/congress/wealth` read the JSON at build time and need no entry).

---

## Shared chart components (`components/`)

Low-level primitives → chart bodies → typed wrappers. A change to a body applies
to members and committees at once — there is no forked chart code.

| Layer            | Component                          | Notes |
| ---------------- | --------------------------------- | ----- |
| primitive        | `charts/ChartFrame`, `charts/Axis`, `charts/Tooltip` | responsive SVG frame, ticks/gridlines, pointer-following tooltip (`useTooltip` is generic) |
| body             | `charts/ScatterPlot`              | the 2-D compass: draw order, hover, click-to-navigate, focus fade, domain-positioned labels, optional faint backdrop. Accessors + `renderTooltip` in, no entity knowledge. |
| body             | `charts/SwarmRows`                | the 1-D row list: label gutter (clamped to width), min→max connector, endpoint emphasis, right-hand meta, per-row and per-point click Optional `ticks` / `formatTick` / `makeScale` (any continuous scale, e.g. symlog) and a per-point `hollow` flag; defaults keep the [-1, 1] behaviour. |
| member wrapper   | `senate/CompassChart`            | `ScatterPlot` + member accessors (`partyFillClass`, `MemberTooltip`, `memberPath`/`hasProfilePage`) |
| member wrapper   | `senate/DelegationChart`         | `SwarmRows` + state grouping (`buildDelegations`), pair (dumbbell) and range modes |
| identity header  | `profile/ProfileHeader` vs. `committee/CommitteeHeader` | Same structural pattern (eyebrow, serif name, meta line, sub-line) — **deliberately not** a shared component. `ProfileHeader` keeps a `w-[84px]`/`w-28` photo slot (`w-24`/`w-28` when a Wikipedia bio is present; see below) (a real, systematically available per-member asset); `CommitteeHeader` has **no photo/seal placeholder at all** (a monogram was tried and dropped — pure decoration, no informational content, unlike the member photo) and reclaims that width, so its header isn't capped at `ProfileHeader`'s photo-driven `max-w-[52rem]` — it runs out to the page's own `max-w-[1180px]` instead. |
| committee wrapper| `committee/CommitteeCompass`     | `ScatterPlot` + committee accessors (dot colour read straight off `CommitteeSummary.compassColorClass`, joint→neutral, `CommitteeDotTooltip`, `committeePath`) |
| committee wrapper| `committee/CommitteeSwarm`       | `SwarmRows` + one row per committee, party-split meta, chamber-disambiguated labels |
| control           | `charts/SortToggle`               | Shared "Widest spread / A–Z / Ideology" pill group behind both "How each state votes" and "How each committee votes" (`SenateExplorer`). "Ideology" is reversible (click again to flip direction) instead of pick-one-of-N; `DelegationChart` and `CommitteeSwarm` both take a `SortState` and sort their own row-level mean-dim1 field on it. Also exports `ReversibleSortToggle<K>`: every button reverses on a second click, with a ▾ on the active one (used by the trade partners chart and the foreign-aid ranked list; options may be `disabled`, with `hint` saying why; the original toggle is unchanged). |
| body             | `charts/StackedRows`              | Ranked list, each row a stacked bar on one shared scale (rank, label, segments, total, delta). HTML, container-query layout (bar drops to a second line under 400px). The composition sibling of `SwarmRows`, which cannot draw segments. Used by `foreign-aid/RankedCard`. |
| control           | `charts/RangeReset`               | "Reset" link beside a `RangeSelector`: shown only while the year window is narrowed, puts it back to the full range. On all three Presidency pages' pinned bars. |
| control           | `charts/PillGroup`                | Generic controlled pick-one pill group in the same chrome as `ChamberSwitch`/`SortToggle`. Used by the Court explorer for "Appointed by" and the president sort. |
| body             | `charts/StackedBars`              | (Also used by the demographics women and tenure charts; props added for them: `denom` on a column (a share of something other than the stack total), `fitShare`, `markShare`, `selectedStyle="line"`, `terms` (a `TermBandSvg` strip instead of `bands`), `unit`, `activeKey` / `onActive` (a column hovered in a linked chart draws a faint dashed line; the mouse hover is reported out), `yearTicks` (round years every 1/2/5/10/20, rule 10h; used by the decisions cards); `fmtShare` and `yearLabelEvery` are in `lib/chart-bars.ts`; the defaults leave the executive-orders chart unchanged.) Stacked columns over a categorical axis: count or share-of-column, fixed series order (fill follows series, never rank), spans under the axis (`StackBand`, here presidential terms), highlight-one-series dimming, click/keyboard column selection, `useTooltip`. `ChartFrame` + `Axis` + `Tooltip`; D3 scales only. No entity knowledge — `executive-orders/ExecutiveOrdersPageClient` supplies columns, series and the tooltip. Series fills are solid colour tokens. |
| control           | `charts/RangeSelector`            | Two-handle "Years shown" slider for a pinned filter bar — the dual-handle sibling of the Congress/Court term sliders (native range inputs, `.range-dual` in `globals.css`; flexible track + mono readout; no title on the readout: phones stack the two years with a short dash between them to the left of the track and put Reset to its right once the window is narrowed; from `sm` the readout is one line ("1991–2026") right of the track with Reset under it). Controlled and unit-free. **Every time-axis chart page in the Presidency vertical, live or future, must put one in its pinned bar (never per chart; where a page also has one selected year, that year is a separate value set by a bar click or a `charts/YearPicker` in the card that uses it), so a phone user can zoom to the years they care about.** Contract: the page owns one `YearRange` window (`lib/year-range.ts`; null = all) and every chart draws only it — x-scale, clipped marks, adaptive tick density, annotations and president bands follow the window, never the full span. The President dropdown is a second view of the same window, not separate state: choosing a president sets the window to `termYearRange(...)`, and the dropdown reads it back (exact match = that president, otherwise "Custom years"). There is no highlight-a-term mode; clicking a president band on the economy charts sets the window too. `StackedBars` windows by receiving a pre-sliced `columns` array (term bands recomputed from the slice; label spacing adapts to column width). Economy: the window lives in `EconomyState` (`range`), `EconomyChart` takes `view` in axis days, `dayFromFraction` takes the window start. |
| shell             | `charts/ChartCard`                | The explorer card chrome (serif title, optional action on the title row, lede, body; `tight` halves the lede-to-body gap, used by the Decisions cards, whose `StackedBars` also take `marginTop`) extracted from `SenateExplorer` and shared with `CourtExplorer`. |
| primitive        | `charts/AlignmentTrack`           | Small inline two-dot [-1, 1] comparison (a member's own position vs. a reference point) — plain divs, not an SVG `ChartFrame` body, since it's one comparison per profile-card row rather than a shared-axis multi-row chart. Introduced for `profile/CommitteeMembershipsCard`; reusable anywhere a single "this thing vs. that thing" ideology comparison is needed. |

`components/senate/BeeswarmChart` (d3-force collision layout) is still its own
chart — the profile-page single-state delegation and, potentially, a future
committee roster swarm. Not yet folded into a primitive.

### Wealth track (`components/wealth/`, `/congress/wealth` + profile pages)

Built on the same `charts/ChartFrame` + `charts/Axis` + `charts/Tooltip`
primitives as the ideology charts — no parallel chart stack.

| Component | Notes |
| --------- | ----- |
| `wealth/NetWorthScatterCard` | "Where they started, where they are now" — first vs. latest net worth on a square, shared `asinh` signed-log domain that runs out to the cohort's largest net worth (`scatterCap` in `lib/wealth-scatter.ts`: a round step from $20M up to $5B, so the top movers are plotted where they are, never pinned to an edge; the chart is recomputed when the chamber filter changes the cohort), no-change diagonal, click-to-pin dots whose card links to the profile (`memberPath`), select-in-place member search, labels for the richest and poorest member (by latest net worth; phones show only these two) plus, on wider screens, the three biggest dollar gainers and losers, all re-picked from the chamber's cohort or, with a state highlighted, from that state's members, `<details>` table fallback |
| `wealth/WealthListsSection`, `wealth/WealthList`, `wealth/Sparkline` | Highest/lowest net worth lists, each row's own min/max-scaled sparkline over the shared 2013–2025 axis |
| `wealth/WealthFilterBar` | Chamber switch (`components/ChamberSwitch`) + state dropdown (`components/senate/StateFilter`) — the same controls the homepage explorer uses, wired to page-level state instead of URL params |
| `profile/MemberWealthSection` | The profile page's full-width "Net worth over time" card (sibling to `MemberIdeologySection`/`CommitteeMembershipsCard` in `MemberProfileView`) — absent (not an empty state) for a member with zero `financial_disclosures.json` rows |
| `wealth/MemberNetWorthChart` | One member's midpoint line + range band, one point per covered year. No existing click-to-select-driving-a-dropdown pattern existed before this — built from scratch, modeled on `senate/SenatorTrajectoryChart`'s zoom-to-data y-domain. Gaps break the band and bridge the midpoint line with a dashed segment (restricted to gaps *between* the member's own first/last data year — labeling every pre-entry year up to the 2013 floor was tried and reverted, it buried the axis). Open-ended bands get one chart-wide top gradient fade rather than a precise per-point effect (documented trade-off in the component). |
| `wealth/MemberWealthItemsPanel` | The chart's year-linked assets/liabilities list — year dropdown (years with a reconciled `line-items` row only), sticky section headers, falls back to the band-count total (no fabricated items) for a year Session 5 didn't reconcile |

`WealthMemberTooltip` (hover-card content, scatter + hover-linked from search)
and `wealth-copy.ts`/`wealth-scatter.ts` (pure transform/standout-picking
helpers, unit-tested) round out the scatter's own supporting files.

### Wikipedia bio in the member header (`components/profile/ProfileHeader.tsx`)

`MemberProfileView` passes `bio` (`getMemberWikipediaBio()` from
`lib/wikipedia-bio.ts`, `WikipediaBio` in `lib/wikipedia-types.ts`) to
`ProfileHeader`. With a bio, at `lg`+ the header is one top-aligned row: photo,
a fixed `380px` details column, then the bio column (`flex-1`, `--line` left
border) — `relative` with an `absolute inset-0 overflow-hidden` inner column so
it adds **no height**; the header height is still set by the photo / details.
Below `lg` the bio stacks under the photo + details row behind a top rule, with
no line clamp. Body text is clamped to **4 lines** at `lg`: the 5-line clamp in
the design spec does not fit — the shortest real header is 137px (photo-driven)
and label + 5 lines + attribution needs ~154px. Members with no record render
the header exactly as before (same markup, `max-w-[52rem]`); the 16 members of
the 119th Congress who already left office aren't in `legislators-current.yaml`,
so they (and `James Gallagher`, no `id.wikipedia`) have no bio.

The data file is refreshed weekly by `.github/workflows/wikipedia-freshness.yml`
(fetch → diff → PR on a meaningful diff, auto-merged only after the CI gate passes); CI does **not**
re-fetch, it only Zod-validates the committed file (`pnpm validate`).

### Committee page shell (`components/committee/`)

`CommitteeProfileView` → `CommitteeHeader` (no photo/seal — see the identity
header row in the table above; control + compact `14R·9D` split, shared with
`CommitteeSwarm`'s `partySplit`; Chair / Ranking Member from the real
`title` field, never inferred from roster order) + `CommitteeCompassCard`
(compass fed committees, "All committees" / "Nearest neighbors" toggle,
`CommitteeNeighborChips` in neighbour mode) + `CommitteeRosterCard`
(single-row swarm + scrollable roster list, no
trajectory chart).

### Justice profile pages (`components/court/`, `lib/justice-*.ts`)

Data: `lib/justice-derive.ts` (pure, unit-tested over the real data: career average, peers clipped to shared terms, four nearest by career average via `lib/neighbors.ts` with a constant `dim2`, one interval-aware score domain shared by every page, served/confirmed/elevated lines) → `lib/justice-data.ts` (`getJusticeProfile`, `getJusticeRefs`; server-only) → the flat `JusticeProfile` in `lib/justice-types.ts`. `lib/justice-url.ts` builds paths.

| Component | Notes / why not an existing one |
| --- | --- |
| `JusticeProfileView` | client shell holding the toggle; `md:items-stretch` grid. The RIGHT card has fixed content height (same swarm height both modes, four-row roster viewport) and sets the row; the LEFT chart sits in a `flex-1` box and is filled via `useElementSize`, so it never drives the height. Verified by `pnpm check:justice-layout` (Playwright, 1280/1024/768/390). |
| `JusticeHeader` | sibling of `ProfileHeader` (justice facts differ); same absolute-inset clamped bio column; drops the portrait slot when no public-domain photo. |
| `JusticeOverTimeChart` | line + band + clipped peers + dashed median on `ChartFrame`/`Axis`/`Tooltip`; new because `MemberNetWorthChart`/`SenatorTrajectoryChart` are single-series with per-member domains. |
| `JusticeSwarm` + `lib/justice-swarm-layout.ts` | `senate/BeeswarmChart` is typed to `ChamberMember`, fixed to [-1, 1] and its d3-force layout only approximates x; this reuses `court-strip-layout`'s exact-x `dodgeOffsets` (extracted and exported) and packs labels into rows reserved for the worse of the two modes. |
| `JusticeRosterCard` | toggle (`charts/PillGroup`), swarm, roster; mobile cap-plus-expander like `MemberWealthItemsPanel`. |
| `charts/AlignmentTrack` (extended) | optional `domain`, hollow `ring` point, `connect`, `zeroTick`; committee usage unchanged. |
| `AboutScoresCard` | the one shared copy of the score note. |

### Verticals → sections nav and header back-link (`lib/verticals.ts`, `components/SiteHeader.tsx`, `components/SiteNav.tsx`, `components/BackLinkContext.tsx`)

`lib/verticals.ts` is the single source of truth for the site structure: `branches: Branch[]` — `{ id, label, href, status, defaultSection, sections: { id, label, href, status, blurb? }[], owns(pathname) }`. Sections live at `/<vertical>/<section>`; a vertical is `live` iff its default section is. Congress: Ideology, Demographics, Wealth (default Ideology); Supreme Court: Ideology, Decisions (default Ideology); Presidency: Executive orders (default), Economy, Energy, Immigration, Trade, Foreign aid, National security (home front first, then the U.S. and the world). Nav, sub-nav, hub cards, `verticalRedirects()` (feeds `next.config.ts`), `liveSections()` (feeds `sitemap.ts`) and `activeBranch`/`activeSection`/`sectionRow` all derive from it; `lib/verticals.test.ts` checks consistency (default sections, live sections have an `app/` route, soon sections have none). Flipping a section `soon` → `live` plus adding its `page.tsx` is the whole change. `soon` sections are disabled (non-link, "soon" tag) in nav and hub, absent from the sitemap, and 404.

The header is **one row at `md`+ (≥768px)**: wordmark, `SiteNav` (vertical tabs; current one gets an accent bottom border; `soon` verticals disabled; profile pages count toward their vertical), then `SiteSectionNav` (divider + `<nav aria-label="<Vertical> views">` pills of the active vertical's sections, shown for every live vertical even with one section; on entity profile pages no pill is active; none on the hub). Below `md` it wraps to two slim rows: 48px wordmark + vertical tabs, then a 48px strip with the pills as a single horizontally scrolling row. The header is **not** sticky, so the explorer/wealth/court toolbars pin at `top-0 z-40` and need no offset.

The wordmark is a plain link to `/` (no arrow) on `/` and every live section page; everywhere else it is `← InsideGov` going to whatever the page registered via `SetBackLink` (falls back to `/`). `BackLinkProvider` (wraps the body in `layout.tsx`) plus a page-level `<SetBackLink href={...} />` (used by `MemberProfileView` and `CommitteeProfileView`, pointing at `/congress/ideology?…`) bridge the header/page gap. Always a fixed href, never `history.back()`.

---

### Page-level layout rules (every page and mock)

1. Intro paragraph and footnotes span the full content width (`max-w-[1180px]` container); no `max-w`/ch caps (`PageHeader` has none on purpose).
2. Top-level nav order is Presidency, Congress, Supreme Court; the active vertical keeps its underline. Sub-page links (Executive orders / Economy / Energy / Immigration / Trade / Foreign aid / National security) are a separate row.
3. The pinned filter bar sits directly below the site navigation and above the page title and intro, on desktop and mobile.
4. **A filter on a time series filters; it never just highlights.** Any control that selects a subset of a time series (chamber, state, party, president) narrows the chart to the selection and re-lays-out what remains, rather than keeping the full set on screen and dimming the rest. Selecting a president on the Immigration page shows only that administration's fiscal years. **Scatters and other comparison charts (partner rows, before/after rows, dot plots) are the other case:** a selected item is highlighted with the rest dimmed, never reduced to a single dot or row. Search boxes highlight a single member without removing anything (main page compass). (The Economy and Trade pages' year window is the same rule: it narrows what is drawn.) **Foreign aid exercises both halves:** the years-shown window (slider and term band) narrows the spending chart and the No. 1 strip and clamps the selected year; Country shows its own dollars on the time series but only highlights-and-dims on the map, the ranked list and the No. 1 strip (the list always keeps all recipients).
5. **Pinned filter bars are as short as possible.** Group controls on one line rather than stacking them. Desktop: every control, including the year slider, on a single row, with selects sized to their content (President ~10.5rem, Country ~9rem, Sector ~10rem) and the slider taking the remaining width at the far right. Phones: two controls per row (a select at half width beside another select, or beside the slider); a full-width control only when it truly needs the room. Adding a filter means making the others narrower first, not adding a row. Reference: `foreign-aid/ForeignAidFilterBar` (Country + Sector on one phone row, slider and term band on the next); `immigration/ImmigrationFilterBar` is the slider-only case.
5b. **The president filter is the term band under the year slider, not a dropdown.** Economy, Trade, Energy, Executive orders, Immigration, National security and Foreign aid use (and the Supreme Court Decisions page, whose band is by Chief Justice, tinted by the appointing president's party) `charts/RangeSelector` (two handles) with `charts/TermBand` in its `below` slot, and `action` (Reset, only once the window is narrowed) under the years readout. Terms add up (see "National security page" for the exact tap rules). The one slider is the window; a separate single selected year, where a page has one, is set by clicking a bar or by a `charts/YearPicker` in the card that uses it.
5a. **A filter alone on its phone row has its label beside it, not above it.** When a row of the pinned bar holds two controls (Country + Branch, as on the national security page), each label stacks above its control so both fit. When a control is the only one on its row (a lone Topic, Country or President-style select on Executive orders, Economy, Trade), put the label inline to its left, left-aligned (`flex-row items-center gap-2`, the control taking the remaining width), instead of stacking it: it saves a line of height and the label stays readable. Desktop is unchanged (label inline, or dropped below `lg` where the bar is tight). Applied on Trade (Country) and Executive orders (Topic).
6. **Numbered labels on a chart tap-to-pin.** Any numbered marker placed *on the chart's own axis* (definition-change notes, tariff event flags) opens its note on tap/click and keeps it open until the next tap elsewhere, Esc, or scroll; hover (mouse only) previews it. Tapping a different number switches; tapping the same one closes. The note carries the full text, so there is **no numbered key printed under the chart**. References: `immigration/RemovalsChart` (`data-ice-hit`), `trade/TradeTariffChart` (`data-flag-hit`). Numbered markers are for annotations tied to a position on the chart; explanatory text that is not (what a count means, coverage, definitions) is never a marker: it goes in that chart's Data notes (rule 7), as in `immigration/RemovalsCountryCard`.
6a. **Tapping a bar keeps its tooltip open (every per-year bar chart).** On a phone a tap opens the bar's tooltip and **it stays open after the finger lifts**; it closes on a tap outside the chart, Esc, a page scroll, or a second tap on the same bar. Tapping a different bar moves it, and dragging across bars scrubs it. A mouse is unchanged (follows the pointer, closes on leave). Don't rely on hover or a long press for touch. Implementation: `useStickyTooltip` in `charts/Tooltip` (a browser fires `pointerleave` right after `pointerup`, which used to hide a plain `useTooltip` at once; the hook ignores leave for touch and pen), plus `data-sticky-tip` on the chart wrapper so a tap inside it is not an "outside" tap. Wire `down` / `moved` / `up` for the tap-the-same-bar close. References: `charts/StackedBars` (executive orders), `foreign-aid/SpendingChart`, `troops/TroopsChart`; `immigration/RemovalsChart` does the same with its own pinned card (`data-ice-hit`). **Any new bar chart uses `useStickyTooltip`**; scatters keep rule 10e's pinned card.
7. **Chart explanations live under "Data notes".** Footnote-style text under a chart (sources, "terms/band under the axis", "Not on the map", methodology) goes in `components/MethodologyNote` (label "Data notes": open on desktop, collapsed on phones), never as loose paragraphs. Legends stay visible; only explanatory prose collapses. Used under every chart card, including executive orders and foreign aid. **Source notes are different:** the page-level "Source: …" paragraph at the bottom of a page is plain, always-visible text (`m-0 text-[0.8rem] leading-[1.6] text-ink-muted`), never collapsible. All methodology prose for a chart (including what used to sit in a page footer) is folded into that chart's one "Data notes", so a page has one Data notes per chart and one open Source line, not both at the bottom. **Page-level reading guidance is "How to read this", and it is separate from the Source line.** Caveats about the whole page's numbers (what the bands mean, revisions, estimate ranges) go in `components/HowToRead` (collapsed by default at every width, placed inside `PageHeader` right after the intro). The Source line(s) (and any required attribution, e.g. the FRED notice) are plain open paragraphs at the bottom of the page, with no card and no heading ("About these numbers" is not a pattern). No `max-w`, no border or `footer` chrome, `text-ink-muted` (not `ink-faint`) on every page, Court and Congress included. Per-chart notes (the grey text under a chart, e.g. the Martin–Quinn scale note on the Court cards) are Data notes too, never loose grey paragraphs. References: `economy/EconomyPageClient`, `wealth/WealthPageClient`. **Long lists scroll inside a fixed-height box** (rule 11a), at every width (exception: a short list that is fully legible, such as the 15 issue-area rows on the Decisions page, scrolls only on phones and shows in full from `lg`, because a box that hides one or two rows is worse than none): the executive-order list is a `max-h-[32rem]` box with `overscroll-contain touch-scroll`, not a "show more" button and not an auto-expanding list. **Gotcha:** any scroll box that contains `sr-only` text (it is `position:absolute`) must itself be `relative`, otherwise those spans escape the box, stay positioned against the page, and stretch the document to thousands of pixels: the "infinite scroll" bug seen on the executive-order list.
8. **Colour: solid colours only.** Categorical series are one solid colour each (`--topic-<topic>`, `--sector-*`, `--fuel-*`, party tokens). The seven `--fuel-*` electricity colours are validated pairwise (`validate_palette.js`); the oil card reuses five `--sector-*` tokens for its five lines. No hatch or dot patterns to tell series apart (they read as noise on phones); the one exception is the diagonal hatch that marks a *partial year*, which is a status, not a series. Colour is never the only cue: name the series in the legend and tooltip.
9. **Maps and large 2-D charts zoom and pan.** Use `charts/use-zoom-pan` + `charts/ZoomControls` (+/−/reset corner buttons, double-click, pinch, Ctrl/⌘ + wheel, drag to pan; plain wheel still scrolls the page; touch drag pans only once zoomed, so the page still scrolls at full view). For an SVG map the hook runs on a normalized `[-1, 1]` domain (`extent: 1`) and drives the `viewBox`; borders use `vectorEffect: non-scaling-stroke` and point markers shrink with zoom so they stay legible. Reference: `foreign-aid/MapCard`, scatters in `trade/TradeScatterCard`.
9a. **Choropleths name their top three.** Every map (`trade/TradeMap`, `foreign-aid/MapCard`, `immigration/RemovalsMap`) draws a dot, a short leader line and a "Name value" label for the three leading countries on the measure shown (`charts/MapCallouts`): constant 11px text at any zoom, placed in screen pixels so a label that would hit another or leave the visible map tries another offset and is dropped only if none fit, none for a country outside the zoomed window. Three, not five: more reads as clutter. Anchors are the middle of each outline's largest piece.
10. **Labels never vanish.** If a label doesn't fit horizontally, shorten it (code), shrink it, or rotate it; a blank box is a bug. Phones may use taller spans to fit rotated names. **Run/span labels (the "Who's been No. 1" / "Who's hosted the most" cards) try the full name across the span, then the code, then slant the name (or the code, if the name is long) up and to the right at any width, never leaving the span unlabelled; the label band grows to 46px only when a slanted label is present.** Term-band president labels fall back to a four-letter abbreviation ("Eise.") instead of disappearing. Reference: `foreign-aid/FirstPlaceCard`, `troops/TroopsFirstPlaceCard` (`labelFor`), `troops/TroopsChart` (term band).
10a. **Y-axis labels sit in a gutter to the left of the plot, never inside it.** Left-axis tick labels are right-aligned at `x = -6` from the plot's left edge and centred on their gridline (`charts/Axis` does this for every `Axis`-based chart; the hand-drawn Economy/Trade/Tariff charts do the same), so bars, lines and dots never run under a label and the bars get clean room. Every chart sets its left margin from `lib/chart-bars`: `yGutter(labels)` (widest label x 6.7px + 10) when its ticks are known up front (foreign aid, troops, Economy, Trade balance/tariff), else the fixed `Y_GUTTER` (five characters: `−0.5`, `$30B`, `100%`); charts with a rotated y caption add 14-22px for it (`Y_GUTTER + 20`). Do not draw tick labels inside the plot again (this replaces the old inside-the-plot rule and its `yLabelInset` workaround, now deleted). Rotated y captions need ~20px beyond the gutter; StackedBars prints its y label horizontally above the plot.
10c. **Every term band shortens its labels the same way.** `lib/term-label.ts` (`fitTermLabel`, `termLabelCandidates`): last name, four letters ("Obam."), initials ("BO"), last initial, never dropped. Only the two Bushes carry an ordinal ("Bush 41"), and only where room allows; nobody else does. Slider band, `TermBandSvg`, Economy, Trade, Immigration, Troops and Foreign aid all use it; new bands must too.
10b. **Presidential-term bands look like the foreign-aid one.** Every band that marks administrations under a chart (foreign aid `SpendingChart`, executive orders via `charts/StackedBars` `bands`, Economy `EconomyChart`, Trade `EraLayers`, immigration `RemovalsChart`) is a light tint of the party colour (`color-mix(in oklab, var(--rep|--dem) 20%, var(--surface))`, `rx` 2), a solid 2.5px party-colour rule along its top edge, and a regular-weight `var(--ink)` label. Not a solid party-colour block with white text. The House/Senate majority rows on Economy and Trade are a different layer and keep solid fills. **Any new chart with presidential terms under it must use this style**; there is no other.
10k. **Chart captions pick the wording that fits.** A caption above a panel (the energy cards' second-panel captions, units lines) is given as a list, longest wording first, and the chart draws the first one that fits the plot width (6px a character), so a phone gets "Net imports, million b/d" rather than a cut-off sentence (rule 10). The long explanation moves to the card's Data notes. Reference: `energy/EnergyChart` (`Panel.caption`).
10l. **Preliminary data is a hatched band, named in the tooltip.** Where a series carries a `status`, the stretch that is still preliminary is a diagonal-hatch band across the plot (`ink` lines behind a line chart; `surface` lines drawn over a filled stack, `Panel.hatchOnTop`), a "Preliminary, may be revised" legend item, and the status named in the tooltip and table. It is a status, not a series (rule 8). Reference: `energy/EnergyChart`.
10m. **A flag for a delayed effect says "enabled, not caused."** Any marked action whose effect, if any, arrives years later (`lagged_effect: true`: crude-export repeal, LNG decisions, energy tax credits) carries that sentence in its note, and the page copy says conditions during a presidency are not attributions of cause. Flags name their authority (Executive, Congress, Agency, Court); SPR rows also say what happened to the oil. Flags that merge on a narrow chart list every action they hold. Reference: `energy/EnergyChart` (`FlagNote`), `lib/energy-derive.ts` (`LAGGED_NOTE`).
10j. **Every per-year bar chart carries the presidential-term band under its axis, including the run/span cards.** "Who's been No. 1" (`foreign-aid/FirstPlaceCard`) and "Who's hosted the most" (`troops/TroopsFirstPlaceCard`) draw the band under their year axis with `charts/TermBandSvg` (`termSegments` turns per-slot terms into runs; `TERM_BAND_H` is added to the chart height). Same style as rule 10b, labels centred in the segment and shortened rather than dropped (last name, four letters, initials, last initial; rule 10). **Any new chart with one slot per year and a year axis, in this "span labels over bars" style or any other, must include it**, and a page that filters to a year window must pass the window's terms. `TermBandSvg` is the shared drawing for slot-based SVG charts; the older bands in `foreign-aid/SpendingChart` and `troops/TroopsChart` are still their own copies and should move to it when next touched.
10f. **Stacked bars: segments carry their values when they fit.** `lib/chart-bars.ts` is shared by every stacked-bar chart (`charts/StackedBars`, `troops/TroopsChart`, `foreign-aid/SpendingChart`); its `yGutter` also sizes the y-label gutter (rule 10a). `segmentLabelFits` + `SEGMENT_LABEL_STYLE` print each segment's value inside it only when the segment is at least 15px tall and wide enough for the text, so labels appear as the chart gets wider or the year window narrower.
10d. **Axes fit the data; nothing is pinned to an edge.** Don't cap an axis at an arbitrary round number and draw outliers as clipped markers. The people at the extremes are usually the interesting ones. Size the domain from the data being shown (a round step that holds the largest value, recomputed when a filter changes the set), and keep the middle readable with zoom and ticks instead. Reference: `wealth/NetWorthScatterCard` (`scatterCap`). The trade scatter's pinned triangles are the one remaining exception: its +1,000% cap is stated and its true values are in the tooltip.
10c. **Dropdowns draw their own caret.** `select:not([multiple])` in `app/globals.css` (unlayered, so it beats per-select padding utilities) hides the native caret and paints an inset one (`right 0.55rem`, 1.5rem right padding, colour follows `--ink-muted` in light and dark). Don't add `pr-*`/`appearance` to a select, and size fixed-width ones for the extra padding ("All presidents" needs about 7.75rem).
10e. **Every scatter plot: a dot pins its card; the card is the link or action.** This is the rule for all scatters (the member and committee compasses via `charts/ScatterPlot`, `wealth/NetWorthScatterCard`, `trade/TradeScatterCard`, and any future one). Clicking or tapping a dot never navigates or filters by itself: it pins that dot's tooltip (`usePinnedTooltip` + `<Tooltip onActivate activateHint>` in `charts/Tooltip`, class `.chart-tooltip.is-pinned`, `data-pinned-tooltip`), which takes the pointer and carries its action line ("Open profile →", "Open committee →", "Show in the charts above →"). Clicking the card does the thing. Click the dot again, click elsewhere, or press Esc to unpin. Hover still shows the plain follow-the-pointer tooltip. (Phones on the trade scatter keep their own tap-fills-a-card-below behaviour, which is the same idea.) Don't link or filter from the dot itself.
10g. **Legends are tight: as few lines as possible.** Every legend row uses `charts/legend` (`LEGEND_ROW`: 0.7rem type, `gap-x-2.5 gap-y-1`; `LEGEND_ITEM`: swatch + text, `whitespace-nowrap`, 10px swatch), so a legend fills one line wherever it can and wraps between items, never inside one. Shorten legend text rather than let it wrap (`All other (4 sectors)` is `Other (4 sectors)`, the long region name has a `short` form in `lib/troops-regions.ts` `regionLegendLabel`, the Iraq/Afghanistan entry is "In/around Iraq & Afghanistan (DMDC; not in bars)"). Applied on foreign aid (`SectorLegend`) and the national security page; other pages' legends move to it when next touched.
10h. **Year axes show a few years, not all.** A year axis labels every `n`th year with `n` from `yearLabelEvery(step)` (1, 2, 5, 10 or 20) so labels sit about 46px apart: on a phone a 74-bar chart shows 1960, 1980, 2000, 2020, and a zoomed window shows every year. Never print every year and let the digits overlap. Reference: `troops/TroopsChart`, `troops/TroopsFirstPlaceCard`.
10i. **Charts bleed into the card padding on phones.** The element that `useElementWidth` measures carries `-mx-3 sm:mx-0`, so below `sm` the plot and its y-gutter extend 12px into the card's side padding instead of leaving white space left of the axis labels. Any new chart inside a padded card does the same. Reference: `troops/TroopsChart`.
11a. **Long row charts (swarm/dumbbell/range lists) never auto-expand on phones.** Below `md` they sit in a fixed-height box sized by **height, not row count**: about 22rem for slim rows (~26px, about 12 rows), about 28rem for chunky rows (~45px, about 10 rows, e.g. the foreign-aid ranked list). Keep it under about two-thirds of a phone screen so the page still scrolls past it. It is `overflow-y-auto` with `overflow-y-auto overscroll-contain touch-scroll`, so a finger drag scrolls the rows inside the card and the page scrolls past it (`.touch-scroll .chart-svg` sets `touch-action: pan-y`). Desktop fills the row height the neighbouring card sets. Give the box `tabIndex={0}` and an `aria-label`. References: `senate/SenateExplorer` ("How each state votes"), `trade/TradePartnersCard`.
11. **Scrollable nav rows signal overflow.** A horizontally scrolling row (the section pills under the site header, on phones and on desktop, where Presidency's seven pills don't fit beside the vertical tabs) shows a raised "+N ›" button over a right-edge fade while pills are cut off (N = how many; clicking scrolls the row), a "‹" button on the left once scrolled, and scrolls the active item into view on load. No peek-through or load-time nudge. Reference: `SiteNav` `ScrollRow`.
12b. **On multi-line charts the legend entries are buttons.** Clicking one keeps only that line (others, their labels and tooltip rows go; energy cards also re-fit the y-scale), clicking it again restores all. `components/charts/LegendToggle` (`LegendToggle`, `useIsolate`); used by the Energy supply/demand and oil-flows cards, Economy gas/debt, the tariff chart and the Senate party-trend and senator-trajectory charts.
12c. **Stacked charts isolate a series from their legend.** Clicking a legend entry (`charts/LegendToggle`) draws only that series, from zero, on its own rescaled axis, and labels only it; clicking again restores the stack. Where the chart has a share view (electricity, executive orders), picking a series switches to the amount view and switching back to share clears the pick. Used by the electricity card, `charts/StackedBars` (via `highlight`, driven by the topic chips and dropdown), foreign-aid `SpendingCard` and troops `TroopsChartCard` (which zero the other slots before handing rows to the chart), and the bottom charts of both pages (first-place bars rescale to that sector/branch of each year's top country; ranked rows keep their order and rescale to the isolated series). Not offered while a filter has already narrowed the chart to one series.
12a. **Multi-line charts label one example value per line.** Where a chart has two or more lines and so no single peak/low, each line gets a coloured dot and a dark-ink (`fill-ink`, same as peak/low labels, never the line colour) "Mar 2020: 20.4M b/d" label at one point three quarters across the visible window (highest line's label above, others below; fades on hover like rule 12). Shared pieces: `components/charts/ExampleMarks` (`ExampleMarks`, `pickExample`, `aboveFlags`). Used by the Economy gas/debt comparison lines, the tariff chart's all-countries line, the Senate party-mean and senator trajectory charts; the Energy cards use `Panel.examples` in `components/energy/EnergyChart.tsx`.
12b. **The phone pin readout puts its values on one line.** `charts/PinReadout` takes a `PinLine` (`values[]`, `date`, `term`): the values on one bold sans line divided by " · " (tabular figures, no monospace; it wraps only if it has to), then a muted last line with the month (plus "(preliminary)") and the president. Build each value per card, never one joined string; keep units short (`fmtMbdShort`: "7.2M b/d", one decimal).
12. **Time-series line and bar charts label their peak and low.** Every time-series chart (the nine Economy cards, trade balance, tariff rate) marks the highest and lowest point in the *visible window* with a dot and a short "Mar 2020: 14.8%" label on the line: `lib/chart-extremes.ts` (`findExtremes`, pure and tested; a flat series gets none) + `components/charts/ExtremeMarks` (peak above its point, low below, clamped inside the plot, fades to 25% while a date is hovered or pinned so it never fights the crosshair readout). The marks follow the year window and filters. **Labels are always recalculated for what is on screen: when a chart is filtered, its labels are re-picked from the filtered data, never kept from the full set and never switched off.** Stacked-bar charts follow the same idea: `charts/StackedBars` (executive orders) prints the tallest and shortest column's total above its bar ("2025: 238"); with a topic highlighted it re-picks that topic's own peak and smallest non-zero year and prints the count at the top of its segment ("2025: 34"); Share mode with no topic carries none (every bar is 100%). `foreign-aid/SpendingChart` prints "FY2023: $80.5B" over the complete fiscal years of the drawn (already Country/Sector-filtered) totals, skipping the partial year and the selected year (its chip sits above that bar). The trade scatter's name labels (top partners by latest-year total trade, five on desktop, three on phones) come from the whole partner ranking, so a continent filter labels that continent's own biggest partners. Marks fade while a column is hovered or picked. Any new labelled chart does the same. Do **not** also label the latest value (the card header already prints it) and do **not** apply this to the ideology or net-worth trajectories. References: `economy/EconomyChart` (`Marks`), `trade/TradeBalanceChart`, `trade/TradeTariffChart`.
13. **The active section in the sub-nav is an underline, not a filled pill.** The selected sub-section is `text-ink` with a 2px accent underline (`border-b-2 border-accent`), matching the top-level tabs; inactive ones are muted text with a transparent border so nothing shifts. No filled accent boxes in navigation.
14. **Dot-row charts (`charts/SwarmRows`) always show an axis with values, a tight domain, and staggered neighbours.** Every dot row (state delegations, committees, partner dumbbells, Court "Who each president appointed") draws the tick axis and gridlines so a dot can be read without hovering (`showAxis` is on unless there is a stated reason). Fit the domain to the data being plotted (padded), not to a wider shared interval domain, so dots spread out. Keep the label gutter just wide enough for the longest label (the Court rows use 84px for "G.H.W. Bush"). Where dots in one row would still touch, stagger close neighbours up and down with the point's `dy` (alternate ±9px; see `court/PresidentRows`), and give the row a height that fits (about 38px). Phones follow rule 11a (fixed-height scroll box). Reference: `court/PresidentRows`, `senate/DelegationChart`.
15. **"View as table" is the quietest control under a chart.** Every chart's table disclosure is a `<summary className={TABLE_TOGGLE}>` (`components/charts/table-toggle.ts`): 0.75rem, light grey (`text-ink-faint`, one step quieter than the "Data notes" summary beside it), darkening on hover, never accent-coloured or bold. The label is always exactly "View as table" (not "Table view" or "View the data as a table"); put any extra explanation inside the opened panel.
16. **Explorer scatters name one dot per legend category.** The member and committee compasses (`senate/CompassChart`, `committee/CommitteeCompass`, explorer variant, not zoomed-in profile variants) label one dot for each category in the legend so the cloud has a face: members, the party leaders at the latest Congress (House: Speaker + Minority Leader; Senate: Majority + Minority Leader; the Both view shows all four, from `pipeline/output/leadership.json` built by `pipeline/transform/leadership.ts` from congress-legislators' open-ended `leadership_roles`; flagged on `ChamberMember.leaderRole`), falling back to each party's most extreme member for earlier Congresses (no leadership data); committees, one recognizable anchor per chamber (House and Senate Appropriations, Joint Economic, else the largest committee). Pure picker: `pickPerGroup` in `lib/chart-extremes.ts`. Labels use `.dot-label.is-legend-label` (19 SVG units, halo, because the 640-unit SVG shows at about half size). Leader names go outward into open space, edge picks go inward. Cap 3 labels.

### Demographics page (`components/demographics/`, `lib/demographics-*.ts`, `/congress/demographics`)

Data: `legislators.json` + `terms.json` + presidents -> `lib/demographics-data.ts` -> pure `lib/demographics-derive.ts` -> `DemographicsPayload` (`lib/demographics-types.ts`). Decisions (recorded so they aren't re-litigated):

- **Roster = everyone who held a voting seat at any time in the Congress, not who was seated on day one.** The source's term dates are nominal Congress-length ranges for almost everyone before the 1990s (a mid-term replacement and the member they replaced both read the whole Congress), so a first-day roster can't be rebuilt without guessing (`docs/DEMOGRAPHICS_PREFLIGHT.md`). The page says so in its Data notes. Ages are counted on the convening day (`CONVENING` in `lib/demographics-entities.ts`; the day the Congress actually convened, not Jan 3).
- **Slots and window.** One slot per Congress; a Congress is drawn when its convening year is in the years window (`windowRows`). The slider's term segments span the Congresses each president opened (`bandTerms`), so they never overlap. The president for a slot is the one in office on the convening day (14 Congresses differ from "most of the Congress"; listed in the methodology doc). Trump's second term opens no Congress, so it has no segment.
- **Palette.** `--tenure-1..4` (four steps of the accent, lightest = first Congress) are validated in `validate_palette.js` (`TENURE_KEYS`, all pairs forced, >= 3:1 on every surface); they are darker than a pale-to-dark mock would be because the lightest step must clear 3:1 against the card surface in both themes.
- **No legend isolate on the tenure chart** (share only, per the page spec); the women chart isolates and switches to the count view, and switching back to Share clears the pick (rule 12c).
- Out of scope, deliberately not built: race/ethnicity, religion, military service, occupation, education (not in `congress-legislators`), a state filter, ideology cross-over, history before 1933, per-member pages.

### Immigration page (`components/immigration/`, `lib/immigration-*.ts`, `/presidency/immigration`)

Data: `pipeline/output/enforcement_{series,notes,report}.json` → `lib/immigration-data.ts` (server-only; Zod-parses, runs `assertEnforcementInvariants`, so drift fails the build) → `lib/immigration-derive.ts` (pure, unit-tested over the real files: joins rows to presidents via `administrations.json`, notes, and the report's corroboration flags; `ICE_MARKERS`; `yDomainMax`) → `ImmigrationPageData`. Geometry (slot/bar sizing, label density, date → fiscal-year axis position, term segments) is `lib/immigration-chart.ts`.

Decisions (recorded so they aren't re-litigated):

- **One chart: ICE removals by fiscal year, FY2003–FY2025, full width.** A per-administration comparison chart (dot rows with averages) was tried and removed: averages across eras with different counting rules read as a like-for-like comparison they aren't. Don't re-add it or add per-president averages. A second chart needs a second series (ICE arrests or detention population; availability not checked).
- **Bars are colored whole** by `administration_term_id` (the administration in office on Sep 30, asserted equal to the majority-days term). No split bars; the day split (FY2009/2017/2021/2025) appears only on the year's card. The term band breaks on bar edges.
- **The two-handle fiscal-year slider (with the term band, `charts/TermBand`) filters the timeline; the selected year is separate** (rule 4): a click on a bar, or the year menu (`charts/YearPicker`, dropdown + play) in the country card. The selected year is clamped to the window, defaults to the newest year with a country table, and re-picks that when the window moves off it. There is no President dropdown; a term's fiscal years are the ones assigned to it. The y-axis is fixed from the whole series (`ceil(max x 1.08 / 20k) x 20k` = 480k), so bars stay comparable across selections and it moves on its own when FY2026 lands. Value labels on every bar at 8 or fewer bars, otherwise FY2012, FY2021 and FY2025; compact (`410k`) under a 40px slot; slot capped at 80px, bar at 52px, left-aligned.
- **Five numbered markers** (`ICE_MARKERS`) replace any "what changes the count" box: ICE created (Mar 2003), returns counted (FY2007), returns to Border Patrol (Jun 2013), Title 42 (Mar 2020 to May 11, 2023, shaded, start approximate to the month), ICE Air (May 12, 2023). Real `<button>`s: hover/focus opens, Esc closes, tap toggles, tap outside closes. Markers outside the shown years are hidden; the shading is clipped to them.
- **Per-bar card** (hover, keyboard focus or tap) replaces the mock's permanent FY2021 readout strip: value, status, administration (day split when blended), corroboration, source link, and any note not covered by a marker and not the global `oct5-lock-and-lag` note (FY2010, FY2021, FY2025). `<details>` "View as table" is the text alternative.
- FY2003–FY2006 hatched (removals only); FY2025 dashed and lighter (preliminary); FY2026 an empty "not yet locked" slot, shown for "All" and for the newest administration.
- **ICE only.** CBP actions, including Title 42 expulsions, are not in the series; the page says so. The footnote's "22 of 23 final, 10 confirmed by a second source" is computed from the data.
- Credit lives in the page footnote (as on Economy and Trade), not the site footer.
- **"Who gets removed" (`RemovalsCountryCard`)**: ICE removals by country of citizenship for one fiscal year, laid out like trade and foreign aid: a choropleth on the left (`RemovalsMap`: fixed absolute bins, `--accent` shades, defaults to Latin America (Mexico to Tierra del Fuego) with a Latin America / World toggle that sits in the card header beside the year picker and governs the ranked list too (Latin America lists only `LATIN_AMERICA` countries, re-ranked; World lists all), zoom and pan, outlines from `getWorldMap()` passed in by the page) and a ranked list of single-color (`--accent`) bars on the right. Built on the foreign-aid pattern with no fork: `charts/ChartCard` (its `title` now accepts a node, for the marker), `charts/StackedRows` (one segment per row), a plain largest-first list (no sort toggle; the change vs. prior FY shows as a column and in the table). Data: `removals_by_country*.json` → `lib/removals-country-data.ts` (server-only, Zod at the boundary) → `lib/removals-country-derive.ts` (pure, tested over the real files; the change vs. the prior year is computed here, not stored; null for FY2014) → `lib/removals-country-types.ts` (client-safe). Covered years FY2014–FY2024 only (no OHSS backfill). The card header carries only a `charts/YearPicker` (play + year dropdown, like the national-security map card); the selected year is shared with the pinned slider and timeline bars, a year with no country table (FY2025, or FY2003–FY2013) says so in the card, and the President filter **never trims the country list**. Clicking a country highlights it and dims the rest (chip in the header carries its rank). Its definition, citizenship-vs-destination and coverage notes are in the card's Data notes (they were once three numbered markers, removed as inconsistent with rule 7). No criminality segments: no ICE document crosses country with criminality for removals. `<details>` table fallback; list scrolls inside the card (`overscroll-contain touch-scroll`, 27rem).
- **Page-level rule: one agency and one definition per chart, labeled in the subtitle; never sum across agencies.** The country list is ICE-only with ICE's headline definition (returns included from FY2007), so its year totals equal the timeline's. A CBP or OHSS series would be a separate, separately labeled chart.

### National security page (`components/troops/`, `lib/troops-*.ts`, `/presidency/national-security`)

Data: `pipeline/output/troops_location{,_meta,_report}.json` (DMDC location reports, Sep 2008-; see `docs/TROOPS_METHODOLOGY.md`) -> `lib/troops-data.ts` (server-only, Zod-parses via `lib/troops-entities.ts`) -> `lib/troops-derive.ts` (pure, unit-tested over the real files: dense payload, `stackByRegion`, `periodView`, `changeVsPrior`, ticks, map bins) -> `TroopsPayload` (`lib/troops-types.ts`). Regions are the fixed ISO3 map in `lib/troops-regions.ts`.

- **Two cards, no fork of the foreign-aid pattern:** `TroopsChartCard` (stacked bars by region, one per **year** 1953-2026 = that year's Sep 30 table (June 30 for 1953-56), the year in progress hatched as partial, 2006-07 lighter as estimates, `TroopsChart`; president band by the president on the snapshot date (`lib/troops-presidents.ts` adds Eisenhower-Bush 41, plus Truman for the pipeline's unused 1950 snapshot); peak/low labels; tap-to-pin numbered markers (rule 6) for the pre-2008 sources, the 2003-05 Iraq/Afghanistan gap, the 2006-07 estimates and the 2018 break; DMDC's 2003-05 in/around Iraq and Afghanistan totals filling the otherwise-blank Iraq/Afghanistan rows, so they draw and rank like hosts and the bars are DMDC's foreign total plus them, flagged † with a basis caveat) and `MapCard` (choropleth on fixed bins + `RankedList` of hosts with a branch-split bar). Same chrome as foreign aid: `ChartCard`, `MethodologyNote`, `TableView`, zoom/pan, `MapCallouts` top three.
- **Who's hosted the most** (`TroopsFirstPlaceCard`, pure `topHostsByYear`/`topHostRuns` in `lib/troops-derive.ts`): the foreign-aid "Who's been No. 1" card for hosts: run-length spans over per-year bars split by branch, branch filter picks the No. 1 within it, Country highlights, click/drag sets the year; 2006-07 (no branch split) draw grey.
- **Filters** (`TroopsFilterBar`, `TroopsState`): The **years-shown window** is a two-handle `RangeSelector` (+ `RangeReset`) that narrows the top chart and the first-place card; There is **no President dropdown**: the term band under the slider (`charts/TermBand`, via `RangeSelector`'s `below` slot) is the president filter, and terms *add up*: tap an unselected term to add it (any terms between join it, since the window is one continuous run), tap a selected end term to drop it, tap the only selected term to clear; a selected middle term does nothing (dropping it would leave a gap). Press and drag across terms to add the run; Enter/Space toggles. Segments are labelled last name, else four letters, else initials, else the last initial. The readout is just the years with Reset beneath them (shown only once the window is narrowed), in a fixed-width column so the track never shifts. Prototype; not yet rolled out to other pages. The **selected year is a separate, single value** (`yi`), always clamped into the window, set by clicking a bar or by the `YearPicker` (dropdown + play) in the `MapCard` header; it drives the map, list and first-place highlight. No independent per-card year state, and the map never groups several years (headcounts are snapshots, not flows). Country shows that place's own series and highlights-and-dims on the map and list (the list keeps every host); Branch swaps the measure.
- **Never show a misleading change:** no percent change between bars from different sources, across the 2017/2018 break, across a gap year, for the partial year, or for an Army-N/A year (none today: the three Army-N/A quarters are not September tables; the dashed empty column is in the code for when one is); blank starred hosts are listed "n/r", not zero; territories are stated under the map, not drawn or counted.
- **Known installations layer** (`BasesLayer`, `lib/bases-derive.ts`, off by default, toggle in the map card's header): troopdata/Vine's single snapshot "through 2018", no headcounts, so not tied to the year slider and never compared across years. Constant-size dots (rule 9: shrink with the square root of the zoom) that merge **within a country** when they overlap (`clusterSites`, numbered groups) and split on zoom; shapes carry the type as well as the legend (major base = filled circle, small site = ring, host-nation U.S.-funded = diamond), in existing ink tokens, so no new palette entry. A click or tap pins the card (`usePinnedTooltip`, rule 10e) and the card filters the page to the country; the Country filter dims other countries' sites, the Branch filter does not apply (stated in Data notes). Sites flagged `needs_review` are in the table but not drawn. The table view lists every site. Guam, Wake and most small territories have no outline in `world_map.json`, so their dots stand alone.
- No Coast Guard on the page (not a filter, segment or legend). Branch colours are `--branch-*` tokens in `globals.css`; region colours reuse the `--cont-*` tokens.

### Decisions page (`components/decisions/`, `lib/decisions-*.ts`, `/supreme-court/decisions`)

Data: `pipeline/output/decisions_{counts,meta,report}.json` (SCDB case-centered counts; `docs/DECISIONS_METHODOLOGY.md`) -> `lib/decisions-data.ts` (server-only, Zod-parses) -> pure `lib/decisions-derive.ts` (unit-tested over the real files: `buildDecisionsPayload`, window sums, stacks, sort keys, small-sample test, Chief bands) -> `DecisionsPayload` (`lib/decisions-types.ts`: dense `[d0..d4]` per term, 14 areas + an "all" row that includes unclassified cases). Shares are derived here, never stored.

- **One state, `DecisionsState`:** the years window, the issue area (the dropdown and a click on a card 3 row are one value) and the hovered / pinned term. Hover is rAF-throttled. A window or area change narrows cards 1 and 2 (rule 4); card 3 is a comparison chart, so a selected area dims the other rows over the same window.
- **The term band is by Chief Justice** (`chiefBandTerms`, `chiefSegments`): Vinson, Warren, Burger, Rehnquist, Roberts, tinted by the party of the president who appointed each *as Chief* (rule 10b style; Rehnquist is Reagan's). Same tap rules as every slider band; labels via `lib/term-label.ts`. Hover/title names the Chief and the appointing president.
- **Colour:** card 1's seven area series reuse the validated `--fuel-*` tokens (no new tokens). The five dissent bands are `--split-0..4`, five distinct hues (not party colours): light `#312c44 #23318e #41939d #643e03 #a03667`, dark `#9591ad #5cb2fd #6acdc6 #deb34a #ba446e`; `validate_palette.js` (`SPLIT_KEYS`) forces every pair and each against `--dem`/`--rep` (>= dE 0.1, >= 3:1 on every surface). A sequential gradient (teal to deep violet; teal to near-white in dark) was tried in #66 and reverted: the steps were too hard to tell apart. Amber can only be a dark bronze in light mode (lighter collapses onto `--rep` under deutan vision). The heatmap's 5–4 and Unanimous views shade with `--split-4` / `--split-0`.
- **Landmark cases** come from Wikipedia's "List of landmark court decisions in the United States" (`pipeline/raw/wikipedia-landmarks/`, `pnpm fetch:landmarks`, one API request, manual refresh): the transform joins its `{{ussc}}` citations to SCDB by U.S. cite, then docket, then case name plus year (`transform/landmarks.ts`; every name match and every miss is listed in `decisions_report.json`) and gates that every list entry is accounted for and at least 97% of post-SCDB entries join. 339 cases; the case list badges them with the list's heading and links the article. The payload carries the landmark counts beside the full ones (`DecisionsPayload.landmark`, swapped in by `viewOf`); the six biggest areas stay fixed so series and colours do not move.
- **Buckets count dissents, not the tally** (a 5–3 decision lands in "6–3"; stated in Data notes). Term labels are the starting year ("2025" = October 2025 to June 2026).
- **Case summaries** (`decisions_summaries.json`, `CaseListCard`'s `Summary`): the sentence under a case name is Wikipedia's own first ruling sentence from that case's article lead, never written by us. `summarizeLead` takes the first of the lead's first three sentences that states a ruling (held that / ruled / struck down / upheld / ...), cuts the "Name, 558 U.S. 100 (2009), is a case in which" head (a bare verb gets "The Court" put back), and keeps it only as one finished sentence of 40-300 characters; a later sentence must itself open with the Court as subject and may not point back ("such officials"), and an article whose first sentence is not a case head (a redirect into a term list) gets none. About 60% of linked articles pass. For the rest, `pnpm summarize:cases` (`pipeline/classify/case-summaries-auto.ts`, Sonnet by default, `CASE_SUMMARY_MODEL` overrides) asks the model through a `record_summary` tool for `ruling_stated`, a verbatim `evidence` quote and one sentence; `checkAiSummary` keeps the sentence only if the quote is in the lead, names a ruling, and ≥70% of the sentence's words are in the lead. This guard exists because a first trial with Haiku and no guard wrote rulings from memory (for *Alabama v. Bozeman* it stated the opposite of the holding where the lead gives none): never loosen it, and never send a case with no article text. About half of the rest come back with no sentence, and show none. Model-written rows carry an "AI-written" tag (tuple field 12) and the Data notes count them. The weekly workflow runs it for new articles. Phones clamp it to three lines (tap opens), wide rows show it whole, from the name column across. CC BY-SA 4.0, stated in the card's Data notes with the count and date.
- Out of scope, deliberately not built: liberal/conservative direction, per-justice votes, landmark-case curation, our own written case summaries (the sentence above is Wikipedia's), a link from Ideology to Decisions (candidate: click a year to open that term's justice strip), a rolling average for noisy areas.

---

**Drift noticed while building the demographics page.** The session prompt cited `docs/ARCHITECTURE_MAP.md` and `docs/DATA_CONVENTIONS.md`; this file lives at the repo root (`DATA_CONVENTIONS.md` is in `docs/`). `lib/year-range.ts` had no ordinal-aware helper (the page's window is by convening year, in `lib/demographics-chart.ts`). `charts/PinReadout` hard-coded "pin a month"; it now takes a `hint`. Vitest has no `@/` alias, so a `lib/` module under test imports relatives only (`lib/demographics-chart.ts` re-implements the small term-run builder instead of importing it from a component).

## Session 0.2 — the `AGENTS.md` "nextjs-agent-rules" block

`CLAUDE.md` is a single line, `@AGENTS.md`. `AGENTS.md` opens with a
`<!-- BEGIN:nextjs-agent-rules -->` block that tells an agent "This is NOT the
Next.js you know… Read the relevant guide in `node_modules/next/dist/docs/`…
before writing any code" and "committing it with your work keeps the tree
clean."

**This is legitimate Next.js 16 tooling, not an injection.** Verified:

- `git blame AGENTS.md` → the block was added in the initial scaffold commit
  (`1a582fc`, "chore: scaffold Next.js 16 app", authored by the project owner,
  2026-08-31), i.e. by `create-next-app` — not inserted later by a third party.
- `next@16.3.4` ships `node_modules/next/dist/server/lib/generate-agent-files.js`,
  which produces exactly that text (`buildAgentRulesBlock()`) and regenerates it
  on `next dev` if it goes missing. It cross-references
  `packages/create-next-app/helpers/generate-agent-files.ts` and
  `packages/next-codemod/lib/agents-md.ts`.
- `node_modules/next/dist/docs/` is the normal Next.js documentation tree
  (`index.md` is the standard "Welcome to the Next.js documentation").

The wording is heavy-handed (and Vercel shipping auto-generated agent files was
community-controversial), but there is nothing malicious here. The committees
session did **not** treat "read `dist/docs/` before any code" as a hard gate;
those bundled docs are fine to consult as ordinary vendor documentation for
Next 16 specifics. Leave the block in place — deleting it only makes `next dev`
rewrite it.

---

## Divergences: session prompt / mockups vs. the real code

The committees session prompt (`committees-feature-session-prompt.md`) and its
two HTML mockups were written without repo access. Where they differed from what
was actually here, and how it was resolved:

1. **The prompt's cited source docs don't exist.**
   `congress-ideology-requirements.md`, `TECHNICAL-REQUIREMENTS.md`, and
   `ARCHITECTURE_MAP.md` are not in the tree or git history. Anything the prompt
   attributes to them is unverified — in particular the "~320px capped list"
   figure (see #2). This file is the `ARCHITECTURE_MAP.md` the prompt expected,
   created now.

2. **Card-height / whitespace guidance was already superseded.** The prompt
   says "stop trying to match the two cards' heights… cap the tall list at a
   fixed scrollable height (~320px)… no cross-card coupling." But `main` had
   already converged (commits `b40e6a3`, `e32676e`, `9a62f22`) on grid
   `md:items-stretch` + the tall list absolutely positioned inside a `flex-1`
   wrapper so its length never drives the row height — with a 15-line comment
   in `SenateExplorer.tsx` explaining why. **Kept the shipped pattern** and
   extended it to the committees Chart 2. The committee *detail* page uses
   `items-start` + a capped scrollable roster list, matching the member profile
   page's own precedent (`MemberIdeologySection`), not a height-matching
   mechanism.

3. **`CompassChart` couldn't take committees as-is.** It was hard-typed to
   `ChamberMember` (used `bioguideId`, `lastName`, `partyCode`, `isCurrent`,
   `<MemberTooltip>`, `memberPath`). Per the prompt's own "call it out for a
   human decision" tenet, this was flagged; the chosen fix was to **extract the
   pure scatter into `charts/ScatterPlot`** (and the delegation row list into
   `charts/SwarmRows`) and make the member and committee charts thin wrappers.
   `DelegationChart` keeps its full public API and pair/range/`filterState`
   behaviour — verified unchanged in a browser.

4. **Committee identifier.** The prompt wanted the route
   `/congress/committees/[thomas_id]/…` and data keyed by `thomas_id`. The
   existing `lib/types.ts` stub and DATA_CONVENTIONS §1's "not `thomas`, not a
   synthetic slug-as-key" language both point the other way, so the field and
   route param are **`committee_id`** (holding the THOMAS id value, e.g. `HSJU`).

5. **No `--joint` colour token.** The mockups used one; the real palette
   (`lib/party-palette.ts`) has no joint entry and adding a token means
   re-running `validate_palette.js` (CVD/contrast gate). Joint committees use
   the existing neutral `oth` swatch, same as independents.

6. **Latest-Congress gate, not a hardcoded 119.** The prompt says "119th"
   throughout; the code derives the latest Congress from the data
   (`committeesLatestCongress()` / `getChamberCurrent().latestCongress`) and
   gates the toggle to that, matching the rest of the app.

7. **Committee search is a small sibling component, not a generalisation of
   `SenatorSearch`.** Search isn't one of the shared chart primitives the
   tenet is about, and the member combobox's a11y is delicate;
   `components/committee/CommitteeSearch` mirrors its chrome for committees.

8. **Long committee names.** Real short names run to
   "Homeland Security and Governmental Affairs" — far longer than the mockups'
   one-word examples. `SwarmRows` clamps its label gutter to a fraction of the
   measured width and clips overflow; the aggregate list disambiguates the
   House/Senate duplicates ("Judiciary (H)") by chamber. Two select committees
   (`HSZS`, `HSQJ`) and the Helsinki Commission (`JCSE`) keep long `short_name`s
   the derivation can't shorten — acceptable, they're niche.

9. **Assorted mockup chrome** (a `WEALTH SOON` nav done differently, an
   `← INSIDEGOV` back-link, card titles) was matched to the real `SiteNav` /
   `ProfilePanel` / profile-page components rather than ported from the mockups.

### Still open / not built (deliberately)

Subcommittees (raw data is fetched but not transformed, so the follow-up is
additive), and a per-committee and per-member bills/votes record. (The
committee-membership section on member profile pages this list used to name
as future work is now built — see "Session 3" below.)

---

## Session 2 — reversible Ideology sort, chamber-identity committee colour, header back-link

Built from `committees-round2-session-prompt.md` (superseding that document's
own forward-pointers in the original prompt's §4.2/§4.3/§4.5) plus a follow-up
mockup for the header back-link. Notes on what the prompt didn't (and
couldn't) anticipate:

1. **The sort toggle didn't exist as a shared component before this session**
   — "Widest spread" / "A–Z" were inline buttons duplicated once inside
   `SenateExplorer.tsx` for both charts, styled as separate standalone
   buttons (not the grouped-pill chrome every other toggle on the site uses).
   Per the round-2 prompt's §1.3, this session both added "Ideology" *and*
   restyled the existing two into a real grouped `role="group"` pill
   (`charts/SortToggle.tsx`), matching `ExplorerToolbar`'s chamber/Members-
   Committees toggle and `CommitteeCompassCard`'s All/Nearest-neighbors
   toggle pixel-for-pixel rather than the mockup's rounded-full pill chrome
   (mockups are unstyled-to-spec, not styled-to-ship — see the divergences
   list above).

2. **Chamber-identity committee colours required two new palette tokens, not
   a `chamber` lookup alone.** `chamber` was already a field on
   `CommitteeSummary`, so no pipeline change was needed — but *picking* two
   new colours that pass `validate_palette.js` against the existing
   dem/rep/oth tokens took real search. Green is a bad choice for one of the
   two: under simulated protanopia/deuteranopia it converges toward
   `--rep`'s red-orange almost everywhere in HSL space (confirmed by brute-
   force search, not assumption) — the shipped `--committee-house` is
   therefore a *dark* forest green (`#124912` light / `#7dd175` dark), not
   the lighter green the round-2 mockup's own reference swatch suggested.
   `--committee-senate` is a magenta (`#ad1f8a` light / `#c24799` dark).
   **Superseded later (phone legibility):** dark green vs. magenta vs. grey were
   hard to tell apart as tiny dots on a phone, so the three chambers are now
   **amber House (`#b57800` / `#f2b84b`), teal Senate (`#0b8a8f` / `#45c6c6`) and
   charcoal Joint (`#2f3441` / near-white `#e6e8ee`)**, with a dedicated
   `--committee-joint` token (joint no longer borrows `--oth`). Different hues
   *and* lightnesses. The validator forces all three against each other and
   against dem; `committee-house` vs. `rep` is deliberately not forced (amber
   and red can't be separated under deutan vision at 3:1 contrast, and they
   never share a chart).
   `validate_palette.js` gained `FORCED_PAIRS` + `NEW_KEYS` sections because
   these colours never share a real `party_code`, so the file's existing
   co-occurrence detection (driven by `ideology_scores.json`) can't see them
   automatically — they're checked against dem/rep/oth/each-other explicitly
   instead, with an absolute (not regression-relative) bar, since a
   brand-new token has no prior committed value to regress from.

3. **The header back-link change came from a third, later document**
   (`committee-page-mockup-backlink.html`, sent mid-session), not the
   round-2 prompt above. It's included in this same entry because it's a
   small, related "sub-page chrome" cleanup: the separate "← InsideGov" link
   under the header on member/committee pages was redundant with the
   already-clickable wordmark, so it was removed and folded into the
   wordmark itself (see the "Site-wide header back-link" section above). The
   mockup's own JS comment says the destination must be fixed and always the
   canonical homepage — the shipped version keeps that constraint (never
   `history.back()`) but preserves the real, richer per-page hrefs
   (`?chamber=house&show=committees`, etc.) that already existed in
   `CommitteeProfileView`/`MemberProfileView` before this session, rather
   than flattening them to a bare `/` the way the standalone mockup did —
   flagged here per this project's "flag divergence for review rather than
   silently resolving it" tenet, not silently decided.

---

## Session 3 — committee memberships card on member profile pages

New card at the bottom of every member profile page
(`member-committee-memberships-session-prompt.md` +
`member-committee-memberships-mockup.html`): every committee a member sits
on, role-then-seniority ordered, each row showing an `AlignmentTrack` of the
member's own position against that committee's blend.

- **Data was already shaped for this.** `committee_memberships.json` is
  `bioguide_id`-keyed specifically so a member's own page could look this up
  directly (original session prompt §3) — this session just built the
  lookup: `buildCommitteeIndex()` in `lib/committee-data.ts` now also
  inverts `memberships` into a `byMember` map (role tier, then `rank`,
  pre-sorted once at build time) behind `getMemberCommitteeMemberships()`.
  No pipeline change, no new join step — the member's own profile data
  (`lib/congress-data.ts`) and the committee data (`lib/committee-data.ts`)
  already run in the same server-side build step, reading the same
  committed `pipeline/output/*.json`, so the prompt's §5 concern ("confirm
  these aren't computed in separate passes") didn't apply here.
- **Confirmed, not assumed: the zero-membership case is genuinely rare.**
  22 of the 553 current members (~4%) have no current committee seat —
  spot-checked a few (Pelosi, a mid-Congress resignation, a member who left
  for an executive-branch role) and they're all real, unremarkable
  vacancy/transition cases, not a data bug. `CommitteeMembershipsCard`
  returns `null` for an empty list — the card is simply absent, never an
  empty state.
- **`AlignmentTrack` is a new primitive** (see the shared-components table
  above) — plain positioned `<div>`s, not `ChartFrame`/SVG, since it's one
  small two-point comparison per row rather than a shared-axis chart of many
  rows. Same dot-on-a-line visual language as `SwarmRows` (colour-filled
  primary dot, faint neutral reference dot) so it reads as consistent with
  the rest of the site rather than a new visual idiom, per the mockup's own
  framing.
- **Role tags don't reuse the mockup's literal colours.** The mockup's
  "Chair" pill used a hardcoded gold hex (`#f3ece1`/`#8a6a1f`) with no dark-
  theme variant. Shipped version uses existing tokens instead — Chair is
  `bg-accent text-accent-ink` (this project's one existing "this is the
  active/primary one" treatment), Ranking Member matches the mockup's own
  already-token-based style (`border-line-strong` / `surface-raised` /
  `ink-muted`) — both theme-safe for free, no new colour introduced.
- **Ranking, confirmed against the mockup's own tenet list:** role tier
  first (chair/ranking above plain member), then `rank` ascending — real
  seniority data from the source file, not alphabetical, not by committee
  size, not by ideological-alignment closeness (noted in both the prompt
  and mockup as a plausible *future* sort-toggle lens, not this card's
  default order — left for later, not built here).
- Full committees only (subcommittees were already out of scope for the
  whole committees feature). **Click target: since revised to the whole
  row**, not just the committee name — the mockup/prompt originally
  specified name-only (matching the convention elsewhere committees
  appear), but that was changed on direct request after shipping. The row
  is a single `<Link>`; the committee name is styled via `group-hover`
  rather than nested inside its own anchor.

---

## Net worth track — Sessions 1–7

Built from `net-worth-claude-code-plan.md`, seven sessions. Notes on where
the plan and the shipped code diverge, beyond what's already called out
inline in the tables above:

1. **`/congress/wealth`** is a section of the Congress vertical (it shipped at `/wealth` originally; `/wealth` now 308s).
2. **The party wealth chart was built (Session 3) then explicitly removed**
   on direct request, along with tightened list headers — a real, shipped
   feature taken back out, not a divergence in the "prompt vs. code"
   sense. `/congress/wealth` today is: filter bar, scatter, highest/lowest lists.
3. **Session 5 (line-item extraction) ran at full scale, not just the
   session's own investigate-phase sample.** The plan's Session 6 depends on
   Session 5's *output existing*; validating that against only the ~85
   locally cached House PDFs and calling it done would have left Session 6
   built against a near-empty `line-items/` directory. Session 5 fetched the
   ~2,600 remaining House PDFs from the House Clerk's own site (all already
   publicly available, same one-PDF-per-request pattern `build.py` already
   uses) before Session 6 started — 3,507 of 3,515 usable filings
   reconciled. See `docs/NET_WORTH_METHODOLOGY.md`'s "Line items and the
   profile card" section for the numbers and the reconciliation gate.
4. **No click-to-select-driving-a-dropdown pattern existed before Session
   6** — checked `senate/SenatorTrajectoryChart` (no click handler at all)
   and the wealth scatter's own `selectedId` (highlights a marker, doesn't
   drive another control). Built from scratch for `wealth/MemberNetWorthChart`
   + `wealth/MemberWealthItemsPanel`, modeled structurally on
   `SenatorTrajectoryChart`'s `ChartFrame`/`Axis`/zoom-to-data-y-domain shape.
5. **The profile card's chart x-axis and gap labels needed a second pass**
   (reported directly, not found in review): the plan says "one point per
   year covered," which a first cut read as "always plot the full
   2013–2025 window" — for a member who entered Congress well after 2013,
   or whose data starts later, that left a long empty run-up. Fixed to start
   at the member's own first reported year instead. A related bug in that
   same first cut rendered one muted gap label *per missing year* rather
   than one per contiguous run — for a multi-year gap this stacked several
   "no filing" strings on top of each other into unreadable text
   (`"no filing filing filing"`). Both fixed in `MemberNetWorthChart.tsx`.
6. **A real data-quality bug, exposed (not caused) by removing the item
   list's old single-line truncation**: some House PDF vintages' embedded
   fonts map certain glyphs — confirmed on the "L" of "LOCATION:" and the
   "D" of "DESCRIPTION:" continuation labels — to literal NUL/control
   codepoints, which pdfplumber decodes as-is rather than dropping. Hidden
   behind a `truncate` (single-line ellipsis) UI treatment on the shipped-
   then-immediately-revised item list, this only became visible once the
   list was widened and given room to show full descriptions. Fixed at the
   word-collection point in `house_line_items.py` (`_clean_word`), scoped to
   that module rather than `extract_text.py` (shared with the trusted,
   untouched `columns.py` band-counting path).
7. **The item list's remaining known display artifact**: on rare pages with
   several same-band items back-to-back, one item's description can still
   absorb a neighbor's text (the reconciliation gate only guarantees band
   *totals* match, not that every description is paired with its own value
   — documented residual risk since Session 5, see `house_line_items.py`'s
   module docstring). Mitigated in the UI with a 3-line clamp rather than
   chased further at the extraction layer in this pass.
8. **Assets/Liabilities is a toggle, not two stacked sections.** The
   original Session 6 build listed both under sticky "Assets · N items" /
   "Liabilities · N items" headers in one scrollable region — functional,
   but on a member with 300+ assets, liabilities were scrolled out of
   reach. Revised to a two-way pill toggle (same `role="group"` pattern as
   `ChamberSwitch`) that replaces the panel's title, one list shown at a
   time.

---

## Session: two-tier structure (hub, `/congress`, `/congress/wealth`)

`/` is now a hub; the explorer moved to `/congress`, wealth to `/congress/wealth`, with branch → section nav (see Routes and the header section above). Divergences from the session prompt:

- **Explorer query params** are `chamber`, `state`, `show` (only those). Redirects use one `has` rule each; bare `/` stays the hub. Old `/#delegation` links now land on the hub (hash is client-only).
- **No `"/"` tracing entry** (at the time): the hub is a static page reading JSON at build time. The Court session added `"/"` and `"/supreme-court"` keys for `pipeline/output/court/*.json` anyway, per its brief.
- **Supreme Court**: was pipeline-output-only here; the Court landing page shipped in the next session (below).
- **OG images**: a page that sets its own `openGraph` doesn't inherit the root file-based image, so `/congress` and `/congress/wealth` set `images`/`twitter.images` to `/opengraph-image` explicitly.
- **Sticky behavior**: header doesn't stick, so the secondary row scrolls away; toolbars unchanged.
- `/congress`'s title is now "Congress ideology explorer"; the hub keeps the site-level title.

---

## Session: Supreme Court landing page (`/supreme-court`)

Data: `lib/justice-data.ts` (server-only, cached) reads the four `court/*.json` outputs and calls the pure `lib/court-derive.ts` (`buildCourtPayload`) to produce one compact `CourtPayload` (`lib/court-types.ts`, client-safe: per-justice score/interval arrays by term, per-term court record incl. mid-term left/joined, presidents in office order, the fitted score domain). `getCourtHubSummary()` feeds the hub card. Rules (a/b median, domain, turnover, presidents) are in `docs/SCOTUS_DATA_METHODOLOGY.md`.

Components (`components/court/`): `CourtExplorer` (state, cards, `<details>` table fallbacks), `CourtToolbar`, `JusticeSearch` (lives in chart 1's card), `JusticeStrip` (chart 1), `PresidentRows` (chart 2), `JusticeTrajectory` (chart 3), `CourtHubSparkline`.

Which primitive carries which chart:

- **Chart 1** `JusticeStrip`: `ChartFrame` + `Tooltip`; geometry is `lib/court-strip-layout.ts` (deterministic beeswarm dodge + label placement; pure, so `court-strip-layout.test.ts` audits every real term at six widths). `ScatterPlot`/`SwarmRows` don't fit a dodged single-axis strip with placed labels, so the smallest new thing is the layout function, not a parallel chart stack. Fixed pixel height (`STRIP_GEOMETRY`) so the card never resizes while playing; a 12.5px IBM Plex Sans label box is 16.5px tall (measured), and the layout is built on that.
- **Chart 2** `PresidentRows`: `SwarmRows`, extended with optional `domain`, `showAxis`, and per-point `radius`/`opacity`/`ring` and per-row `tinted`/`faded`. All default to the Congress behaviour, so `DelegationChart`/`CommitteeSwarm` are unchanged. Card-height mechanism is `SenateExplorer`'s (grid `md:items-stretch`, list absolutely positioned in a `flex-1` wrapper at md+; below md it expands).
- **Chart 3** `JusticeTrajectory`: `ChartFrame` + `Axis` (years) + `Tooltip`; playhead and click-to-scrub follow `TrendChart`; legend at the bottom.

Reserved heights: the "Mid-term change" line and the selected-justice row always occupy their space so chart 1's card (and chart 2's stretched card) never change height with the term.

Config/plumbing: `lib/verticals.ts` Court `status: 'live'`; `app/sitemap.ts` already emits every live branch, so `/supreme-court` is in it; `next.config.ts` `outputFileTracingIncludes` has `/supreme-court` and `/` keys for `./pipeline/output/court/*.json`.

### Member profile: subcommittee seats

`CommitteeMembershipsCard` nests a member's subcommittee seats under each parent committee row in a native `<details>` ("N subcommittees ▸"), collapsed by default. Plain text only (name, role tag, member count): no blended-position strip, since subcommittee rosters are too small for a meaningful mean. Data: `MemberCommitteeMembership.subcommittees` from `lib/committee-data.ts`.
