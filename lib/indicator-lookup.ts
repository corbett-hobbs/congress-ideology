import type { EconomyData } from "./indicator-payload";
import {
  dateOfDay,
  dayOf,
  fiscalYearOfDay,
  fmtDay,
  fmtMonthIndex,
  monthIndexOfDay,
  quarterIndexOfDay,
} from "./indicator-time";

/**
 * Date -> reading rules for the economy page, pure and unit-tested. A "day" is
 * an axis day (days since 1991-01-01); `null` means "no date active", which
 * returns the latest available value.
 *
 * - Weekly (gas, mortgage): the last observation on or before the date, only
 *   if within 14 days; otherwise no reading.
 * - Monthly: the exact calendar month. Missing -> no reading with a reason;
 *   after the last month -> "not yet released".
 * - Annual income: the calendar year of the date, plotted at July 1.
 * - Fiscal-year deficit: the fiscal year the date falls in (October starts the
 *   next one), plotted at its middle (April 1 of the year it ends).
 * - Quarterly debt: the calendar quarter, plotted at quarter start + 45 days.
 * - Misery index: unemployment + inflation for the same month.
 */
export interface Reading {
  value: number | null;
  /** Second series (total debt), when the chart has one. */
  value2: number | null;
  /** Axis day the dot snaps to (the series' own observation), or null with no reading. */
  snap: number | null;
  caption: string;
}

export const WEEKLY_MAX_GAP_DAYS = 14;

const none = (caption: string): Reading => ({ value: null, value2: null, snap: null, caption });
const some = (value: number, snap: number, caption: string, value2: number | null = null): Reading => ({ value, value2, snap, caption });

/** Index of the last element with `[0] <= day`, or -1. */
function lastOnOrBefore(a: readonly [number, number][], day: number): number {
  let lo = 0;
  let hi = a.length - 1;
  let r = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (a[m][0] <= day) {
      r = m;
      lo = m + 1;
    } else hi = m - 1;
  }
  return r;
}

export function readWeekly(a: readonly [number, number][], day: number | null): Reading {
  let i: number;
  if (day === null) i = a.length - 1;
  else {
    i = lastOnOrBefore(a, day);
    if (i < 0 || day - a[i][0] > WEEKLY_MAX_GAP_DAYS) return none("no reading yet");
  }
  return some(a[i][1], a[i][0], `week of ${fmtDay(a[i][0])}`);
}

function lastNonNull(a: readonly (number | null)[]): number {
  let m = a.length - 1;
  while (m > 0 && a[m] === null) m--;
  return m;
}

const monthSnap = (m: number) => dayOf(1991 + Math.floor(m / 12), m % 12, 1);

/** `why` is the reason shown for a missing month inside the series ("not collected"). */
export function readMonthly(a: readonly (number | null)[], day: number | null, why: string): Reading {
  const m = day === null ? lastNonNull(a) : monthIndexOfDay(day);
  if (m >= a.length) return none(`${fmtMonthIndex(m)} not yet released`);
  const v = a[m];
  if (v === null) return none(`${fmtMonthIndex(m)}, ${why}`);
  return some(v, monthSnap(m), fmtMonthIndex(m));
}

export function readMisery(un: readonly (number | null)[], infl: readonly (number | null)[], day: number | null): Reading {
  let m: number;
  if (day === null) {
    m = un.length - 1;
    while (m > 0 && (un[m] == null || infl[m] == null)) m--;
  } else m = monthIndexOfDay(day);
  if (m >= un.length) return none(`${fmtMonthIndex(m)} not yet released`);
  const u = un[m];
  const f = infl[m];
  if (u == null || f == null) return none(`${fmtMonthIndex(m)}, not collected`);
  return some(u + f, monthSnap(m), fmtMonthIndex(m));
}

export function readIncome(inc: Readonly<Record<number, number>>, day: number | null): Reading {
  const years = Object.keys(inc).map(Number);
  const y = day === null ? Math.max(...years) : dateOfDay(day).year;
  const v = inc[y];
  if (v === undefined) return none(`${y} not yet published`);
  return some(v, dayOf(y, 6, 1), String(y));
}

export function readFiscal(def: Readonly<Record<number, number>>, day: number | null): Reading {
  const years = Object.keys(def).map(Number);
  const fy = day === null ? Math.max(...years) : fiscalYearOfDay(day);
  const v = def[fy];
  if (v === undefined) return none(`fiscal ${fy} not yet reported`);
  return some(v, dayOf(fy, 3, 1), `fiscal ${fy}`);
}

export function readDebt(held: readonly (number | null)[], tot: readonly (number | null)[], day: number | null): Reading {
  const q = day === null ? lastNonNull(held) : quarterIndexOfDay(day);
  const qy = 1991 + Math.floor(q / 4);
  const qn = (q % 4) + 1;
  if (q >= held.length || held[q] === null) return none(`Q${qn} ${qy} not yet reported`);
  return some(held[q]!, dayOf(qy, (q % 4) * 3, 1) + 45, `held by the public, Q${qn} ${qy}`, tot[q] ?? null);
}

export type EconomyKey = "mis" | "gas" | "infl" | "jobs" | "un" | "mort" | "inc" | "def" | "debt";

/** Every chart's reading for one date (or the latest values for `null`). */
export function readAll(d: EconomyData, day: number | null): Record<EconomyKey, Reading> {
  return {
    mis: readMisery(d.un, d.infl, day),
    gas: readWeekly(d.gas, day),
    infl: readMonthly(d.infl, day, "not collected"),
    jobs: readMonthly(d.jobs, day, "no data"),
    un: readMonthly(d.un, day, "not collected"),
    mort: readWeekly(d.mort, day),
    inc: readIncome(d.inc, day),
    def: readFiscal(d.def, day),
    debt: readDebt(d.held, d.tot, day),
  };
}

/**
 * Pointer fraction across the plot (0..1) to an axis day, clamped to the last real day of the window.
 * `span` is the window's length in days and `start` its first day (0 when showing the whole axis).
 */
export function dayFromFraction(frac: number, span: number, start = 0): number {
  return Math.min(start + span - 1, Math.max(start, start + Math.round(frac * span)));
}
