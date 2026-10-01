# Tariff actions: curation guide and D2 investigation

The tariff chart (Chart 2) and the before/after chart (Chart 4) read a hand-curated timeline of
major tariff actions and court rulings: `pipeline/reference/tariff-actions.json` (curated) ->
`pipeline/output/tariff_actions.json` (validated, sorted). Schema and the one stale-review
threshold: `lib/tariff-actions-entities.ts`. Validation: `pipeline/transform/tariff-actions.ts`.
Nothing here is fetched. Trust comes from a **primary source on every row**.

## Investigation findings (2026-10-01)

- **Precedent.** Hand-curated inputs live in `pipeline/reference/` (`congress-control.json`,
  `ice-removals-catalog.json`) and are transformed and validated into `pipeline/output/`
  (DATA_CONVENTIONS section 10). This follows it. The output has a file-level `last_reviewed`, so it is
  `{ last_reviewed, actions: [...] }`, one action per line.
- **Executive-order key.** `executive_orders.json` identifies an order by `eo_number` (also
  `document_number`, the Federal Register number). Rows link by `links.eo_numbers`, and every number
  is checked against the file. No EO content is copied.
- **Supreme Court key.** The Court data has justices and terms only; **no case identifiers or case
  pages**. So there is nothing to link to. Rows carry a descriptive `court_case` (name, docket, court)
  instead. No cross-links were built.
- **Country keys.** `countries` is `"all"` or an array of `country_code`s from `countries.json`,
  non-aggregate only (validated). "Most countries with exceptions" is `"all"` plus a free-text
  `scope_note`. A named group of economies is an explicit array (the section 301 forced-labor row lists
  its 59 countries plus the 27 EU member states, with a note that the EU counts as one economy).
- **Federal Register.** Document numbers are `YYYY-NNNNN` (modern) or `YY-N...` (EO data back to 1994);
  the schema accepts both. The Federal Register API (`federalregister.gov/api/v1`) is public and was
  used to read every presidential document and USTR notice cited.

## Inclusion criteria

A flag-worthy action **changes the broad tariff regime or a major trading partner's rates, or is a
court ruling on such an action**. Exclude narrow product exclusions, small adjustments, trade
agreements and purely announced-but-not-effective items (for example the September 2026
U.S.–China agreement to cut tariffs on about $60 billion of goods is announced, not in effect, so it
is not a row). Numeric rate tables are out of scope: `rate_note` carries only what the primary
source states, never a computed rate.

Priority 1 = always shown on the chart (cap `MAX_PRIORITY_1` = 10; five today, selected by the
project owner). Priority 2 = shown if there is room, or in a detail view.

## Sources hierarchy

1. **Primary:** Federal Register (presidential documents, USTR notices), whitehouse.gov, USTR,
   CBP CSMS messages, the Court's own opinion or docket (supremecourt.gov, cit.uscourts.gov).
2. **Secondary** (law-firm trackers, news): only as a cross-check or where no primary exists (for
   example a pending court case's status), marked `secondary`.
Where they disagree, trust the primary and say so in the row or in this file. Every row needs at least
one primary source; the validator enforces it.

## Effective vs announced

`date` is the **effective** date (when duties are collected on entries). `announced_date` holds the
signing or announcement date when it differs. If an action is delayed, paused or escalated within days
(the April 2025 reciprocal rates, the March 2025 Canada and Mexico tariffs), the row's date is the
date the change actually took effect, and the description says what moved. The `action_id` starts
with the effective date.

## Legal status and wording

`legal_status` is the status **as of `last_reviewed`**: `in_effect`, `in_effect_under_challenge`,
`superseded`, `terminated`, `decided` (a ruling) or `stayed`. `status_note` explains it. A pending
hearing is not an event: record it in the affected row's `status_note` until there is a decision.
Wording is neutral: state what the action is and its legal status; no adjectives and no inference
about intent or effect.

## Adding or updating a row

1. Find the primary document; read the effective date and scope in its text, not a summary.
2. Add the row to `pipeline/reference/tariff-actions.json` in date order (`action_id` =
   `<effective date>-<slug>`), list its `federal_register_documents`, and link `eo_numbers` if it is an
   order.
3. Run `pnpm exec tsx pipeline/transform/tariff-actions-run.ts`. It fails with a specific message on
   any problem (unique ids, real dates, none in the future, real country codes, a primary source,
   exactly one cut-over, priority-1 cap, sort order, EO links).
4. Update the `legal_status` of existing rows when a court rules or an action ends, and bump
   `last_reviewed`.

## What `last_reviewed` means

The date through which **a human reviewed new developments**, including manual checks for court
rulings and announcements that never appear in the Federal Register. It is not a build date.
`TARIFF_ACTIONS_STALE_DAYS` = 30: past that, the "Latest developments" list on the page hides, and
the weekly workflow `.github/workflows/tariff-actions-review.yml` opens one GitHub issue asking for a
review. An issue, not a failing build: the timeline is historical and nothing blocks. **Flags are
historical and never hide**; only the Latest developments list depends on freshness.

## Verification results, and where they differ from the leads

Every priority-1 and priority-2 row was re-read against primary text. Differences from the secondary
leads:

- **2026-02-24 termination.** Executive Order 14389 itself gives no effective date ("as soon as
  practicable"); the date comes from CBP CSMS # 67834313 (collection ends 12:00 a.m. ET on February 24).
  The Section 122 surcharge is effective February 24 (Proclamation 11012): 10 percent, 150 days.
- **2025-04-09.** The country-specific rates took effect at 12:01 a.m. on April 9 and were suspended
  from 12:01 a.m. on April 10 (EO 14266), so the row is dated **April 10**. China was set at 84 percent
  on April 9 (EO 14259) and 125 percent on April 10.
- **2025-05-12.** The China reduction was signed May 12 and took effect **May 14**.
- **2025-03-04.** Canada and Mexico took effect March 4 after a pause; the pause order is EO 14197/14198.
- **Brazil 2026.** The Section 301 tariff is **25 percent**, effective July 22, 2026 (USTR notice
  2026-14542). The "37.5 percent" lead is not a rate any action sets: it appears in the notice only as
  an illustration of a combined rate on Brazilian ethanol if other proposed actions applied.
- **Pharmaceuticals.** The authority is **Section 232** (Proclamation of April 2, 2026). The 100 percent
  duty applies from July 31, 2026 for listed companies and September 29, 2026 for others; the row is
  dated July 31.
- **Canada Section 338.** Proclamations 11046 to 11048 (alcoholic beverages, dairy, motor vehicles) were
  signed July 20; the start moved from August 19 to **August 22**; proclamations of September 8 modify
  the scope (effective September 15) and exclude certain alcoholic beverages from importation (effective
  September 29). Canada's retaliatory tariffs were not recorded.
- **CIT section 122 ruling.** Slip Op. 26-47 (May 7, 2026) grants relief to **three** plaintiffs and
  dismisses the other plaintiffs for lack of standing; there is a dissent. The Federal Circuit stay of
  June 11 is from secondary reports. The appeal outcome was not reviewed.
- **Section 301 forced-labor challenge.** Heard September 30, 2026; no ruling as of October 1. The
  docket details come from secondary reports.
