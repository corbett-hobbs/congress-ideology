import { monthIndex, periodOf, windowRate } from "./trade-derive";
import type { Monthly } from "./trade-types";

/**
 * Chart 4 model: each country's average calculated duty rate in the months before and
 * after the cut-over date from the curated tariff timeline (`is_cutover`). Pure; no React.
 *
 * Windows (docs/TRADE_METHODOLOGY.md): `WINDOW_MONTHS` full months on each side. The month
 * that CONTAINS the date is a transition (part before, part after) and is left out of both;
 * a date on the 1st has no transition month. The after-window is cut short if the data
 * ends first, and the card says so.
 */
export const WINDOW_MONTHS = 5;
/**
 * The chart shows countries whose imports for consumption were at least this much (whole
 * dollars) in each window: below it a few shipments swing a country's rate and bury the
 * large partners. Everyone stays in the table.
 */
export const MIN_WINDOW_IMPORTS = 500_000_000;

export interface BeforeAfterWindows {
  before: { from: string; to: string };
  /** Null when no full month after the date has data yet. */
  after: { from: string; to: string } | null;
  /** Months in each window as built. */
  beforeMonths: number;
  afterMonths: number;
  /** Months asked for. */
  requested: number;
}

export function beforeAfterWindows(cutoverDate: string, lastDutiesPeriod: string, months = WINDOW_MONTHS): BeforeAfterWindows {
  const [y, m, d] = cutoverDate.split("-").map(Number);
  const cut = monthIndex(`${y}-${String(m).padStart(2, "0")}`);
  const beforeEnd = cut - 1;
  const afterStart = d === 1 ? cut : cut + 1;
  const last = monthIndex(lastDutiesPeriod);
  const afterEnd = Math.min(last, afterStart + months - 1);
  const afterMonths = Math.max(0, afterEnd - afterStart + 1);
  return {
    before: { from: periodOf(beforeEnd - months + 1), to: periodOf(beforeEnd) },
    after: afterMonths ? { from: periodOf(afterStart), to: periodOf(afterEnd) } : null,
    beforeMonths: months,
    afterMonths,
    requested: months,
  };
}

export interface BeforeAfterInput {
  code: string;
  name: string;
  duties: Monthly;
  imports: Monthly;
}

export interface BeforeAfterRow {
  code: string;
  name: string;
  /** Rates as fractions; null if the window had no imports. */
  before: number | null;
  after: number | null;
  /** Percentage points, after minus before. Null unless both windows are complete. */
  changePp: number | null;
  /** Imports for consumption in each window, whole dollars. */
  imports: [number, number];
  /** Months with data in (before, after). */
  months: [number, number];
  /** Has a change to plot. */
  plotted: boolean;
  /** Plotted and at or above `MIN_WINDOW_IMPORTS` in both windows: what the chart draws. */
  material: boolean;
}

export function buildBeforeAfter(inputs: readonly BeforeAfterInput[], w: BeforeAfterWindows): BeforeAfterRow[] {
  return inputs
    .map((c): BeforeAfterRow => {
      const b = windowRate(c.duties, c.imports, w.before.from, w.before.to);
      const a = w.after ? windowRate(c.duties, c.imports, w.after.from, w.after.to) : null;
      const complete = b.months === b.span && a !== null && a.months === a.span;
      const changePp = complete && b.rate !== null && a!.rate !== null ? (a!.rate - b.rate) * 100 : null;
      const imports: [number, number] = [b.imports, a?.imports ?? 0];
      return { code: c.code, name: c.name, before: b.rate, after: a?.rate ?? null, changePp, imports, months: [b.months, a?.months ?? 0], plotted: changePp !== null, material: changePp !== null && imports[0] >= MIN_WINDOW_IMPORTS && imports[1] >= MIN_WINDOW_IMPORTS };
    })
    .sort((x, y) => x.name.localeCompare(y.name));
}

export type ChangeSort = "change" | "alpha";
export interface ChangeSortState {
  key: ChangeSort;
  reversed: boolean;
}

/**
 * "Biggest change" = largest move in either direction first (by absolute size, so a drop of
 * 8 points ranks above a rise of 3). Rows that cannot be plotted always sort last, in
 * either direction, so a missing value never tops a list. Ties break by name.
 */
export function sortBeforeAfter(rows: readonly BeforeAfterRow[], s: ChangeSortState): BeforeAfterRow[] {
  const plotted = rows.filter((r) => r.plotted);
  const rest = rows.filter((r) => !r.plotted).sort((a, b) => a.name.localeCompare(b.name));
  const cmp: Record<ChangeSort, (a: BeforeAfterRow, b: BeforeAfterRow) => number> = {
    change: (a, b) => Math.abs(b.changePp as number) - Math.abs(a.changePp as number),
    alpha: (a, b) => a.name.localeCompare(b.name),
  };
  const out = [...plotted].sort((a, b) => cmp[s.key](a, b) || a.name.localeCompare(b.name));
  return [...(s.reversed ? out.reverse() : out), ...rest];
}

/** A linear 0-based percent axis for the rows' rates, with round ticks. */
export function rateAxis(rows: readonly BeforeAfterRow[]): { max: number; ticks: number[] } {
  const hi = Math.max(0, ...rows.filter((r) => r.material).flatMap((r) => [r.before ?? 0, r.after ?? 0])) * 100;
  if (hi <= 0) return { max: 1, ticks: [0, 1] };
  const step = [1, 2, 5, 10, 20, 25, 50].find((s) => hi / s <= 5) ?? 50;
  const max = Math.ceil((hi * 1.02) / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  return { max, ticks };
}
