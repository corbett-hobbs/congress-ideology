/**
 * Client-safe shapes for the "Who gets removed" card on /presidency/immigration: ICE removals by
 * country of citizenship (not destination), one fiscal year at a time. Country names are in a small
 * table and every row is three integers pointing into it. The change from the prior year is computed
 * here at the serving layer (`lib/removals-country-derive.ts`), never stored in the pipeline file.
 */

export interface RemovalsCountryRef {
  /** Trade pipeline `country_code` (or a documented user-assigned code such as XUN for Unknown). */
  key: string;
  name: string;
}

export interface RemovalsCountryYear {
  fy: number;
  /** Sum of the rows; equals the national ICE total for the year (asserted at build). */
  total: number;
  /** The data run date ICE prints for the year (ISO). */
  asOf: string;
  /** ICE document the rows were read from. */
  source: string;
  sourceUrl: string;
  /** `[countryIndex, removals, change vs. the prior fiscal year | null]`, largest first. Change is null when the prior year has no country table. */
  rows: [number, number, number | null][];
}

export interface RemovalsCountryPayload {
  /** Alphabetical; index = country id in `rows`. */
  countries: RemovalsCountryRef[];
  /** Ascending and contiguous. */
  years: RemovalsCountryYear[];
  /** Fiscal years in the national series with no ICE country table, and why. */
  uncovered: { fy: number; reason: string }[];
}
