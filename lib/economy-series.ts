import type { EconomyData } from "./indicator-payload";
import { dateOfDay, dayOf } from "./indicator-time";

/**
 * Per-chart point lists on the shared day axis, derived from `EconomyData`.
 * Both the chart renderers and the `<details>` table fallbacks read these, so
 * what is drawn and what is tabulated cannot drift. `value: null` is a real
 * gap (a month with no reading); renderers break the line there.
 */
export interface SeriesPoint {
  day: number;
  value: number | null;
}

export const weeklyPoints = (a: readonly [number, number][]): SeriesPoint[] => a.map(([day, value]) => ({ day, value }));

/** Monthly values plotted on the first of the month. */
export const monthlyPoints = (a: readonly (number | null)[]): SeriesPoint[] =>
  a.map((value, m) => ({ day: dayOf(1991 + Math.floor(m / 12), m % 12, 1), value }));

/** Quarterly values plotted at quarter start + 45 days (about mid-quarter). */
export const quarterlyPoints = (a: readonly (number | null)[]): SeriesPoint[] =>
  a.map((value, q) => ({ day: dayOf(1991 + Math.floor(q / 4), (q % 4) * 3, 1) + 45, value }));

/** Calendar-year values plotted at July 1. */
export const incomePoints = (inc: Readonly<Record<number, number>>): SeriesPoint[] =>
  Object.entries(inc)
    .map(([y, value]) => ({ day: dayOf(Number(y), 6, 1), value }))
    .sort((a, b) => a.day - b.day);

export interface FiscalBar {
  fy: number;
  value: number;
  /** Axis days: October 1 of the prior year through September 30 (end exclusive). */
  s: number;
  e: number;
  /** Middle of the fiscal year (April 1), where the hover dot sits. */
  mid: number;
}

export function fiscalBars(def: Readonly<Record<number, number>>): FiscalBar[] {
  return Object.entries(def)
    .map(([fy, value]) => ({
      fy: Number(fy),
      value,
      s: dayOf(Number(fy) - 1, 9, 1),
      e: dayOf(Number(fy), 9, 1),
      mid: dayOf(Number(fy), 3, 1),
    }))
    .sort((a, b) => a.fy - b.fy);
}

export function miseryPoints(d: Pick<EconomyData, "un" | "infl">): SeriesPoint[] {
  const n = Math.min(d.un.length, d.infl.length);
  const out: SeriesPoint[] = [];
  for (let m = 0; m < n; m++) {
    const u = d.un[m];
    const f = d.infl[m];
    out.push({ day: dayOf(1991 + Math.floor(m / 12), m % 12, 1), value: u == null || f == null ? null : u + f });
  }
  return out;
}

export interface YearRow {
  year: number;
  last: number;
  low: number;
  high: number;
}

/** One row per calendar year for the table fallback: last reading, low and high. */
export function yearRows(points: readonly SeriesPoint[]): YearRow[] {
  const rows = new Map<number, YearRow>();
  for (const p of points) {
    if (p.value === null) continue;
    const year = dateOfDay(p.day).year;
    const r = rows.get(year);
    if (!r) rows.set(year, { year, last: p.value, low: p.value, high: p.value });
    else {
      r.last = p.value;
      r.low = Math.min(r.low, p.value);
      r.high = Math.max(r.high, p.value);
    }
  }
  return [...rows.values()].sort((a, b) => a.year - b.year);
}
