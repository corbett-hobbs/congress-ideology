# Foreign assistance methodology

How `pipeline/fetch/foreign-assistance.ts` and `pipeline/transform/foreign-aid{,-run}.ts` turn
ForeignAssistance.gov into `pipeline/output/foreign_assistance.json`,
`foreign_assistance_meta.json` and `foreign_assistance_report.json`. Schemas:
`lib/foreign-aid-entities.ts`. General pipeline rules: `docs/DATA_CONVENTIONS.md` §11. This is the data layer only;
the Presidency → Foreign policy page does not exist yet.

## Scope: assistance, not total security transfers

ForeignAssistance.gov does **not** reflect most arms sales or transfers of military equipment. Foreign Military Sales
is a separate program (DSCA notifications, SIPRI arms transfers and USAspending are out of scope). A page built on
this data covers U.S. foreign *assistance*, not total U.S. security transfers to a country. "Military" below means
the source's own *Military assistance* classification (e.g. Foreign Military Financing, Excess Defense Articles), not
arms sales.

## Source and access (verified 2026-10-01)

- `https://foreignassistance.gov` serves a public, keyless JSON API under `/api/data-api/` (OpenAPI document embedded
  in the site's JS bundle; the `/api-docs` page renders it). No authentication, no key, no documented rate limit.
  Cloudflare returns 403 to some default HTTP-client user agents; the fetch script identifies itself plainly.
- Endpoints (all `GET`, `?page=&per_page=` with `per_page` **capped at 1000** despite the doc saying 10000, filters as query params):
  `by-country`, `by-usg-sector`, `by-managing-agency`, `by-funding-agency`, `by-dac`, and `complete-data`
  (1,665,407 transaction lines, every field).
- The site went offline on January 31, 2025 and was later restored. What is live today is the full API above; nothing
  we fetched looks reduced, but we cannot see what the restored dataset lost or revised relative to before the outage.
  That history is the main reason we keep committed snapshots: a future diff shows what the source changed.
- We use **`by-usg-sector`** (192,535 rows: country × U.S. sector × fiscal year × transaction type) for amounts, and
  **`complete-data`** only for the Military subset (below). We fetch it with filters, never the whole 1.7M-line file.

### Pagination caveat (found the hard way)

`complete-data` paginates unreliably over a large result set: an unfiltered pull of the Military/disbursements subset
returned exactly the reported 29,672 rows but silently omitted lines (FY2025 summed to $1.6B instead of $6.3B; Israel's
$3.3B was absent). Requests filtered to **one fiscal year** are reliable (verified equal, line for line in dollars, to a
per-country partition for FY2025 and FY2012), so the fetch pulls per year. `by-usg-sector` rows carry a unique `id`;
the fetch fails if ids repeat across pages. The snapshot stores the API's own `total_records` and `pnpm validate`
fails if the committed rows don't match them.

## Coverage and freshness

- **Sector-level data: FY2001–FY2026** (the latest year in the API). Transaction types served: Appropriated and
  Planned, Obligations, Disbursements, President's Budget Requests. We keep **Obligations** and **Disbursements** only.
- **`data_through = 2026-09-30`.** This is the site's "Data last updated on" banner. It is **not an API field**: the
  site renders it from a constant in its JS bundle, which the fetch script reads (fallback: `--data-through=YYYY-MM-DD`).
  It is the date the portal was refreshed, not a statement that every agency has reported through it.
- The source has **no per-year completeness or agency-status indicator.** `is_partial` is therefore *our* calendar rule
  (`partial_basis: "calendar_rule"` in the meta file): a fiscal year is partial until `data_through` is at least 45 days
  (the source's stated quarterly reporting lag) after September 30 of that year. Today that marks **only FY2026** partial.
  FY2026 ended the day the data was refreshed. FY2025 row counts are also visibly lighter than FY2024 (5,612 vs 6,649
  sector rows), which the rule does not use (never infer from row counts) but is worth knowing: late agency reporting
  and revisions are plausible for the newest *complete* year too.
- The FY2026 numbers in this snapshot are well above Pew's through-July-1 figures ($11.75B vs $6.97B total), as
  expected for a source refreshed three months later.

## Pre-FY2001 history (reported, not built)

- `by-country` serves **Obligations back to FY1946** (82 year labels, including transition-quarter labels like `1976tq`;
  ~190 countries by the late 1990s, e.g. $18.3B in FY1999, $17.1B in FY2000). It serves **no Disbursements before FY2001.**
  `by-usg-sector` and the agency endpoints start at FY2001. So before FY2001 there is country-level *obligations* only,
  with no sector split and no military flag.
- `complete-data` Military lines exist before FY2001 too (used nowhere; dropped by the fetch).
- The Data page also offers the USAID "Greenbook" workbook (`/static/us_foreignaid_greenbook.xlsx`, FY1946–2020,
  obligations/loan authorizations, economic and military, current and constant dollars). It is a separate, differently
  defined series. A bridge across the FY2001 seam would need its own session (like the trade duties bridge); nothing here assumes one.

## Measure: disbursements (headline) and obligations

**Disbursements** are cash paid out; **obligations** are legal commitments. Appropriations and obligations are easier
to reduce, rescind or cancel, so the headline is disbursements. `obligations_usd` is kept as a secondary column.

- `disbursements_usd` is `0` when the source reports obligations but no disbursements for that grain.
- `obligations_usd` is `null` when the source has no obligation record for that grain (absence, not zero).
- **Negative disbursements exist in the source** (recoveries and adjustments; 1,654 negative source rows, 439 negative
  output rows). They are kept as published and counted in `foreign_assistance_report.json`. A fiscal year whose national
  total is not positive fails the pipeline.
- Dollars are **nominal** (the API's `current_amount`). The API also offers `constant_amount`; it is deliberately not
  stored. Real-dollar conversion belongs to the page: the economy pipeline already carries `CPIAUCSL` (monthly CPI) in
  `indicator_observations.json`, but its base year/method is the page session's decision.

## Fiscal-year convention

Federal fiscal year, October 1 – September 30, labeled by the year it **ends** (FY2025 = 2024-10-01 … 2025-09-30), as
the source labels it. Assigning fiscal years to administrations is a serving-layer concern (not done here).

## Grain and shape

One row per (`recipient_type`, `recipient_name`, `fiscal_year`, `sector_category`), sharded by fiscal year
(a single `foreign_assistance.json`, ~7.4 MB, one row per line; the raw snapshots are sharded by year, 5.6 MB total). It is one file because nothing consumes it yet, and a single file keeps the schema and diffs simple.
National totals are never stored; derive them at build time.

- **`recipient_type`**: `country`, `regional` (names ending "Region"), `global` (the source's `WLD` "World"). Regional and
  global rows are **kept**: in FY2025 global programs were 26.4% ($12.65B) and regional 7.6% ($3.65B) of disbursements,
  and dropping them breaks reconciliation to national totals. Page code that sums countries must filter on `recipient_type`.
- **`sector_category`**: the source's nine top-level U.S. categories, verbatim, stable across all 26 years with the same
  ids 1–9: Peace and Security; Democracy, Human Rights, and Governance; Health; Education and Social Services; Economic
  Development; Environment; Humanitarian Assistance; Program Support; Multi-sector. (Sector-level detail — 52 sectors —
  is in the raw snapshot but not carried to the output.)
- **`military_disbursements_usd`**: see below.

## The military split is **not** the Peace and Security category

The working hypothesis ("military = Peace and Security") **fails.** The source classifies each transaction line by
`assistance_category` (`Economic` = 1, `Military` = 2), independent of the sector category:

| FY2025 | Peace and Security category | `assistance_category = Military` | Pew military |
|---|---|---|---|
| Ukraine | $1,333,559,429 | $1,011,759,817 | $1,011,759,817 |
| Israel | $3,305,677,696 | $3,305,572,360 | $3,305,572,360 |

For Ukraine, $322M of Peace and Security lines are Economic (e.g. Economic Support Fund) and a few Military lines fall in
Health and Program Support. The rule that reproduces the published split to the dollar is the source's own field, so
we preserve it: `military_disbursements_usd` is the part of `disbursements_usd` on lines with `assistance_category =
Military`, summed to the same (recipient, fiscal year, category) grain. Non-military = `disbursements_usd − military_disbursements_usd`
(derivable, not stored). Military *obligations* are not carried. The ~77k Military transaction lines are summed
to the sector grain **at fetch time** (the full transaction file is 1.7M lines and cannot be committed); the raw
snapshot therefore stores the Military subset pre-aggregated. A military line with no matching sector-file row fails
the transform (17 output rows have military > total disbursements because of negative offsetting lines; reported).

## Country identifiers and the crosswalk

The source uses ISO 3166-1 alpha-3 codes (plus its own region codes, `WLD`, and a few oddities). The trade pipeline's key
is `country_code` in `countries.json`: ISO alpha-3 with user-assigned `XKX`/`XWB`/`XGZ`, ISO 3166-3-style codes for former
states (`CSK`, `SCG`, `SUN`, …). `country_key` = that key, so aid joins to trade directly. Rules (`CROSSWALK_RULES` in
`pipeline/transform/foreign-aid.ts`):

| Source entity | `country_key` | Rule |
|---|---|---|
| 208 recipients whose alpha-3 is a non-aggregate trade `country_code` | the code | identity |
| Kosovo (`CS-KM`) | `XKX` | explicit: the source's label vs. trade's user-assigned code |
| Czechoslovakia (former) (no code in source) | `CSK` | explicit, by name |
| West Bank and Gaza (`PSE`) | `null` | trade reports West Bank (`XWB`) and Gaza (`XGZ`) separately; there is no single counterpart. The aid rows are kept. |
| Serbia (`SRB`), Serbia and Montenegro (former) (`SCG`) | identity | both exist in trade |
| Regions and World | `null` | not countries |
| **Unmapped (3):** China (Tibet) `TIB`, Pacific Island Trust Territory `PIT`, Sudan (former) `SDF` | `null` | no trade counterpart; present in the aid file with a null key and listed in `foreign_assistance_report.json` → `crosswalk.unmapped_entities` |

Nothing is dropped: an entity with no trade counterpart still has its aid rows. A regional/global source code that ever
collides with a trade `country_code` fails the transform.

## Reconciliation (Pew Research Center, July 21, 2026; cross-check only, never data)

Targets are in `TARGETS` (`pipeline/transform/foreign-aid.ts`) and graded into `foreign_assistance_report.json`
(≤0.5% pass, 0.5–5% investigate, >5% stop; reported, not hard-failed; FY2026 is sanity-only). Result: every military
figure matches to the dollar and the rest are within 2%; nothing reaches 5%. The five "investigate" lines (FY2025 total
+1.1%, Peace and Security +1.8%, Ukraine total +0.8% / non-military +1.0%, regional share −1.0%) all run in the
same direction: this snapshot is ~$0.5B higher in FY2025 than Pew's July 1 snapshot, with Humanitarian Assistance
identical and Health +0.04%, and FY2024 −0.04%. That is consistent with FY2025 late reporting and revisions in the
three months between Pew's snapshot and the 2026-09-30 refresh; we cannot confirm it because the earlier state of the
source is not available. A definition or bug problem would not leave the military split and Humanitarian exact.

## Out of scope / known gaps

No UI, no constant dollars, no pre-FY2001 bridge, no Foreign Military Sales. Agency × sector × year (the "what happened
to USAID" cut) is **not built**: `by-managing-agency` and `by-funding-agency` have agency × country × year with no sector,
so agency × sector needs the full 1.7M-line `complete-data` file (~1.2 KB/line, on the order of 2 GB), which paginates unreliably in bulk (see above)
and would have to be pulled in small filtered slices; deferred to its own session. No scheduled freshness Action: the fetch is re-runnable and diff-friendly
(`fetched_at` is carried over while rows are unchanged; rows are sorted).
