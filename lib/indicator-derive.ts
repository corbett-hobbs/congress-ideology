import {
  INDICATORS_DISPLAY_START,
  type IndicatorFrequency,
} from "./indicator-entities";
import type { Administration } from "./executive-orders-entities";

/**
 * Pure derivations and date joins for the economic-indicators track — no file
 * I/O, no `"server-only"` (unlike `lib/indicator-data.ts`, which reads
 * `pipeline/output/*.json`), so it is unit-testable directly. Mirrors
 * `lib/wealth-derive.ts`. See docs/INDICATORS_METHODOLOGY.md.
 *
 * Derived values are computed over a series' FULL history and windowed
 * afterwards, which is why the pre-window lookback (the 12 months before the
 * window for inflation, the prior month for jobs added) is always available.
 */

export interface Point {
  date: string;
  value: number;
}
/** A derived point; `value` is null when the lookback observation does not exist (e.g. a missing month). */
export interface DerivedPoint {
  date: string;
  value: number | null;
}

/** "YYYY-MM-DD" shifted by whole calendar months (day-of-month preserved; series are dated the 1st). */
function shiftMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const idx = y * 12 + (m - 1) + months;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function derive(points: readonly Point[], lagMonths: number, f: (now: number, then: number) => number): DerivedPoint[] {
  const byDate = new Map(points.map((p) => [p.date, p.value]));
  return points.map((p) => {
    const then = byDate.get(shiftMonths(p.date, -lagMonths));
    return { date: p.date, value: then === undefined ? null : f(p.value, then) };
  });
}

/** Jobs added: month-over-month change in a level series (PAYEMS), in the series' units (thousands). Null if the prior month is missing. */
export function monthlyChange(points: readonly Point[]): DerivedPoint[] {
  return derive(points, 1, (now, then) => now - then);
}

/** Inflation: year-over-year percent change of an index (CPIAUCSL). Null if the observation 12 months earlier is missing. */
export function yearOverYearPercent(points: readonly Point[]): DerivedPoint[] {
  return derive(points, 12, (now, then) => (now / then - 1) * 100);
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/**
 * The last day of the period an observation describes (FRED dates monthly,
 * quarterly and annual values at the period START; weekly values at the week's
 * end). Used to decide whether a period overlaps the display window.
 */
export function periodEnd(date: string, frequency: IndicatorFrequency): string {
  const [y, m] = date.split("-").map(Number);
  switch (frequency) {
    case "weekly":
      return date;
    case "monthly":
      return iso(y, m, new Date(Date.UTC(y, m, 0)).getUTCDate());
    case "quarterly": {
      const endMonth = Math.floor((m - 1) / 3) * 3 + 3;
      return iso(y, endMonth, new Date(Date.UTC(y, endMonth, 0)).getUTCDate());
    }
    case "annual":
      return iso(y, 12, 31);
  }
}

/**
 * The one place the display window is applied: keep points whose period ends on
 * or after `start`. (So an annual value dated 1991-01-01 is in a window that
 * starts 1991-01-21; the 1990 value is not.)
 */
export function windowPoints<T extends { date: string }>(
  points: readonly T[],
  frequency: IndicatorFrequency,
  start: string = INDICATORS_DISPLAY_START,
): T[] {
  return points.filter((p) => periodEnd(p.date, frequency) >= start);
}

/** The first Congress whose start date is Jan 3 (the 74th, 1935-01-03, after the 20th Amendment). */
export const FIRST_JAN3_CONGRESS = 74;

/**
 * Date -> Congress number. Congress n begins January 3 of 1789 + 2(n - 1). That
 * rule only holds from the 74th Congress: earlier Congresses began March 4, so
 * dates before 1935-01-03 throw rather than silently mislabel.
 */
export function congressForDate(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`congressForDate: ${JSON.stringify(date)} is not an ISO date`);
  if (date < "1935-01-03") {
    throw new Error(`congressForDate: ${date} is before 1935-01-03; Congresses before the 74th began March 4 and are not supported`);
  }
  const year = Number(date.slice(0, 4));
  const afterJan3 = date >= `${year}-01-03`;
  const sessionYear = afterJan3 ? year : year - 1;
  const startYear = sessionYear % 2 === 1 ? sessionYear : sessionYear - 1;
  return (startYear - 1789) / 2 + 1;
}

/**
 * Fiscal-year convention (FLAGGED for human review — a convention, not a fact):
 * FRED dates fiscal year N at N-01-01; we map it to the Congress in session when
 * that fiscal year ENDS (September 30 of N). So FY2023 -> the 118th.
 */
export function congressForFiscalYear(fiscalYear: number): number {
  return congressForDate(`${fiscalYear}-09-30`);
}

/** Date -> presidential tenure (`term_id` into administrations.json), or null outside any tenure. */
export function termIdForDate(date: string, administrations: readonly Administration[]): string | null {
  const a = administrations.find((x) => x.start <= date && (x.end === null || date <= x.end));
  return a ? a.term_id : null;
}
