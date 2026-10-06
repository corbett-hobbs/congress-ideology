import type { RegionId } from "./troops-regions";

/**
 * Client-safe shapes for /presidency/national-security. The pipeline file is ~9.7k rows, so the page ships a dense
 * payload: places and periods are small tables and every count is a row of integers pointing into them.
 */

/** The branch filter. `air_space_force` = Air Force + Space Force, the only definition comparable across Sep 2023. */
export const MEASURES = [
  { id: "total", label: "All branches" },
  { id: "army", label: "Army" },
  { id: "navy", label: "Navy" },
  { id: "marine_corps", label: "Marine Corps" },
  { id: "air_space_force", label: "Air & Space Force" },
  { id: "coast_guard", label: "Coast Guard" },
] as const;
export type MeasureId = (typeof MEASURES)[number]["id"];

export interface TroopsPlace {
  /** Canonical name (alias table). Unique. */
  name: string;
  iso3: string | null;
  cls: "host" | "territory" | "afloat";
  /** Null for territories. */
  region: RegionId | null;
}

export interface TroopsPeriod {
  /** `YYYY-MM` quarter end. */
  period: string;
  /** "Mar 2026" */
  label: string;
  /** Absolute quarter number, `year * 4 + (month / 3 - 1)`: the chart's time axis. */
  quarter: number;
  asOf: string;
  /** Army (and so every Total column) was N/A: no all-branch or Army figure exists. */
  armyNotReported: boolean;
  /** `includes_deployed` through Sep 2017; `permanently_assigned` from Dec 2017. */
  basis: "includes_deployed" | "permanently_assigned";
  /** Overseas rows blank-starred in the source (not reported, not zero). */
  suppressed: string[];
  /** Σ overseas rows − printed overseas total (the documented exceptions); null when untestable. */
  overseasGap: number | null;
  spaceForce: "none" | "merged_into_air_force" | "separate";
}

/**
 * One bar of the page: a federal fiscal year (Oct 1 to Sep 30, labelled by the year it ends, like the other
 * Presidency pages), shown as DMDC's Sep 30 table. The year still in progress shows its latest quarter instead
 * and is `partial`.
 */
export interface TroopsYear {
  fy: number;
  /** Index into `periods` of the snapshot this year shows. */
  period: number;
  partial: boolean;
  /** Index into `terms`: the administration in office for most of the fiscal year. */
  term: number;
}

export interface TroopsTerm {
  termId: string;
  president: string;
  last: string;
  party: "D" | "R";
  start: string;
  end: string | null;
  /** First and last index into `years` assigned to this administration. */
  from: number;
  to: number;
  /** "Barack Obama (2009–2017)" */
  label: string;
}

/** `[placeIdx, periodIdx, state, total, army, navy, marineCorps, airAndSpaceForce, coastGuard]`; state 0 value, 1 suppressed, 2 null (Army N/A). */
export type TroopsRowTuple = [number, number, 0 | 1 | 2, number | null, number | null, number | null, number | null, number | null, number | null];

export interface TroopsPayload {
  places: TroopsPlace[];
  periods: TroopsPeriod[];
  years: TroopsYear[];
  terms: TroopsTerm[];
  rows: TroopsRowTuple[];
  /** Index into `years` of the latest year: the page's default. */
  defaultYear: number;
  dataThrough: string;
  /** Index into `years` of the first fiscal year (FY2018) whose snapshot counts permanent assignment only. */
  breakYear: number;
  /** Indices into `years` whose snapshot has no Army figure (none today: the three Army-N/A quarters are not September). */
  armyGapYears: number[];
}
