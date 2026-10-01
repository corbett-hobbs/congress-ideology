/**
 * Day arithmetic for the economy page. Every chart shares one time axis:
 * whole days since AXIS_START (1991-01-01, UTC), so a hovered date is a single
 * integer all nine charts agree on. Pure; no I/O.
 */
export const AXIS_START = "1991-01-01";
export const AXIS_START_YEAR = 1991;

const BASE = Date.UTC(1991, 0, 1);
const DAY = 86_400_000;

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;
export const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Day index of a calendar date (`month` is 0-based, like Date). */
export function dayOf(year: number, month: number, day: number): number {
  return Math.round((Date.UTC(year, month, day) - BASE) / DAY);
}

export function dayOfIso(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return dayOf(y, m - 1, d);
}

export function dateOfDay(day: number): { year: number; month: number; day: number } {
  const d = new Date(BASE + day * DAY);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

export function fmtDay(day: number): string {
  const { year, month, day: d } = dateOfDay(day);
  return `${MONTH_ABBR[month]} ${d}, ${year}`;
}

/** Month index since January 1991 (0 = Jan 1991). */
export function monthIndexOfDay(day: number): number {
  const { year, month } = dateOfDay(day);
  return (year - AXIS_START_YEAR) * 12 + month;
}

export function monthIndexOfIso(iso: string): number {
  const [y, m] = iso.split("-").map(Number);
  return (y - AXIS_START_YEAR) * 12 + (m - 1);
}

export function fmtMonthIndex(m: number): string {
  return `${MONTH_NAMES[((m % 12) + 12) % 12]} ${AXIS_START_YEAR + Math.floor(m / 12)}`;
}

/** Quarter index since Q1 1991. */
export function quarterIndexOfDay(day: number): number {
  const { year, month } = dateOfDay(day);
  return (year - AXIS_START_YEAR) * 4 + Math.floor(month / 3);
}

export function quarterIndexOfIso(iso: string): number {
  const [y, m] = iso.split("-").map(Number);
  return (y - AXIS_START_YEAR) * 4 + Math.floor((m - 1) / 3);
}

/** The fiscal year (the calendar year it ENDS in) a date falls in: October starts the next one. */
export function fiscalYearOfDay(day: number): number {
  const { year, month } = dateOfDay(day);
  return year + (month >= 9 ? 1 : 0);
}
