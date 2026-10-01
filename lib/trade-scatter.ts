import { windowRate } from "./trade-derive";
import type { Monthly } from "./trade-types";
import { periodOf, monthIndex } from "./trade-derive";

/**
 * Chart 5 model: for each country, how much its calculated duty rate and its
 * imports changed between a baseline and the latest months. Pure; no React.
 *
 * Definitions (docs/TRADE_METHODOLOGY.md, "Did tariffs shift trade?"):
 * - **Latest window:** the last `LATEST_MONTHS` published months of calculated duties.
 * - **Baseline window:** the same calendar months of `BASELINE_YEAR`, so seasonality
 *   cancels (comparing Feb to Jul against a full year would not).
 * - **Rate:** total calculated duties / total imports for consumption over the window.
 *   **Imports:** imports for consumption (customs value) over the window, the same
 *   figure that is the rate's denominator. (Not the goods-file imports, which also
 *   count bonded and trade-zone entries.)
 * - A country is plotted only if every month of both windows is published.
 */
export const LATEST_MONTHS = 6;
export const BASELINE_YEAR = 2024;

export interface ScatterWindows {
  baseline: { from: string; to: string };
  latest: { from: string; to: string };
  months: number;
}

export function scatterWindows(dutiesLastPeriod: string, months = LATEST_MONTHS, baselineYear = BASELINE_YEAR): ScatterWindows {
  const end = monthIndex(dutiesLastPeriod);
  const start = end - months + 1;
  const latest = { from: periodOf(start), to: periodOf(end) };
  const shift = (p: string) => `${baselineYear}${p.slice(4)}`;
  // A window spanning New Year (Oct to Mar) lands in two calendar years: shift each end by its own year gap.
  const yearGap = Number(latest.to.slice(0, 4)) - Number(latest.from.slice(0, 4));
  const baseline = { from: `${baselineYear - yearGap}${latest.from.slice(4)}`, to: shift(latest.to) };
  return { baseline, latest, months };
}

export interface ScatterInput {
  code: string;
  name: string;
  duties: Monthly;
  imports: Monthly;
}

export interface ScatterRow {
  code: string;
  name: string;
  /** Rates as fractions (0.05 = 5%). Null when imports were zero. */
  baseRate: number | null;
  latestRate: number | null;
  /** Percentage points; null unless both rates exist and both windows are complete. */
  rateChangePp: number | null;
  baseImports: number;
  latestImports: number;
  /** Fractional change (0.1 = +10%); null unless the baseline is positive and both windows are complete. */
  importsChange: number | null;
  /** Months with data in the (baseline, latest) windows. */
  months: [number, number];
  /** True when both windows are complete and both changes exist. */
  plotted: boolean;
}

export function buildScatterRows(inputs: readonly ScatterInput[], w: ScatterWindows): ScatterRow[] {
  return inputs
    .map((c): ScatterRow => {
      const base = windowRate(c.duties, c.imports, w.baseline.from, w.baseline.to);
      const latest = windowRate(c.duties, c.imports, w.latest.from, w.latest.to);
      const complete = base.months === base.span && latest.months === latest.span;
      const rateChangePp = complete && base.rate !== null && latest.rate !== null ? (latest.rate - base.rate) * 100 : null;
      const importsChange = complete && base.imports > 0 ? latest.imports / base.imports - 1 : null;
      return {
        code: c.code,
        name: c.name,
        baseRate: base.rate,
        latestRate: latest.rate,
        rateChangePp,
        baseImports: base.imports,
        latestImports: latest.imports,
        importsChange,
        months: [base.months, latest.months],
        plotted: rateChangePp !== null && importsChange !== null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ------------------------------------------------------------------- axes

/** Imports-change axis: a symmetric-log scale in percent, floor at the −100% a country cannot go below. */
export const Y_MIN_PCT = -100;
/** Beyond this a dot is pinned to the top edge as a triangle (true value in the tooltip). */
export const Y_CAP_PCT = 1000;
/** Percent range that stays linear before the log takes over. */
export const Y_SYMLOG_CONSTANT = 50;
export const Y_TICKS_PCT = [-100, -50, 0, 50, 100, 300, 1000];

export interface ScatterAxes {
  xMin: number;
  xMax: number;
  xTicks: number[];
}

/** Rate-change axis in percentage points: covers the data to the next 5, never narrower than −5..+15. */
export function scatterAxes(rows: readonly ScatterRow[]): ScatterAxes {
  const xs = rows.filter((r) => r.plotted).map((r) => r.rateChangePp as number);
  const lo = Math.min(-5, Math.floor(Math.min(0, ...xs) / 5) * 5);
  const hi = Math.max(15, Math.ceil(Math.max(0, ...xs) / 5) * 5);
  const step = hi - lo > 30 ? 10 : 5;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
  return { xMin: lo, xMax: hi, xTicks: ticks };
}

export interface PlottedDot {
  code: string;
  /** Clamped to the axes. */
  x: number;
  yPct: number;
  /** True value was beyond an edge: draw a pinned triangle. */
  pinned: "top" | "bottom" | "left" | "right" | null;
}

export function toDot(r: ScatterRow, axes: ScatterAxes): PlottedDot | null {
  if (!r.plotted) return null;
  const x = r.rateChangePp as number;
  const yPct = (r.importsChange as number) * 100;
  const cx = Math.min(axes.xMax, Math.max(axes.xMin, x));
  const cy = Math.min(Y_CAP_PCT, Math.max(Y_MIN_PCT, yPct));
  const pinned = yPct > Y_CAP_PCT ? "top" : yPct < Y_MIN_PCT ? "bottom" : x > axes.xMax ? "right" : x < axes.xMin ? "left" : null;
  return { code: r.code, x: cx, yPct: cy, pinned };
}

// ------------------------------------------------------------------ labels

export interface LabelBox {
  id: string;
  /** Anchor in pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
}

const overlaps = (a: LabelBox, b: LabelBox) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Keeps labels in priority order, dropping any that would overlap one already
 * kept or fall outside the plot. `boxes` must come most important first.
 */
export function placeLabels(boxes: readonly LabelBox[], plotW: number, plotH: number): LabelBox[] {
  const kept: LabelBox[] = [];
  for (const b of boxes) {
    if (b.x < 0 || b.y < 0 || b.x + b.width > plotW || b.y + b.height > plotH) continue;
    if (kept.some((k) => overlaps(k, b))) continue;
    kept.push(b);
  }
  return kept;
}

/** Percent for display: "+12%", "−35%", "+21,327%". */
export function fmtPct(pct: number, digits = 0): string {
  const sign = pct < 0 ? "−" : pct > 0 ? "+" : "";
  return `${sign}${Math.abs(pct).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;
}

/** Percentage points: "+11.8 pp". */
export function fmtPp(pp: number): string {
  const sign = pp < 0 ? "−" : pp > 0 ? "+" : "";
  return `${sign}${Math.abs(pp).toFixed(1)} pp`;
}
