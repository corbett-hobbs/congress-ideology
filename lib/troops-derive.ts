import type { Administration } from "./executive-orders-entities";
import { regionOf, REGION_IDS, type RegionId } from "./troops-regions";
import type { TroopsMeta, TroopsRow } from "./troops-entities";
import { MEASURES, type TroopsPayload, type TroopsPeriod, type TroopsPlace, type TroopsRowTuple, type TroopsTerm, type TroopsYear } from "./troops-types";

/**
 * Pure shaping for /presidency/national-security: the pipeline's rows + meta + the administrations table become one
 * dense payload (`buildTroopsPayload`), and the helpers below answer every question the page asks of it. Unit-tested
 * over the real committed files (lib/troops-derive.test.ts). Fails loudly on a host with no region.
 */

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const quarterOf = (period: string) => Number(period.slice(0, 4)) * 4 + Number(period.slice(5, 7)) / 3 - 1;
export const periodLabel = (period: string) => `${MONTH[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;

/** ISO date of the last day of an absolute quarter (the DMDC "as of" date). */
export function quarterEnd(q: number): string {
  const year = Math.floor(q / 4);
  const m = (q % 4) * 3 + 3;
  const day = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] + (m === 2 && year % 4 === 0 ? 1 : 0);
  return `${year}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export class TroopsPayloadError extends Error {}

const DAY = 86400000;
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY;

/** Index (into `admins`) of the administration in office for most of fiscal year `fy` (Oct 1 to Sep 30); -1 if none. */
export function termForFiscalYear(admins: readonly { start: string; end: string | null }[], fy: number): number {
  const a = day(`${fy - 1}-10-01`);
  const b = day(`${fy}-09-30`);
  let best = -1;
  let bestDays = 0;
  admins.forEach((t, i) => {
    const days = Math.min(b, t.end === null ? Infinity : day(t.end)) - Math.max(a, day(t.start)) + 1;
    if (days > bestDays) {
      bestDays = days;
      best = i;
    }
  });
  return best;
}

export function buildTroopsPayload(rows: readonly TroopsRow[], meta: TroopsMeta, admins: readonly Administration[]): TroopsPayload {
  const periods: TroopsPeriod[] = [];
  const places: TroopsPlace[] = [];
  const placeIdx = new Map<string, number>();
  for (const r of rows) {
    if (placeIdx.has(r.name)) continue;
    const cls = r.class === "afloat_unassigned" ? "afloat" : r.class;
    const region = regionOf(r);
    if (cls !== "territory" && region === null) throw new TroopsPayloadError(`no region for ${r.name} (${r.iso3 ?? "no ISO3"})`);
    placeIdx.set(r.name, places.length);
    places.push({ name: r.name, iso3: r.iso3, cls, region });
  }
  places.sort((a, b) => a.name.localeCompare(b.name));
  placeIdx.clear();
  places.forEach((p, i) => placeIdx.set(p.name, i));

  const used = admins.filter((a) => meta.periods.some((p) => p.as_of >= a.start && (a.end === null || p.as_of <= a.end)));
  const suppressedBy = new Map<string, string[]>();
  for (const r of rows) if (r.state === "suppressed") (suppressedBy.get(r.period) ?? suppressedBy.set(r.period, []).get(r.period)!).push(r.name);
  for (const p of meta.periods) {
    periods.push({
      period: p.period,
      label: periodLabel(p.period),
      quarter: quarterOf(p.period),
      asOf: p.as_of,
      armyNotReported: p.army_not_reported,
      basis: p.basis,
      suppressed: suppressedBy.get(p.period) ?? [],
      overseasGap: p.overseas_gap,
      spaceForce: p.space_force,
    });
  }
  const periodIdx = new Map(periods.map((p, i) => [p.period, i]));

  // Fiscal years: Sep 30 is the one table DMDC published every year; the year in progress shows its latest quarter.
  const fyOf = (period: string) => Number(period.slice(0, 4)) + (Number(period.slice(5, 7)) > 9 ? 1 : 0);
  const years: TroopsYear[] = [];
  for (const fy of [...new Set(periods.map((p) => fyOf(p.period)))].sort((a, b) => a - b)) {
    const inYear = periods.map((p, i) => ({ p, i })).filter((x) => fyOf(x.p.period) === fy);
    const sep = inYear.find((x) => x.p.period.endsWith("-09"));
    const pick = sep ?? inYear[inYear.length - 1];
    years.push({ fy, period: pick.i, partial: !sep, term: termForFiscalYear(used, fy) });
  }
  if (years.some((y) => y.term < 0)) throw new TroopsPayloadError("a fiscal year has no administration");
  const usedTerms = [...new Set(years.map((y) => y.term))];
  const remap = new Map(usedTerms.map((t, i) => [t, i]));
  for (const y of years) y.term = remap.get(y.term)!;
  const terms: TroopsTerm[] = usedTerms.map((ti, i) => {
    const a = used[ti];
    const idx = years.map((y, yi) => (y.term === i ? yi : -1)).filter((x) => x >= 0);
    return {
      termId: a.term_id,
      president: a.president,
      last: a.president.split(" ").slice(-1)[0],
      party: a.party === "Republican" ? "R" : "D",
      start: a.start,
      end: a.end,
      from: idx[0],
      to: idx[idx.length - 1],
      label: `${a.president} (${a.start.slice(0, 4)}–${a.end ? a.end.slice(0, 4) : "present"})`,
    };
  });

  const tuples: TroopsRowTuple[] = rows.map((r) => {
    const afsf = r.air_force === null ? null : r.air_force + (r.space_force ?? 0);
    return [placeIdx.get(r.name)!, periodIdx.get(r.period)!, r.state === "value" ? 0 : r.state === "suppressed" ? 1 : 2, r.total, r.army, r.navy, r.marine_corps, afsf, r.coast_guard];
  });
  tuples.sort((a, b) => a[1] - b[1] || a[0] - b[0]);

  return {
    places,
    periods,
    years,
    terms,
    rows: tuples,
    defaultYear: years.length - 1,
    dataThrough: meta.data_through,
    breakYear: years.findIndex((y) => periods[y.period].period >= meta.break.first_period_after),
    armyGapYears: years.map((y, i) => (periods[y.period].armyNotReported ? i : -1)).filter((i) => i >= 0),
  };
}

// ---------------------------------------------------------------------------------------------------------------

export interface TroopsRowDecoded {
  place: number;
  state: 0 | 1 | 2;
  /** Indexed like `MEASURES`. */
  v: (number | null)[];
}

export interface TroopsData {
  payload: TroopsPayload;
  byPeriod: TroopsRowDecoded[][];
}

export function decodeTroops(payload: TroopsPayload): TroopsData {
  const byPeriod: TroopsRowDecoded[][] = payload.periods.map(() => []);
  for (const t of payload.rows) byPeriod[t[1]].push({ place: t[0], state: t[2], v: [t[3], t[4], t[5], t[6], t[7], t[8]] });
  return { payload, byPeriod };
}

/** True when a branch figure does not exist for the period (Army, and so All branches, were N/A). */
export const unavailable = (data: TroopsData, m: number, pi: number) => data.payload.periods[pi].armyNotReported && (m === 0 || m === 1);

export interface RegionStack {
  /** Index into `years`. */
  yi: number;
  /** Index into `periods` of the snapshot drawn. */
  pi: number;
  /** Σ over hosts and afloat/unassigned, by region (suppressed rows count 0), in `REGION_IDS` order. */
  regions: number[];
  total: number;
  /** No figure exists (Army N/A for All branches / Army). */
  unavailable: boolean;
}

/** One stack per fiscal year in `[ya, yb]` for branch measure `m`; `country >= 0` keeps only that place. */
export function stackByRegion(data: TroopsData, m: number, ya: number, yb: number, country = -1): RegionStack[] {
  const out: RegionStack[] = [];
  for (let yi = ya; yi <= yb; yi++) {
    const pi = data.payload.years[yi].period;
    const regions = REGION_IDS.map(() => 0);
    const un = unavailable(data, m, pi);
    if (!un) {
      for (const r of data.byPeriod[pi]) {
        const pl = data.payload.places[r.place];
        if (pl.region === null || (country >= 0 && r.place !== country)) continue;
        if (r.state !== 1 && r.v[m] !== null) regions[REGION_IDS.indexOf(pl.region)] += r.v[m]!;
      }
    }
    out.push({ yi, pi, regions, total: regions.reduce((a, b) => a + b, 0), unavailable: un });
  }
  return out;
}

export interface RankedPlace {
  place: number;
  value: number;
  /** Per-branch split (army, navy, marine corps, air & space force, coast guard) for the stacked bar. */
  branches: number[];
  rank: number;
}

export interface PeriodView {
  ranked: RankedPlace[];
  /** Hosts blank-starred in the source this period. */
  suppressed: number[];
  afloat: number;
  territories: { place: number; value: number }[];
  territoryTotal: number;
  hostTotal: number;
  /** hosts + afloat: the "abroad" figure the bars use (Σ rows). */
  abroad: number;
  unavailable: boolean;
}

export function periodView(data: TroopsData, m: number, pi: number): PeriodView {
  const un = unavailable(data, m, pi);
  const rows = data.byPeriod[pi];
  const places = data.payload.places;
  const ranked: Omit<RankedPlace, "rank">[] = [];
  const suppressed: number[] = [];
  const territories: { place: number; value: number }[] = [];
  let afloat = 0;
  if (!un) {
    for (const r of rows) {
      const pl = places[r.place];
      const v = r.v[m];
      if (r.state === 1) {
        if (pl.cls === "host") suppressed.push(r.place);
        continue;
      }
      if (v === null) continue;
      if (pl.cls === "afloat") afloat += v;
      else if (pl.cls === "territory") territories.push({ place: r.place, value: v });
      else if (v > 0) ranked.push({ place: r.place, value: v, branches: [1, 2, 3, 4, 5].map((k) => r.v[k] ?? 0) });
    }
  } else {
    for (const r of rows) if (r.state === 1 && places[r.place].cls === "host") suppressed.push(r.place);
  }
  ranked.sort((a, b) => b.value - a.value || places[a.place].name.localeCompare(places[b.place].name));
  territories.sort((a, b) => b.value - a.value);
  const hostTotal = ranked.reduce((s, r) => s + r.value, 0);
  const territoryTotal = territories.reduce((s, t) => s + t.value, 0);
  return { ranked: ranked.map((r, i) => ({ ...r, rank: i + 1 })), suppressed, afloat, territories, territoryTotal, hostTotal, abroad: hostTotal + afloat, unavailable: un };
}

/**
 * Change vs the previous fiscal year, only when it is like-for-like: both years have a figure and sit on the same
 * side of the Dec 2017 break. Null otherwise (the page says why instead of showing a misleading percentage).
 */
export function changeVsPrior(data: TroopsData, m: number, yi: number, country = -1): { prev: number; pct: number } | null {
  const prev = yi - 1;
  if (prev < 0) return null;
  const { breakYear, years } = data.payload;
  if (prev < breakYear && yi >= breakYear) return null;
  if (years[yi].partial || years[prev].partial) return null;
  if (unavailable(data, m, years[yi].period) || unavailable(data, m, years[prev].period)) return null;
  const a = stackByRegion(data, m, yi, yi, country)[0].total;
  const b = stackByRegion(data, m, prev, prev, country)[0].total;
  return b > 0 ? { prev, pct: a / b - 1 } : null;
}

// --- axis and number formatting ----------------------------------------------------------------------------------

export function niceCountTicks(max: number): { ticks: number[]; top: number } {
  if (max <= 0) return { ticks: [0, 1], top: 1 };
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * pow).find((s) => s >= raw)!;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 1000; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { ticks, top };
}

export const formatCount = (n: number) => Math.round(n).toLocaleString("en-US");
export const formatCountAxis = (v: number) => (v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(v));
export const formatCountCompact = (v: number) => (v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(Math.round(v)));

/** Fixed absolute bins for the map, so periods stay comparable while scrubbing. */
export const MAP_BINS = {
  labels: ["1–99", "100–999", "1,000–4,999", "5,000–19,999", "20,000+"],
  mix: [20, 38, 58, 80, 100],
  classOf(v: number): number {
    return v <= 0 ? 0 : v < 100 ? 1 : v < 1000 ? 2 : v < 5000 ? 3 : v < 20000 ? 4 : 5;
  },
};

export const BRANCH_VARS = ["--branch-army", "--branch-navy", "--branch-marine", "--branch-air-space", "--branch-coast-guard"] as const;
export const BRANCH_NAMES = ["Army", "Navy", "Marine Corps", "Air & Space Force", "Coast Guard"] as const;

export const measureLabel = (m: number) => MEASURES[m].label;

export const regionIndex = (id: RegionId) => REGION_IDS.indexOf(id);
