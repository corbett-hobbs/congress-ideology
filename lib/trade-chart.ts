import { dayOf, dateOfDay, MONTH_NAMES, monthIndexOfDay } from "./indicator-time";
import type { EconomyTerm } from "./economy-presidents";
import type { Monthly } from "./trade-types";
import { balance } from "./trade-derive";

/**
 * Pure helpers for the trade-balance chart: axis days, nice y scales, money
 * formatting, and the reading for a hovered or pinned date. The chart shares
 * the Economy page's day axis (whole days since 1991-01-01), so presidential
 * terms, recession spans and chamber control line up with no conversion.
 */

export type Measure = "balance" | "flows";

export interface FlowSeries {
  exports: Monthly;
  imports: Monthly;
}

/** First day of month `i` (0 = January 1991). */
export const monthStartDay = (i: number) => dayOf(1991 + Math.floor(i / 12), ((i % 12) + 12) % 12, 1);
/** Where a month's point is drawn: mid-month. */
export const monthMidDay = (i: number) => monthStartDay(i) + 14;
/** Exclusive end of the axis: the day after the last month's last day. */
export const spanEnd = (lastMonthIndex: number) => monthStartDay(lastMonthIndex + 1);

const MINUS = "−";

/** $ millions to "$66.7B", "$1.23T", "$850M". `signed` adds "+" to positives; negatives always use a true minus. */
export function fmtMoney(millions: number, opts: { signed?: boolean } = {}): string {
  const abs = Math.abs(millions);
  const sign = millions < 0 ? MINUS : opts.signed && millions > 0 ? "+" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}T`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}B`;
  return `${sign}$${abs.toFixed(0)}M`;
}

/** Compact axis label: "$50B", "−$100B", "0". */
export function fmtTick(millions: number): string {
  if (millions === 0) return "0";
  const abs = Math.abs(millions);
  const sign = millions < 0 ? MINUS : "";
  if (abs >= 1_000_000) return `${sign}$${abs / 1_000_000}T`;
  if (abs >= 1_000) return `${sign}$${abs / 1_000}B`;
  return `${sign}$${abs}M`;
}

export interface Scale {
  lo: number;
  hi: number;
  ticks: number[];
}

/** A round-number scale covering `[min, max]` (always including 0), with about `count` ticks. */
export function niceScale(min: number, max: number, count = 4): Scale {
  const lo0 = Math.min(0, min);
  const hi0 = Math.max(0, max);
  if (hi0 === lo0) return { lo: 0, hi: 1, ticks: [0, 1] };
  const raw = (hi0 - lo0) / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const lo = Math.floor(lo0 / step) * step;
  const hi = Math.ceil(hi0 / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 1e6; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { lo, hi, ticks };
}

/** The values a measure plots: one balance line, or exports and imports. */
export function plotted(series: FlowSeries, measure: Measure): { main: Monthly; second: Monthly | null } {
  if (measure === "balance") return { main: series.exports.map((e, i) => balance(e, series.imports[i] ?? null)), second: null };
  return { main: series.exports, second: series.imports };
}

/** The y scale for the whole series (not the visible window, so zooming never rescales the axis). */
export function scaleFor(series: FlowSeries, measure: Measure): Scale {
  const { main, second } = plotted(series, measure);
  const vals = [...main, ...(second ?? [])].filter((v): v is number => v !== null);
  if (!vals.length) return { lo: 0, hi: 1, ticks: [0, 1] };
  return niceScale(Math.min(...vals), Math.max(...vals));
}

/** Index of the last month with a value, or -1. */
export function lastIndexWithData(series: FlowSeries): number {
  for (let i = Math.max(series.exports.length, series.imports.length) - 1; i >= 0; i--) {
    if (series.exports[i] != null && series.imports[i] != null) return i;
  }
  return -1;
}

export interface TradeReading {
  /** Month index (0 = Jan 1991). */
  month: number;
  label: string;
  exports: number | null;
  imports: number | null;
  balance: number | null;
}

/** The reading for an axis day (snaps to its month); null outside the series. */
export function readingAtDay(series: FlowSeries, day: number): TradeReading | null {
  if (day < 0) return null;
  const month = monthIndexOfDay(day);
  if (month >= series.exports.length) return null;
  const { year, month: m } = dateOfDay(monthStartDay(month));
  const e = series.exports[month] ?? null;
  const i = series.imports[month] ?? null;
  return { month, label: `${MONTH_NAMES[m]} ${year}`, exports: e, imports: i, balance: balance(e, i) };
}

/** The president in office on an axis day. */
export function termAtDay(terms: readonly EconomyTerm[], day: number): EconomyTerm | undefined {
  return terms.find((t) => day >= t.s && day < t.e) ?? terms[terms.length - 1];
}

/** "Obama (D)" */
export const termLabel = (t: EconomyTerm) => `${t.label} (${t.party})`;

// ------------------------------------------------------------ duty rate

/** Calculated duties over imports for consumption, in percent, per month; null where either is missing or imports are zero. */
export function ratePercentSeries(duties: Monthly, imports: Monthly): Monthly {
  return duties.map((d, i) => {
    const v = imports[i] ?? null;
    return d === null || v === null || v <= 0 ? null : (d / v) * 100;
  });
}

/** First month with a usable value, or -1. */
export const firstIndexWithValue = (s: Monthly) => s.findIndex((v) => v !== null);

/** A scale for percent values that always starts at 0. */
export function rateScale(...series: Monthly[]): Scale {
  const vals = series.flatMap((s) => s.filter((v): v is number => v !== null));
  return vals.length ? niceScale(0, Math.max(...vals)) : { lo: 0, hi: 1, ticks: [0, 1] };
}

export const fmtPercent = (p: number) => `${p.toFixed(1)}%`;
export const fmtPercentTick = (p: number) => (p === 0 ? "0" : `${p}%`);

export interface RateReading {
  month: number;
  label: string;
  /** Percent. */
  rate: number | null;
  /** Whole dollars. */
  duties: number | null;
  imports: number | null;
}

export function rateReadingAtDay(duties: Monthly, imports: Monthly, day: number): RateReading | null {
  if (day < 0) return null;
  const month = monthIndexOfDay(day);
  if (month >= duties.length) return null;
  const { year, month: m } = dateOfDay(monthStartDay(month));
  const d = duties[month] ?? null;
  const v = imports[month] ?? null;
  return { month, label: `${MONTH_NAMES[m]} ${year}`, rate: d === null || v === null || v <= 0 ? null : (d / v) * 100, duties: d, imports: v };
}

/** Whole dollars to "$85.2B"; reuses the $M formatter. */
export const fmtDollars = (dollars: number) => fmtMoney(dollars / 1e6);
