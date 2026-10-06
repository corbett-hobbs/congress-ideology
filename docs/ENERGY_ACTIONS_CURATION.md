# Energy actions: curation guide

The Energy page's flags read a hand-curated timeline: `pipeline/reference/energy-actions.json` (curated) ->
`pipeline/output/energy_actions.json` (validated, sorted). Schema and the stale-review threshold: `lib/energy-actions-entities.ts`;
validation: `pipeline/transform/energy-actions.ts`. Nothing here is fetched. Pattern and rules follow `docs/TARIFF_ACTIONS_CURATION.md`.

## Inclusion criteria

A row is one dated action by a government actor that bears on a series in the energy catalog (or is a plain event marker with `series: []`):
SPR releases, sales, exchanges and refills; permits and pipeline decisions; LNG export decisions; treaty entry and exit; energy statutes
and executive orders. Aim for the actions a reader would expect to see, not every order.

## Rules

1. **A primary source that was actually fetched on every row** (Federal Register, govinfo, congress.gov, DOE, the White House archives, the
   UN Treaty Collection). A secondary source (for example a CRS report) can sit beside it but never alone (`kind: "secondary"`; the validator
   requires at least one primary).
2. **Say only what the source says.** If the page gives a year but not a day, the row waits until the day is verified. The SPR rows say
   *sale*, *exchange* or *mixed* explicitly (`release_sale`, `release_exchange`, `release_mixed`), because a sale and an exchange are
   different actions (an exchange is repaid with a premium).
3. **Authority type is explicit:** `executive`, `congressional`, `agency` or `court`. A statute is `congressional` even when the President signed it.
4. **Dates.** `date` is the effective date; `announced_date` holds the signing, announcement or notification date when it differs (the
   Paris exits: notified a year before they take effect). Dates are never in the future.
5. **`lagged_effect: true`** where the enabling act precedes the market by years (crude export repeal, LNG decisions, energy tax credits).
   The UI must say "enabled", never "caused", on those flags.
6. **Priority.** `flag_priority` 1 is always drawn and is capped at 10 rows; 2 is drawn where there is room.
7. **Links.** `links.eo_numbers` points at `executive_orders.json` (every number is checked); content is not copied.
8. **Bump `last_reviewed`** whenever you have checked for new actions. A weekly workflow
   (`.github/workflows/energy-actions-review.yml`) opens one issue when it is more than 30 days old; it never blocks a deploy.

## Not yet curated (needs a primary-source fetch first)

- SPR actions with only a year on DOE's history page: Hurricane Katrina exchange (2005), Libya IEA sale (2011); and the January 1991 Desert Storm
  sale (before the display window starts on 1991-01-21; the day is not on the page).
- The 2023-2025 refill solicitations (DOE press releases exist; none fetched).
- Keystone XL's cancellation by the developer (2021), and the March 23, 2017 presidential permit (date known only from the 2019 permit text).
- The 1 million barrels per day rate of the 2022 release (the March 31, 2022 White House fact sheet could not be fetched).
- Delivery progress of the 2026 exchange (reported by news; no DOE page fetched).
