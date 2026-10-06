/**
 * Year-window helpers shared by the Presidency pages. A page owns one
 * `[first, last]` calendar-year window; tapping a president in the term band under
 * the slider sets it to that term's years, and the band reads it back, so the window is the
 * single source of truth (no separate "selected president" to drift from it).
 */
export type YearRange = [number, number];

/** A term's years clamped to the data: `endYear` is the year the next term begins; null = still in office. */
export function termYearRange(startYear: number, endYear: number | null, firstYear: number, lastYear: number): YearRange {
  return [Math.max(firstYear, startYear), Math.min(lastYear, endYear ?? lastYear)];
}

export const sameRange = (a: readonly [number, number], b: readonly [number, number]) => a[0] === b[0] && a[1] === b[1];
