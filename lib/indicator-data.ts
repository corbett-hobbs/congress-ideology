import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  indicatorObservation,
  indicatorSeries,
  type IndicatorObservation,
  type IndicatorSeries,
} from "./indicator-entities";
import {
  monthlyChange,
  windowPoints,
  yearOverYearPercent,
  type DerivedPoint,
  type Point,
} from "./indicator-derive";

/**
 * Build-time economic-indicators dataset: reads `indicator_series.json` and
 * `indicator_observations.json` (the pipeline keeps each series' full history).
 * This is the ONE place the display window (`INDICATORS_DISPLAY_START`) is
 * applied. Derived measures are computed over full history first, then
 * windowed, so the pre-window lookback is always there. Mirrors
 * `lib/executive-orders-data.ts`; pure math lives in `lib/indicator-derive.ts`.
 */

const OUT = join(process.cwd(), "pipeline", "output");

function readRows<T>(file: string, parse: (row: unknown) => T): T[] {
  return (JSON.parse(readFileSync(join(OUT, file), "utf8")) as unknown[]).map(parse);
}

let cache: { series: IndicatorSeries[]; byId: Map<string, Point[]> } | null = null;

function load() {
  if (cache) return cache;
  const series = readRows("indicator_series.json", (r) => indicatorSeries.parse(r));
  const byId = new Map<string, Point[]>();
  for (const o of readRows("indicator_observations.json", (r): IndicatorObservation => indicatorObservation.parse(r))) {
    const list = byId.get(o.series_id) ?? [];
    list.push({ date: o.date, value: o.value });
    byId.set(o.series_id, list);
  }
  for (const list of byId.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  cache = { series, byId };
  return cache;
}

export function getIndicatorSeriesList(): IndicatorSeries[] {
  return load().series;
}

function seriesOf(id: string): IndicatorSeries {
  const s = load().series.find((x) => x.series_id === id);
  if (!s) throw new Error(`unknown indicator series ${id}`);
  return s;
}

/** Raw observations for one series, inside the display window. Pass `{ fullHistory: true }` for everything ingested. */
export function getIndicatorObservations(id: string, opts: { fullHistory?: boolean } = {}): Point[] {
  const all = load().byId.get(id) ?? [];
  return opts.fullHistory ? all : windowPoints(all, seriesOf(id).frequency);
}

/** Jobs added (thousands): month-over-month change in PAYEMS, windowed. */
export function getJobsAdded(): DerivedPoint[] {
  return windowPoints(monthlyChange(load().byId.get("PAYEMS") ?? []), "monthly");
}

/** Inflation (%): year-over-year change in CPIAUCSL, windowed; null where the year-earlier month is missing. */
export function getInflation(): DerivedPoint[] {
  return windowPoints(yearOverYearPercent(load().byId.get("CPIAUCSL") ?? []), "monthly");
}
