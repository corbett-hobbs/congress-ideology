import type { ControlSpan } from "./congress-control";
import type { EconomyTerm } from "./economy-presidents";
import {
  AXIS_START_YEAR,
  dayOfIso,
  dayOf,
  monthIndexOfIso,
  quarterIndexOfIso,
} from "./indicator-time";
import type { DerivedPoint, Point } from "./indicator-derive";

/**
 * The economy page's client payload and its codec — pure, no `server-only`, so
 * it is unit-testable. Mirrors `toWealthPayload` / `fromWealthPayload` in
 * `lib/wealth-derive.ts`: the wire shape is compact tuples; the decoded shape
 * (`EconomyData`) is what charts and `lib/indicator-lookup.ts` read.
 *
 * Time axis: whole days since 1991-01-01. Weekly series are `[day, value]`;
 * monthly and quarterly series are fixed-index arrays (month 0 = Jan 1991,
 * quarter 0 = Q1 1991) with `null` for a missing period; annual series are
 * `[year, value]` pairs. An index at or past an array's length means "not yet
 * released".
 */

export type Weekly = [day: number, value: number][];
export type Annual = [year: number, value: number][];

export interface EconomyPayload {
  span: number;
  gas: Weekly;
  /** Retail diesel; starts 1994-03-28, so it begins later than `gas`. */
  diesel: Weekly;
  mort: Weekly;
  jobs: (number | null)[];
  un: (number | null)[];
  infl: (number | null)[];
  inc: Annual;
  def: Annual;
  held: (number | null)[];
  tot: (number | null)[];
  /** `[firstDay, endDayExclusive]` of NBER recessions, in axis days (the first may start before 0). */
  rec: [number, number][];
  terms: EconomyTerm[];
  control: { house: ControlSpan[]; senate: ControlSpan[] };
  /** Axis day of the Freddie Mac survey-method change. */
  mortBreak: number;
  incomeUnits: string;
  /** Fetch date of the data (ISO), for the "latest revised" line. */
  fetchedAt: string;
}

export interface EconomyData extends Omit<EconomyPayload, "inc" | "def"> {
  inc: Record<number, number>;
  def: Record<number, number>;
}

export function fromEconomyPayload(p: EconomyPayload): EconomyData {
  return { ...p, inc: Object.fromEntries(p.inc), def: Object.fromEntries(p.def) };
}

export function toEconomyPayload(d: EconomyData): EconomyPayload {
  const pairs = (r: Record<number, number>): Annual =>
    Object.entries(r)
      .map(([k, v]): [number, number] => [Number(k), v])
      .sort((a, b) => a[0] - b[0]);
  return { ...d, inc: pairs(d.inc), def: pairs(d.def) };
}

const round = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp;

/** Weekly points to `[day, value]`, dropping anything before the axis. */
export function weeklyTuples(points: readonly Point[], dp: number): Weekly {
  return points.map((p): [number, number] => [dayOfIso(p.date), round(p.value, dp)]).filter(([d]) => d >= 0);
}

/** Monthly or quarterly points to a fixed-index array; gaps and unreadable values are `null`. */
export function indexedSeries(
  points: readonly (Point | DerivedPoint)[],
  indexOf: (iso: string) => number,
  dp: number,
): (number | null)[] {
  const out: (number | null)[] = [];
  for (const p of points) {
    const i = indexOf(p.date);
    if (i < 0) continue;
    while (out.length <= i) out.push(null);
    out[i] = p.value === null ? null : round(p.value, dp);
  }
  return out;
}

export const monthlySeries = (points: readonly (Point | DerivedPoint)[], dp: number) => indexedSeries(points, monthIndexOfIso, dp);
export const quarterlySeries = (points: readonly (Point | DerivedPoint)[], dp: number) => indexedSeries(points, quarterIndexOfIso, dp);

/**
 * Annual points keyed by year. `shift` maps FRED's date year to the plotted
 * year: 0 for calendar-year income (dated Jan 1 of the year earned), 0 for the
 * fiscal-year deficit too (FRED dates FY N at N-01-01, i.e. the year it ENDS).
 */
export function annualTuples(points: readonly Point[], dp: number): Annual {
  return points
    .map((p): [number, number] => [Number(p.date.slice(0, 4)), round(p.value, dp)])
    .filter(([y]) => y >= AXIS_START_YEAR);
}

/**
 * Contiguous runs of USREC = 1. A run covers the first month through the end
 * of the last month (end exclusive = first day of the following month).
 * Runs ending before the axis starts are dropped.
 */
export function recessionSpans(usrec: readonly Point[]): [number, number][] {
  const sorted = [...usrec].sort((a, b) => a.date.localeCompare(b.date));
  const out: [number, number][] = [];
  let start: string | null = null;
  let last: string | null = null;
  const nextMonthDay = (iso: string) => {
    const [y, m] = iso.split("-").map(Number);
    return dayOf(y, m, 1); // month is 1-based here, so this is the first day of the NEXT month
  };
  const flush = () => {
    if (start !== null && last !== null) {
      const e = nextMonthDay(last);
      if (e > 0) out.push([dayOfIso(start), e]);
    }
    start = last = null;
  };
  for (const p of sorted) {
    if (p.value === 1) {
      if (start === null) start = p.date;
      last = p.date;
    } else flush();
  }
  flush();
  return out;
}

/** "1990–91", "2001", "2007–09": the calendar years a recession span touches. */
export function recessionLabel(span: readonly [number, number], dateOfDayFn: (d: number) => { year: number }): string {
  const a = dateOfDayFn(span[0]).year;
  const b = dateOfDayFn(span[1] - 1).year;
  return a === b ? String(a) : `${a}–${String(b).slice(2)}`;
}
