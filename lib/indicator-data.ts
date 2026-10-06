import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  indicatorObservation,
  indicatorSeries,
  type IndicatorObservation,
  type IndicatorSeries,
} from "./indicator-entities";
import { administration } from "./executive-orders-entities";
import { congressControlFile, controlSpans } from "./congress-control";
import { buildEconomyTerms } from "./economy-presidents";
import {
  annualTuples,
  monthlySeries,
  quarterlySeries,
  recessionSpans,
  weeklyTuples,
  type EconomyPayload,
} from "./indicator-payload";
import { dayOf, dayOfIso, fiscalYearOfDay } from "./indicator-time";
import { MORTGAGE_METHOD_CHANGE } from "./indicator-entities";
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

/**
 * The economy page's client payload: every series inside the display window,
 * compacted (see `lib/indicator-payload.ts`), plus recession spans, presidential
 * terms and chamber control on the shared day axis. The axis ends on the newest
 * weekly observation (capped at September 30 of its fiscal year).
 */
export function getEconomyPayload(): EconomyPayload {
  const { series, byId } = load();
  const get = (id: string) => windowPoints(byId.get(id) ?? [], seriesOf(id).frequency);
  const newest = [...get("GASREGW"), ...get("MORTGAGE30US")].reduce((m, p) => (p.date > m ? p.date : m), "");
  // Ends at the newest weekly observation, but never past September 30 of its fiscal year.
  const span = Math.min(dayOf(fiscalYearOfDay(dayOfIso(newest)), 8, 30), dayOfIso(newest)) + 1;
  const admins = readRows("administrations.json", (r) => administration.parse(r));
  const control = congressControlFile.parse(
    JSON.parse(readFileSync(join(process.cwd(), "pipeline", "reference", "congress-control.json"), "utf8")),
  );
  return {
    span,
    gas: weeklyTuples(get("GASREGW"), 3),
    diesel: weeklyTuples(get("GASDESW"), 3),
    mort: weeklyTuples(get("MORTGAGE30US"), 2),
    jobs: monthlySeries(getJobsAdded(), 0),
    un: monthlySeries(get("UNRATE"), 1),
    infl: monthlySeries(getInflation(), 3),
    inc: annualTuples(get("MEHOINUSA672N"), 0),
    def: annualTuples(get("FYFSGDA188S"), 2),
    held: quarterlySeries(get("FYGFGDQ188S"), 2),
    tot: quarterlySeries(get("GFDEGDQ188S"), 2),
    // Full history so a run that began before the window still has its true start.
    rec: recessionSpans(byId.get("USREC") ?? []),
    terms: buildEconomyTerms(admins, span),
    control: { house: controlSpans(control.rows, "house", span), senate: controlSpans(control.rows, "senate", span) },
    mortBreak: dayOfIso(MORTGAGE_METHOD_CHANGE),
    incomeUnits: seriesOf("MEHOINUSA672N").units,
    fetchedAt: series.map((s) => s.fetched_at).sort().slice(-1)[0],
  };
}

/**
 * Presidential terms, NBER recession spans and chamber control on the shared day
 * axis, for any page whose axis ends at `span` (exclusive). The trade page reuses
 * the Economy page's era layers through this, so the two never disagree.
 */
export function getEraLayers(span: number): Pick<EconomyPayload, "rec" | "terms" | "control"> {
  const admins = readRows("administrations.json", (r) => administration.parse(r));
  const control = congressControlFile.parse(
    JSON.parse(readFileSync(join(process.cwd(), "pipeline", "reference", "congress-control.json"), "utf8")),
  );
  return {
    rec: recessionSpans(load().byId.get("USREC") ?? []),
    terms: buildEconomyTerms(admins, span),
    control: { house: controlSpans(control.rows, "house", span), senate: controlSpans(control.rows, "senate", span) },
  };
}
