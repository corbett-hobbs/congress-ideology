# Foreign aid page — pre-flight inventory

Session 1 of the foreign-aid UI plan. Read from the tree on 2026-10-01; no feature code. Every "can it be reused"
question has a yes/no with the file path.

## Data

- Outputs: `pipeline/output/foreign_assistance.json` (one flat file, 32,604 rows, 7.35 MB), `foreign_assistance_meta.json`,
  `foreign_assistance_report.json`. Schemas: `lib/foreign-aid-entities.ts` (`aidRow`, `aidMeta`, `AID_FIRST_FISCAL_YEAR`, `AidDataError`).
- Row: `recipient_type` (country/regional/global), `country_key` (nullable), `recipient_name`, `fiscal_year`, `sector_category`
  (source's title-case name), `disbursements_usd` (int, may be negative), `obligations_usd` (nullable), `military_disbursements_usd`.
- A country row's stable id is `recipient_name` (unique per `recipient_type`); `country_key` is null for West Bank and Gaza,
  Sudan (former), China (Tibet), Pacific Island Trust Territory. The page keys countries by `recipient_name`.
- Meta: `data_through`, `first_fiscal_year`, `latest_fiscal_year`, `years[].is_partial` (calendar rule: partial until 45 days after Sep 30), `sector_categories` (9).
- Refresh: `.github/workflows/foreign-assistance-freshness.yml` exists (weekly Tuesday, PR only when the source moved, never auto-merged). Nothing to add.
- Reconciliation "investigate" items: already explained in `docs/FOREIGN_AID_METHODOLOGY.md` ("Reconciliation") as late reporting /
  revisions between Pew's July 1 snapshot and the 2026-09-30 refresh (military split and Humanitarian match exactly). Decision: document, do not change the pipeline.

## Routing and registration

- Presidency sections are declared in `lib/verticals.ts` (`DEFS`, presidency `sections`). Flipping one in = add `{ id, label, status: "live" }` plus `app/presidency/<id>/page.tsx`. Nav, sub-nav, sitemap (`liveSections()`) and `lib/verticals.test.ts` derive from it. Route: `/presidency/foreign-aid` (section id `foreign-aid`, label "Foreign aid").
- `SetBackLink` (`components/BackLinkContext.tsx`) is used only by entity profile pages (`MemberProfileView`, `CommitteeProfileView`, `JusticeProfileView`). Section pages (Immigration, Trade) do not use it, so this page does not.
- Page pattern: `app/presidency/immigration/page.tsx` (metadata + `<XPageClient data={getX()} />`), client shell `components/immigration/ImmigrationPageClient.tsx`, `PageHeader` for title/intro, `<main className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 pb-16 pt-7 sm:px-6">`.

## Filter bar, President dropdown, term band, FY → administration

| Piece | Reuse as-is? | Notes |
| --- | --- | --- |
| Pinned bar chrome | **Yes (copy the shell)** | `components/trade/TradeFilterBar.tsx`: `sticky top-0 z-40 …` wrapper, `grid grid-cols-2` on phones, flex row from `sm`. Each page owns its bar component; add `components/foreign-aid/ForeignAidFilterBar.tsx` with the same shell. |
| President dropdown | **Yes (pattern)** | Immigration (`ImmigrationFilterBar` + `termsNewestFirst`/`termOptionLabel` in `lib/immigration-derive.ts`) and Trade (`economy-presidents.ts` terms) each build their own `<select>`. Foreign aid needs the FY-window rule, so it gets its own small dropdown fed by `lib/foreign-aid-derive.ts` terms. |
| Term band under the axis | **No (new, small)** | `StackedBars` has `bands` (`StackBand`) but is count-only (see below). The Economy/Trade `EraLayers` band is day-axis based. The mockup's fiscal-year band is ~10 lines on a year axis and lives in the new spending chart. |
| FY → administration rule | **Reuse the data, not the function** | Immigration reads a precomputed `administration_term_id` per FY from the enforcement file (asserted = majority-days term). Foreign aid has no such field, so `lib/foreign-aid-derive.ts` computes the majority-days term from `administrations.json` with `termIdForDate` (`lib/indicator-derive.ts`) semantics. Expected: FY2001–08 Bush, 09–16 Obama, 17–20 Trump, 21–24 Biden, 25– Trump. |

## Country combobox

`components/trade/CountryCombobox.tsx` — props `{ countries: readonly TradeCountryRef[]; value: string | null; onChange(code|null); className? }`, matching by `filterCountries` (`lib/trade-country-search.ts`, accent-folding, starts-with first). It only reads `code` and `name` from `TradeCountryRef` (`lib/trade-types.ts`; `firstYear`/`lastYear` are unused by it). **Yes, reusable** with this page's list: `{ code: recipient_name, name: display name, firstYear: null, lastYear: null }`. Its option list is "All countries" + every ref, aria-labelled "Country".

## Sort toggle and ranked rows

- `components/charts/SortToggle.tsx` exports `ReversibleSortToggle<K>` (options, `active`, `reversed`, `onSelect`; second click reverses; supports per-option `hint`, no `disabled`). **Yes, reusable.** It cannot disable the "Change vs. prior year" option today, so add an optional `disabled?: boolean` + `disabledHint` per option (additive; existing callers unchanged).
- `components/charts/SwarmRows.tsx` draws dots on one shared axis (`SwarmPoint`, `value`, `colorClass`), with label gutter and right meta. **No for a multi-segment (stacked) bar per row**: it is SVG dot geometry, no segment concept. Extending it would mean a second row mode inside a 266-line body that three charts depend on. Decision: new body `components/charts/StackedRows.tsx` (rank, name, stacked bar on a shared scale, total, delta) in HTML (like the mockup), same props pattern (rows in, `renderTooltip`, `selected`/`dimmed`, `onRowClick`). Recorded here so the reuse principle is a decision, not an omission.
- Card chrome: `components/charts/ChartCard.tsx` takes `title`, `lede` (a required string), `action`, children. The mockup cards also carry a subtitle that updates and a chip; `ChartCard`'s lede can take the subtitle string, but `lede` is typed `string`, so it is widened to `ReactNode` (additive).
- Equal-height pattern: grid `md:items-stretch`, list absolutely positioned inside a `flex-1 relative` wrapper — the comment above the grid in `components/senate/SenateExplorer.tsx` (≈ line 266). `JusticeProfileView` does the same, verified by `scripts/check-justice-layout.mjs` (Playwright). Reuse the pattern; add a sibling check script for this page.

## Time slider

`components/senate/ExplorerToolbar.tsx` has the Congress single-handle slider with play/pause, but it is welded to Congress numbers and chamber state. `components/charts/RangeSelector.tsx` is a two-handle year-window control (not what this page needs). **Not reusable as-is.** The fiscal-year control is a small new component (`components/foreign-aid/FiscalYearControl.tsx`: play/pause button, native `<input type="range">`, "FY2025 · Oct 2024 – Sep 2025" readout), in the ExplorerToolbar's row shape. `RangeReset` is not used (the control has one handle).

## Spending chart

`components/charts/StackedBars.tsx` builds on `ChartFrame`/`Axis`/`Tooltip` and has bands, highlight and selection. **No** for this page as-is: the y-axis format is `String`, the per-column aria label is hard-coded to "executive orders", there is no hatched partial year, no drag-to-select, no signed-value handling. The new `components/foreign-aid/SpendingChart.tsx` uses the same three primitives (`ChartFrame`, `Axis`, `useTooltip`/`Tooltip`) and `useElementWidth` (`lib/use-element-width.ts`). No forked primitive code.

## Palette pipeline

- Tokens: raw custom properties in `app/globals.css` — `:root` (light), `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`, and `:root[data-theme="dark"]`; re-exported to Tailwind in `@theme inline` as `--color-<name>` (so `bg-…`, `fill-…`, `text-…` utilities). Existing non-party sets: `--committee-house/senate`, `--topic-a/b/n`, `--cont-*`.
- `lib/party-palette.ts` / `lib/committee-palette.ts` are TS facades over those tokens.
- Gate: `validate_palette.js` — `PALETTE_KEYS`, `FORCED_PAIRS`, `NEW_KEYS` (absolute checks: ≥ 3:1 on bg/surface/surface-raised; OKLab dE ≥ `DE_GOOD` under normal/protan/deutan for each forced pair). New sector keys go in `PALETTE_KEYS` and `NEW_KEYS`, with `FORCED_PAIRS` for every pair on the same chart (the six sector slots against each other). `--set key=light,dark` tries a candidate. Run: `node validate_palette.js`.

## Map and geometry

No map or geometry code exists. `node_modules` has `d3-array`, `d3-scale`, `d3-shape`, `d3-force`, `d3-color`, `d3-interpolate`, `d3-path` — **no `d3-geo`, no `topojson`**. Session 3 needs `d3-geo` (dev dependency; computation only, nothing ships) and a Natural Earth 50m snapshot (a download, needs the user's go-ahead). The mockup embeds a coarse ~1 MB path set keyed by `country_key`; it is a reference, not a source (plan §6).

## Tests and CI

- Unit: Vitest (`vitest.config.ts`, `lib/**/*.test.ts` and `pipeline/**/*.test.ts`, node environment). Derivations are tested over the real committed files (`lib/immigration-derive.test.ts` pattern).
- Browser: Playwright is a devDependency; acceptance scripts are standalone `.mjs` against a running server (`scripts/check-justice-layout.mjs`, `pnpm check:justice-layout`; `BASE_URL`, `--shots`). Not in CI.
- CI (`.github/workflows/ci.yml`): `pnpm typecheck` → `pnpm lint` → `pnpm test` → `pnpm pipeline:check` → `pnpm build`.

## Server-only readers and payload codecs

- Pattern: `lib/<x>-data.ts` (`import "server-only"`, `readFileSync` from `pipeline/output`, Zod-parse at the boundary, module-level cache) + `lib/<x>-derive.ts` or `-payload.ts` (pure, no I/O, unit-tested). Examples: `lib/immigration-data.ts` + `immigration-derive.ts`, `lib/trade-data.ts` + `trade-payload.ts` + `trade-types.ts`, `lib/wealth-data.ts` + `wealth-derive.ts` (`toWealthPayload`/`fromWealthPayload` compact codec), `lib/line-items-data.ts` (sharded reader).
- `outputFileTracingIncludes` in `next.config.ts` lists routes that read `pipeline/output` at **request** time (profile pages, OG images, sitemap, Court pages). Static pages that read at build time (`/presidency/immigration`, `/presidency/trade`) have no entry. The foreign-aid page is static, so it needs none; add one only if the route ever becomes dynamic or a `/data/...` route handler reads the file per request.
- Payload size: 7.35 MB of JSON rows cannot ship inline. Session 2 pivots to a dense `(country, year, sector)` typed-array-friendly payload (exact integer dollars) and measures the gzipped size; if it is too large for an inline page prop, follow the `/data/trade/years/[year]` precedent (`app/data/trade/...` static route handlers) instead.

## Findings that change the plan

1. `SwarmRows` cannot draw stacked bars; a new HTML `StackedRows` body is the decision (above).
2. `StackedBars` is count-only; the spending chart is a new body on the shared primitives.
3. The fiscal-year slider is new (the Congress slider is not generic).
4. `ReversibleSortToggle` and `ChartCard` each need one additive, backward-compatible prop.
5. `d3-geo` and a Natural Earth download are required for Session 3.
6. No `outputFileTracingIncludes` entry is needed for a static page.
