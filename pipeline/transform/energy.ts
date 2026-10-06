import {
  ENERGY_CATALOG,
  ENERGY_DISPLAY_START,
  ENERGY_SEASONAL_ADJUSTMENT,
  EIA_ATTRIBUTION,
  EIA_SOURCE_AGENCY,
  type EnergyCatalogEntry,
  type EnergyObservation,
  type EnergySeries,
  type ObservationStatus,
  type RawEnergySeries,
  type StatusRule,
} from "../../lib/energy-entities";
import { checkCoverage } from "./indicators";

/**
 * Energy track transform, pure logic (I/O is `energy-run.ts`): raw EIA snapshots ->
 * `energy_series.json` + `energy_observations.json`.
 *
 * Raw LEVELS only, in the source's own units. Rows the source marks as not reported are skipped,
 * never coerced to 0/NaN; any other non-numeric string fails the build. The full history of every
 * series is kept; the display window is applied by the serving layer. Each observation carries a
 * `status` (final or preliminary) from the series' rule.
 */

export class EnergyDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnergyDataError";
  }
}

/** The only non-numeric values EIA's API returns for "no value" (seen 2026-10-06); anything else is an error. */
export const MISSING_MARKERS: ReadonlySet<string> = new Set(["Not Available", "No Data Reported", "Not Applicable", "Withheld"]);

const NUMBER = /^-?(\d+\.?\d*|\.\d+)$/;

/** A real number, or `null` for a known missing marker. Throws on anything else. */
export function parseValue(raw: string | null, where: string): number | null {
  if (raw === null) return null;
  const v = raw.trim();
  if (MISSING_MARKERS.has(v)) return null;
  if (!NUMBER.test(v)) throw new EnergyDataError(`${where}: value ${JSON.stringify(raw)} is neither a number nor a known missing marker`);
  return Number(v);
}

const DAY = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const isRealDate = (d: string) => Number.isFinite(toMs(d)) && new Date(toMs(d)).toISOString().slice(0, 10) === d;
const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;

/** `YYYY-MM` -> `YYYY-MM-01` for monthly series; weekly dates stay as published. */
export function periodToDate(period: string, frequency: "weekly" | "monthly", where: string): string {
  if (frequency === "monthly") {
    if (!/^\d{4}-\d{2}$/.test(period)) throw new EnergyDataError(`${where}: period ${period} is not YYYY-MM`);
    const d = `${period}-01`;
    if (!isRealDate(d)) throw new EnergyDataError(`${where}: period ${period} is not a real month`);
    return d;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(period) || !isRealDate(period)) throw new EnergyDataError(`${where}: period ${period} is not a real YYYY-MM-DD date`);
  return period;
}

/**
 * Whether the observation at `date` is still preliminary.
 * `lastDate` is the series' last observation; `fetchedAt` the snapshot time (so the result is
 * deterministic for a given raw file).
 */
export function statusFor(rule: StatusRule, date: string, lastDate: string, fetchedAt: string): ObservationStatus {
  switch (rule) {
    case "none":
      return "final";
    case "trailing_12_months":
      return monthIndex(date) > monthIndex(lastDate) - 12 ? "preliminary" : "final";
    case "current_and_prior_calendar_year":
      return Number(date.slice(0, 4)) >= Number(fetchedAt.slice(0, 4)) - 1 ? "preliminary" : "final";
  }
}

export function normalizeSeries(
  raw: RawEnergySeries,
  entry: EnergyCatalogEntry,
): { series: EnergySeries; observations: EnergyObservation[]; skippedMissing: string[] } {
  const id = entry.series_id;
  const where = `raw/eia/${id}.json`;
  if (raw.series.id !== id) throw new EnergyDataError(`${where}: snapshot is for series ${raw.series.id}`);
  if (raw.series.units !== entry.source_units) {
    throw new EnergyDataError(`${id}: EIA now reports units "${raw.series.units}", expected "${entry.source_units}", so the series was redefined; review before ingesting`);
  }
  if (raw.observations.length !== raw.series.total) {
    throw new EnergyDataError(`${id}: snapshot has ${raw.observations.length} rows but the API reported ${raw.series.total} (truncated fetch?)`);
  }

  const dated: { date: string; value: number }[] = [];
  const skippedMissing: string[] = [];
  for (const [period, rawValue] of raw.observations) {
    const date = periodToDate(period, entry.frequency, `${id} ${period}`);
    const value = parseValue(rawValue, `${id} ${period}`);
    if (value === null) {
      skippedMissing.push(date);
      continue;
    }
    dated.push({ date, value });
  }
  dated.sort((a, b) => a.date.localeCompare(b.date));
  if (dated.length === 0) throw new EnergyDataError(`${id}: no valid observations`);
  const first = dated[0].date;
  const last = dated[dated.length - 1].date;

  const observations: EnergyObservation[] = dated.map((o) => ({
    series_id: id,
    date: o.date,
    value: o.value,
    status: statusFor(entry.status_rule, o.date, last, raw.fetched_at),
  }));
  const series: EnergySeries = {
    series_id: id,
    title: entry.title,
    units: entry.units,
    frequency: entry.frequency,
    group: entry.group,
    tier: entry.tier,
    seasonal_adjustment: ENERGY_SEASONAL_ADJUSTMENT,
    source_agency: EIA_SOURCE_AGENCY,
    first_observation: first,
    last_observation: last,
    observation_count: dated.length,
    attribution: EIA_ATTRIBUTION,
    status_rule: entry.status_rule,
    caveats: entry.caveats,
    fetched_at: raw.fetched_at,
  };
  return { series, observations, skippedMissing };
}

export interface EnergyBuild {
  series: EnergySeries[];
  observations: EnergyObservation[];
  skippedMissing: Record<string, string[]>;
}

export function buildEnergy(raws: ReadonlyMap<string, RawEnergySeries>): EnergyBuild {
  const series: EnergySeries[] = [];
  const observations: EnergyObservation[] = [];
  const skippedMissing: Record<string, string[]> = {};
  for (const entry of ENERGY_CATALOG) {
    const raw = raws.get(entry.series_id);
    if (!raw) throw new EnergyDataError(`pipeline/raw/eia/${entry.series_id}.json is missing; run pnpm fetch:eia`);
    const n = normalizeSeries(raw, entry);
    series.push(n.series);
    observations.push(...n.observations);
    if (n.skippedMissing.length > 0) skippedMissing[entry.series_id] = n.skippedMissing;
  }
  return { series, observations, skippedMissing };
}

export interface EnergySummary {
  lastObservation: Record<string, string>;
  counts: Record<string, number>;
  preliminary: Record<string, number>;
}

/** Whole-output checks (used by both `pnpm transform` and `pnpm validate`). Throws on the first failure group. */
export function validateEnergy(series: readonly EnergySeries[], observations: readonly EnergyObservation[]): EnergySummary {
  const known = new Set(ENERGY_CATALOG.map((c) => c.series_id));
  const have = new Set(series.map((s) => s.series_id));
  for (const id of known) if (!have.has(id)) throw new EnergyDataError(`energy_series.json is missing ${id}`);
  for (const id of have) if (!known.has(id)) throw new EnergyDataError(`energy_series.json has unexpected series ${id}`);

  const seen = new Set<string>();
  const byId = new Map<string, EnergyObservation[]>();
  for (const o of observations) {
    if (!known.has(o.series_id)) throw new EnergyDataError(`observation for unknown series ${o.series_id}`);
    const k = `${o.series_id}|${o.date}`;
    if (seen.has(k)) throw new EnergyDataError(`duplicate observation (${o.series_id}, ${o.date})`);
    seen.add(k);
    const list = byId.get(o.series_id) ?? [];
    list.push(o);
    byId.set(o.series_id, list);
  }

  const problems: string[] = [];
  const lastObservation: Record<string, string> = {};
  const counts: Record<string, number> = {};
  const preliminary: Record<string, number> = {};
  for (const s of series) {
    const rows = byId.get(s.series_id) ?? [];
    const dates = rows.map((r) => r.date).sort();
    counts[s.series_id] = rows.length;
    preliminary[s.series_id] = rows.filter((r) => r.status === "preliminary").length;
    if (rows.length !== s.observation_count) problems.push(`${s.series_id}: series row says ${s.observation_count} observations, file has ${rows.length}`);
    if (dates[0] !== s.first_observation || dates[dates.length - 1] !== s.last_observation) {
      problems.push(`${s.series_id}: first/last observation on the series row disagree with the observations file`);
    }
    lastObservation[s.series_id] = s.last_observation;
    const entry = ENERGY_CATALOG.find((c) => c.series_id === s.series_id)!;
    for (const p of checkCoverage(dates, s.frequency, entry.late_start ? s.first_observation : ENERGY_DISPLAY_START)) problems.push(`${s.series_id}: ${p}`);
    // A preliminary row may never precede a final one: the tail is what is preliminary.
    const firstPrelim = rows.find((r) => r.status === "preliminary")?.date;
    if (firstPrelim && rows.some((r) => r.status === "final" && r.date > firstPrelim)) problems.push(`${s.series_id}: a final observation follows a preliminary one`);
  }
  if (problems.length > 0) throw new EnergyDataError(`energy validation failed:\n  ${problems.join("\n  ")}`);
  return { lastObservation, counts, preliminary };
}

export { DAY };
