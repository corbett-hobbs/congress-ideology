import {
  CATALOG,
  INDICATORS_DISPLAY_START,
  NOMINAL_DAYS,
  type CatalogEntry,
  type IndicatorFrequency,
  type IndicatorObservation,
  type IndicatorSeries,
  type RawFredSeries,
} from "../../lib/indicator-entities";

/**
 * Economic-indicators transform, pure logic (I/O is `indicators-run.ts`): raw
 * FRED snapshots -> `indicator_series.json` + `indicator_observations.json`.
 *
 * Raw LEVELS only. FRED's `"."` (missing) rows are skipped, never coerced to
 * 0/NaN. The full history of every series is kept; the display window is
 * applied only by the serving layer. Derived measures (jobs added, inflation)
 * live in `lib/indicator-derive.ts`, not here.
 */

export class IndicatorDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IndicatorDataError";
  }
}

const DAY = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const daysBetween = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY);

function isRealDate(d: string): boolean {
  const ms = toMs(d);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === d;
}

export function normalizeSeries(
  raw: RawFredSeries,
  entry: CatalogEntry,
): { series: IndicatorSeries; observations: IndicatorObservation[]; skippedMissing: string[] } {
  const id = entry.series_id;
  if (raw.series.id !== id) throw new IndicatorDataError(`raw/fred/${id}.json: snapshot is for series ${raw.series.id}`);
  if (!raw.series.frequency.startsWith(entry.fred_frequency_prefix)) {
    throw new IndicatorDataError(
      `${id}: FRED now reports frequency "${raw.series.frequency}", expected "${entry.fred_frequency_prefix}…" — the series was redefined; review before ingesting`,
    );
  }

  const observations: IndicatorObservation[] = [];
  const skippedMissing: string[] = [];
  for (const [date, value] of raw.observations) {
    if (!isRealDate(date)) throw new IndicatorDataError(`${id}: observation date ${date} is not a real date`);
    if (value === ".") {
      skippedMissing.push(date);
      continue;
    }
    const n = Number(value);
    if (value.trim() === "" || !Number.isFinite(n)) {
      throw new IndicatorDataError(`${id} ${date}: value ${JSON.stringify(value)} is neither a finite number nor FRED's "." for missing`);
    }
    observations.push({ series_id: id, date, value: n });
  }
  observations.sort((a, b) => a.date.localeCompare(b.date));
  if (observations.length === 0) throw new IndicatorDataError(`${id}: no valid observations`);

  const series: IndicatorSeries = {
    series_id: id,
    title: raw.series.title,
    units: raw.series.units,
    frequency: entry.frequency,
    seasonal_adjustment: raw.series.seasonal_adjustment,
    source_agency: entry.source_agency,
    first_observation: observations[0].date,
    last_observation: observations[observations.length - 1].date,
    observation_count: observations.length,
    attribution: entry.attribution,
    suggested_rollup: entry.suggested_rollup,
    caveats: entry.caveats,
    fetched_at: raw.fetched_at,
  };
  return { series, observations, skippedMissing };
}

/**
 * Coverage: the window [`windowStart`, last observation] must be covered with no
 * gap larger than twice the series' nominal frequency. The observation that
 * covers the start may be dated just before it (an annual value dated Jan 1
 * covers the whole year), so the first check is "an observation at or before the
 * start, within 2x nominal". Tail lag (the last observation being old) is
 * allowed and only reported. Returns a list of problems (empty = ok).
 */
export function checkCoverage(
  dates: readonly string[],
  frequency: IndicatorFrequency,
  windowStart: string = INDICATORS_DISPLAY_START,
): string[] {
  const limit = 2 * NOMINAL_DAYS[frequency];
  const problems: string[] = [];
  const sorted = [...dates].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || last < windowStart) {
    return [`no observations on or after the window start ${windowStart}`];
  }
  const covering = [...sorted].reverse().find((d) => d <= windowStart);
  if (!covering) {
    problems.push(`first observation ${first} is after the window start ${windowStart}`);
  } else if (daysBetween(covering, windowStart) > limit) {
    problems.push(`nearest observation at/before the window start ${windowStart} is ${covering}, ${daysBetween(covering, windowStart)} days earlier (limit ${limit})`);
  }
  let prev = covering ?? sorted.find((d) => d >= windowStart)!;
  for (const d of sorted) {
    if (d <= prev) continue;
    const gap = daysBetween(prev, d);
    if (gap > limit) problems.push(`gap of ${gap} days between ${prev} and ${d} (limit ${limit} for ${frequency})`);
    prev = d;
  }
  return problems;
}

export interface IndicatorsBuild {
  series: IndicatorSeries[];
  observations: IndicatorObservation[];
  skippedMissing: Record<string, string[]>;
}

export function buildIndicators(raws: ReadonlyMap<string, RawFredSeries>): IndicatorsBuild {
  const series: IndicatorSeries[] = [];
  const observations: IndicatorObservation[] = [];
  const skippedMissing: Record<string, string[]> = {};
  for (const entry of CATALOG) {
    const raw = raws.get(entry.series_id);
    if (!raw) throw new IndicatorDataError(`pipeline/raw/fred/${entry.series_id}.json is missing — run pnpm fetch:fred`);
    const n = normalizeSeries(raw, entry);
    series.push(n.series);
    observations.push(...n.observations);
    if (n.skippedMissing.length > 0) skippedMissing[entry.series_id] = n.skippedMissing;
  }
  return { series, observations, skippedMissing };
}

export interface IndicatorsSummary {
  lastObservation: Record<string, string>;
  counts: Record<string, number>;
}

/** Whole-output checks (used by both `pnpm transform` and `pnpm validate`). Throws on the first failure group. */
export function validateIndicators(
  series: readonly IndicatorSeries[],
  observations: readonly IndicatorObservation[],
): IndicatorsSummary {
  const known = new Set(CATALOG.map((c) => c.series_id));
  const have = new Set(series.map((s) => s.series_id));
  for (const id of known) if (!have.has(id)) throw new IndicatorDataError(`indicator_series.json is missing ${id}`);
  for (const id of have) if (!known.has(id)) throw new IndicatorDataError(`indicator_series.json has unexpected series ${id}`);

  const seen = new Set<string>();
  const byId = new Map<string, string[]>();
  for (const o of observations) {
    if (!known.has(o.series_id)) throw new IndicatorDataError(`observation for unknown series ${o.series_id}`);
    if (!Number.isFinite(o.value)) throw new IndicatorDataError(`${o.series_id} ${o.date}: value is not finite`);
    const k = `${o.series_id}|${o.date}`;
    if (seen.has(k)) throw new IndicatorDataError(`duplicate observation (${o.series_id}, ${o.date})`);
    seen.add(k);
    const list = byId.get(o.series_id) ?? [];
    list.push(o.date);
    byId.set(o.series_id, list);
  }

  const problems: string[] = [];
  const lastObservation: Record<string, string> = {};
  const counts: Record<string, number> = {};
  for (const s of series) {
    const dates = byId.get(s.series_id) ?? [];
    counts[s.series_id] = dates.length;
    if (dates.length !== s.observation_count) problems.push(`${s.series_id}: series row says ${s.observation_count} observations, file has ${dates.length}`);
    const sorted = [...dates].sort();
    if (sorted[0] !== s.first_observation || sorted[sorted.length - 1] !== s.last_observation) {
      problems.push(`${s.series_id}: first/last observation on the series row disagree with the observations file`);
    }
    lastObservation[s.series_id] = s.last_observation;
    const late = CATALOG.find((c) => c.series_id === s.series_id)?.late_start;
    for (const p of checkCoverage(dates, s.frequency, late ? s.first_observation : INDICATORS_DISPLAY_START)) problems.push(`${s.series_id}: ${p}`);
  }
  if (problems.length > 0) {
    throw new IndicatorDataError(`indicator validation failed:\n  ${problems.join("\n  ")}`);
  }
  return { lastObservation, counts };
}
