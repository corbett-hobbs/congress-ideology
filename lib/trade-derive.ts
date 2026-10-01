import { AXIS_START_YEAR, type Monthly, type YearPartnerRow } from "./trade-types";

/**
 * Pure math for the trade page: month-axis helpers, balance and duty rate,
 * sort comparators (every one reversible), and window means. No I/O.
 */

// ------------------------------------------------------------------ axis

/** "2026-07" -> 427 (month 0 = 1991-01). */
export function monthIndex(period: string): number {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new Error(`bad period "${period}"`);
  return (Number(m[1]) - AXIS_START_YEAR) * 12 + Number(m[2]) - 1;
}

/** 427 -> "2026-07". */
export function periodOf(index: number): string {
  const y = AXIS_START_YEAR + Math.floor(index / 12);
  return `${y}-${String(((index % 12) + 12) % 12 + 1).padStart(2, "0")}`;
}

/** Months from 1991-01 through `lastPeriod`, inclusive. */
export const monthCount = (lastPeriod: string) => monthIndex(lastPeriod) + 1;

// ----------------------------------------------------------- per-month math

/** Exports minus imports, null when either is missing. */
export function balance(exports: number | null, imports: number | null): number | null {
  return exports === null || imports === null ? null : exports - imports;
}

/** Exports plus imports, null when either is missing. */
export function totalTrade(exports: number | null, imports: number | null): number | null {
  return exports === null || imports === null ? null : exports + imports;
}

/** Calculated duties over imports for consumption; null when imports are missing or zero. */
export function dutyRate(duties: number | null, imports: number | null): number | null {
  return duties === null || imports === null || imports <= 0 ? null : duties / imports;
}

export function balanceSeries(exports: Monthly, imports: Monthly): Monthly {
  return exports.map((e, i) => balance(e, imports[i] ?? null));
}

// ----------------------------------------------------------------- windows

export interface WindowMean {
  duties: number;
  imports: number;
  /** duties / imports, null if no month in the window had both values. */
  rate: number | null;
  /** Months that contributed (both values present). */
  months: number;
  /** Months in the window, including those with no data. */
  span: number;
}

/**
 * Average duty rate over `[from, to]` (inclusive periods): total duties over total
 * imports for consumption, so big months weigh more (a mean of monthly rates would
 * not). Months where either side is null are skipped and counted in `span - months`.
 */
export function windowRate(duties: Monthly, imports: Monthly, from: string, to: string): WindowMean {
  const a = monthIndex(from);
  const b = monthIndex(to);
  if (b < a) throw new Error(`window ${from}..${to} is reversed`);
  let d = 0;
  let v = 0;
  let months = 0;
  for (let i = a; i <= b; i++) {
    const x = duties[i];
    const y = imports[i];
    if (x == null || y == null) continue;
    d += x;
    v += y;
    months++;
  }
  return { duties: d, imports: v, rate: months && v > 0 ? d / v : null, months, span: b - a + 1 };
}

/** Sum of a monthly series over a calendar year; null when no month has a value. */
export function yearSum(series: Monthly, year: number): number | null {
  let s = 0;
  let n = 0;
  for (let m = 0; m < 12; m++) {
    const v = series[(year - AXIS_START_YEAR) * 12 + m];
    if (v == null) continue;
    s += v;
    n++;
  }
  return n ? s : null;
}

// ------------------------------------------------------------------- sorts

export type PartnerSort = "balance" | "total" | "alpha";
export interface SortState {
  key: PartnerSort;
  /** True = the opposite of the default direction. */
  reversed: boolean;
}

/** Clicking the active key flips direction; clicking another key selects it in its default direction. */
export function nextSort(current: SortState, clicked: PartnerSort): SortState {
  return current.key === clicked ? { key: clicked, reversed: !current.reversed } : { key: clicked, reversed: false };
}

const exportsOf = (r: YearPartnerRow) => r[2];
const importsOf = (r: YearPartnerRow) => r[3];

/** Signed balance for a partner row. */
export const partnerBalance = (r: YearPartnerRow) => exportsOf(r) - importsOf(r);
export const partnerTotal = (r: YearPartnerRow) => exportsOf(r) + importsOf(r);

/**
 * Default directions: balance = biggest deficit first (most negative), total = largest
 * first, alpha = A to Z. Ties fall back to name so the order is stable; `reversed`
 * flips the whole order, ties included.
 */
export function sortPartners(rows: readonly YearPartnerRow[], sort: SortState): YearPartnerRow[] {
  const byName = (a: YearPartnerRow, b: YearPartnerRow) => a[1].localeCompare(b[1]);
  const primary: Record<PartnerSort, (a: YearPartnerRow, b: YearPartnerRow) => number> = {
    balance: (a, b) => partnerBalance(a) - partnerBalance(b),
    total: (a, b) => partnerTotal(b) - partnerTotal(a),
    alpha: byName,
  };
  const cmp = (a: YearPartnerRow, b: YearPartnerRow) => primary[sort.key](a, b) || byName(a, b);
  const out = [...rows].sort(cmp);
  return sort.reversed ? out.reverse() : out;
}

/**
 * Generic reversible sort for chart rows with nullable values (null always last, in
 * either direction, so a missing value never tops a list). `dir` 1 = ascending.
 */
export function sortByValue<T>(rows: readonly T[], value: (r: T) => number | null, name: (r: T) => string, dir: 1 | -1): T[] {
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x === null && y === null) return name(a).localeCompare(name(b));
    if (x === null) return 1;
    if (y === null) return -1;
    return (x - y) * dir || name(a).localeCompare(name(b));
  });
}
