import type { Administration } from "./executive-orders-entities";
import { regionOf, REGION_IDS, type RegionId } from "./troops-regions";
import type { HistoryMeta, HistoryRow, TroopsMeta, TroopsRow } from "./troops-entities";
import { HISTORICAL_ADMINISTRATIONS } from "./troops-presidents";
import { MEASURES, type TroopsContingency, type TroopsPayload, type TroopsPeriod, type TroopsPlace, type TroopsRowTuple, type TroopsTerm, type TroopsYear } from "./troops-types";

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

/** Index (into `admins`) of the administration in office on `date` (ISO); -1 if none. */
export function termOnDate(admins: readonly { start: string; end: string | null }[], date: string): number {
  return admins.findIndex((t) => date >= t.start && (t.end === null || date <= t.end));
}

/** First year the page shows (the pipeline's June 1950 snapshot is a lone bar before the June 1953 start). */
export const PAGE_FIRST_YEAR = 1953;

export interface HistoryInput {
  rows: readonly HistoryRow[];
  meta: HistoryMeta;
}

/**
 * Location rows (Sep 2008-) + history rows (1953-2007) + presidents -> one payload. Every snapshot is a `period`; each
 * year picks its September 30 snapshot (June 30 for 1953-56; the latest quarter for the year in progress, `partial`).
 * A place that appears in both sources must agree on class and ISO3 (the names come from one canonical table family).
 */
export function buildTroopsPayload(rows: readonly TroopsRow[], meta: TroopsMeta, admins: readonly Administration[], fullHistory: HistoryInput): TroopsPayload {
  // The pipeline carries a lone June 1950 snapshot; the page starts at June 1953 (the series is continuous from there).
  const history: HistoryInput = { rows: fullHistory.rows.filter((r) => r.year >= PAGE_FIRST_YEAR), meta: { ...fullHistory.meta, years: fullHistory.meta.years.filter((y) => y.year >= PAGE_FIRST_YEAR), contingency: fullHistory.meta.contingency } };
  const periods: TroopsPeriod[] = [];
  const places: TroopsPlace[] = [];
  const placeIdx = new Map<string, number>();
  const allAdmins = [...HISTORICAL_ADMINISTRATIONS, ...admins].filter((a, i, l) => l.findIndex((b) => b.term_id === a.term_id) === i).sort((a, b) => a.start.localeCompare(b.start));
  const note = (r: { name: string; class: "host" | "territory" | "afloat_unassigned"; iso3: string | null }) => {
    const cls = r.class === "afloat_unassigned" ? "afloat" : r.class;
    const have = placeIdx.get(r.name);
    if (have !== undefined) {
      const p = places[have];
      if (p.cls !== cls || p.iso3 !== r.iso3) throw new TroopsPayloadError(`${r.name} differs between sources: ${p.cls}/${p.iso3} vs ${cls}/${r.iso3}`);
      return;
    }
    const region = regionOf(r);
    if (cls !== "territory" && region === null) throw new TroopsPayloadError(`no region for ${r.name} (${r.iso3 ?? "no ISO3"})`);
    placeIdx.set(r.name, places.length);
    places.push({ name: r.name, iso3: r.iso3, cls, region });
  };
  for (const r of history.rows) note(r);
  for (const r of rows) note(r);
  places.sort((a, b) => a.name.localeCompare(b.name));
  placeIdx.clear();
  places.forEach((p, i) => placeIdx.set(p.name, i));

  const suppressedBy = new Map<string, string[]>();
  const add = (key: string, name: string) => (suppressedBy.get(key) ?? suppressedBy.set(key, []).get(key)!).push(name);
  for (const r of history.rows) if (r.state === "suppressed") add(`h${r.year}`, r.name);
  for (const r of rows) if (r.state === "suppressed") add(r.period, r.name);

  // History snapshots first (chronological), then the location quarters.
  const histYears = history.meta.years;
  for (const y of histYears) {
    const month = y.snapshot === "june" ? "06" : "09";
    periods.push({
      period: `${y.year}-${month}`,
      source: y.source === "dmdc_309a" ? "dmdc_309a" : "troopdata",
      snapshot: y.snapshot,
      estimate: y.quality === "estimate",
      afloatIncluded: y.afloat_unassigned_total !== null,
      label: periodLabel(`${y.year}-${month}`),
      quarter: quarterOf(`${y.year}-${month}`),
      asOf: y.snapshot === "june" ? `${y.year}-06-30` : `${y.year}-09-30`,
      armyNotReported: false,
      basis: "includes_deployed",
      suppressed: suppressedBy.get(`h${y.year}`) ?? [],
      overseasGap: null,
      spaceForce: "none",
    });
  }
  for (const p of meta.periods) {
    periods.push({
      period: p.period,
      source: "dmdc_location",
      snapshot: "quarter",
      estimate: false,
      afloatIncluded: true,
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
  const nHist = histYears.length;
  const periodIdx = new Map(periods.map((p, i) => [p.period, i]));
  const histIdx = new Map(histYears.map((y, i) => [y.year, i]));

  // One bar per year: the Sep 30 table (June 30 for 1953-56); the latest year may only have an earlier quarter.
  const yearOf = (i: number) => (i < nHist ? histYears[i].year : Number(periods[i].period.slice(0, 4)) + (Number(periods[i].period.slice(5, 7)) > 9 ? 1 : 0));
  const years: TroopsYear[] = [];
  const lastYear = yearOf(periods.length - 1);
  for (const fy of [...new Set(periods.map((_, i) => yearOf(i)))].sort((a, b) => a - b)) {
    const inYear = periods.map((_, i) => i).filter((i) => yearOf(i) === fy);
    const sep = inYear.find((i) => periods[i].period.endsWith("-09") || periods[i].snapshot === "june");
    const pick = sep ?? inYear[inYear.length - 1];
    years.push({ fy, period: pick, partial: !sep && fy === lastYear, term: termOnDate(allAdmins, periods[pick].asOf) });
  }
  if (years.some((y) => y.term < 0)) throw new TroopsPayloadError("a year has no administration");
  const usedTerms = [...new Set(years.map((y) => y.term))];
  const remap = new Map(usedTerms.map((t, i) => [t, i]));
  for (const y of years) y.term = remap.get(y.term)!;
  const terms: TroopsTerm[] = usedTerms.map((ti, i) => {
    const a = allAdmins[ti];
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

  const tuples: TroopsRowTuple[] = [];
  for (const r of history.rows) {
    tuples.push([placeIdx.get(r.name)!, histIdx.get(r.year)!, r.state === "value" ? 0 : 1, r.total, r.army, r.navy, r.marine_corps, r.air_force]);
  }
  for (const r of rows) {
    const afsf = r.air_force === null ? null : r.air_force + (r.space_force ?? 0);
    tuples.push([placeIdx.get(r.name)!, periodIdx.get(r.period)!, r.state === "value" ? 0 : r.state === "suppressed" ? 1 : 2, r.total, r.army, r.navy, r.marine_corps, afsf]);
  }
  // DMDC's "in/around Iraq/Afghanistan" totals (2003-05) fill the country's otherwise suppressed row, so they draw and
  // rank like any host. They are not DMDC location-table counts: the contingency notes carry the caveat.
  for (const c of history.meta.contingency) {
    const place = placeIdx.get(c.name)!;
    const period = histIdx.get(c.year)!;
    const tuple: TroopsRowTuple = [place, period, 0, c.total, c.army, c.navy, c.marine_corps, c.air_force];
    const at = tuples.findIndex((t) => t[0] === place && t[1] === period);
    if (at >= 0) tuples[at] = tuple;
    else tuples.push(tuple);
  }
  tuples.sort((a, b) => a[1] - b[1] || a[0] - b[0]);

  const contingency: TroopsContingency[] = history.meta.contingency.map((c) => ({
    period: histIdx.get(c.year)!,
    operation: c.operation,
    place: placeIdx.get(c.name)!,
    v: [c.total, c.army, c.navy, c.marine_corps, c.air_force],
    basis: c.basis,
    rounded: c.rounded,
  }));
  if (contingency.some((c) => c.place === undefined || c.period === undefined)) throw new TroopsPayloadError("a contingency annotation points at an unknown place or year");

  return {
    places,
    periods,
    years,
    terms,
    rows: tuples,
    defaultYear: years.length - 1,
    dataThrough: meta.data_through,
    breakYear: years.findIndex((y) => periods[y.period].period >= meta.break.first_period_after),
    contingency,
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
  for (const t of payload.rows) byPeriod[t[1]].push({ place: t[0], state: t[2], v: [t[3], t[4], t[5], t[6], t[7]] });
  return { payload, byPeriod };
}

/**
 * True when a branch figure does not exist for the period: Army (and so All branches) were N/A in three 2022-23
 * quarters.
 */
export const unavailable = (data: TroopsData, m: number, pi: number) => {
  const p = data.payload.periods[pi];
  return p.armyNotReported && (m === 0 || m === 1);
};

export interface ContingencyNote {
  operation: "OIF" | "OEF";
  place: number;
  /** The figure for the selected branch (All branches = DMDC's total). */
  value: number;
  total: number;
  basis: "active_duty" | "includes_reserve_guard";
  rounded: boolean;
}

/**
 * DMDC's in/around Iraq and Afghanistan totals for period `pi` (2003-05 only), for branch measure `m`
 * `country >= 0` keeps only that place. They are already in the rows (see `buildTroopsPayload`); this only supplies the caveat (basis, rounded).
 */
export function contingencyAt(data: TroopsData, m: number, pi: number, country = -1): ContingencyNote[] {
  return data.payload.contingency
    .filter((c) => c.period === pi && (country < 0 || c.place === country))
    .map((c) => ({ operation: c.operation, place: c.place, value: c.v[m], total: c.v[0], basis: c.basis, rounded: c.rounded }));
}

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

/** One stack per year in `[ya, yb]` for branch measure `m`; `country >= 0` keeps only that place. */
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
  /** Per-branch split (army, navy, marine corps, air & space force) for the stacked bar. */
  branches: number[];
  /** The part of `value` no branch column accounts for: the whole figure when the source gives no branch split (Sep 2006-07 estimates), else a rounding-sized remainder (0 for a single branch). */
  rest: number;
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
  /** In/around Iraq and Afghanistan totals DMDC prints beside the not-reported rows (2003-05). */
  contingency: ContingencyNote[];
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
      else if (v > 0) {
        const branches = [1, 2, 3, 4].map((k) => r.v[k] ?? 0);
        ranked.push({ place: r.place, value: v, branches, rest: m === 0 ? Math.max(0, v - branches.reduce((a, b) => a + b, 0)) : 0 });
      }
    }
  } else {
    for (const r of rows) if (r.state === 1 && places[r.place].cls === "host") suppressed.push(r.place);
  }
  ranked.sort((a, b) => b.value - a.value || places[a.place].name.localeCompare(places[b.place].name));
  territories.sort((a, b) => b.value - a.value);
  const hostTotal = ranked.reduce((s, r) => s + r.value, 0);
  const territoryTotal = territories.reduce((s, t) => s + t.value, 0);
  return { ranked: ranked.map((r, i) => ({ ...r, rank: i + 1 })), suppressed, afloat, territories, territoryTotal, hostTotal, abroad: hostTotal + afloat, unavailable: un, contingency: contingencyAt(data, m, pi) };
}

export interface TopHostYear {
  /** Index into `years`. */
  yi: number;
  /** The three largest hosts for the branch measure (afloat/unassigned and territories are not hosts). */
  top: RankedPlace[];
  /** Σ of every host's figure that year: the denominator for a host's share. */
  hostTotal: number;
  unavailable: boolean;
}

/** The largest host(s) in each year of `[ya, yb]` for branch measure `m`. */
export function topHostsByYear(data: TroopsData, m: number, ya: number, yb: number): TopHostYear[] {
  const out: TopHostYear[] = [];
  for (let yi = ya; yi <= yb; yi++) {
    const v = periodView(data, m, data.payload.years[yi].period);
    out.push({ yi, top: v.ranked.slice(0, 3), hostTotal: v.hostTotal, unavailable: v.unavailable });
  }
  return out;
}

/** Consecutive years with the same No. 1 host, as `{ place, from, to }` over indices into `years` (place -1: no host that year). */
export function topHostRuns(years: readonly TopHostYear[]): { place: number; from: number; to: number }[] {
  const runs: { place: number; from: number; to: number }[] = [];
  years.forEach((y, i) => {
    const place = y.top[0]?.place ?? -1;
    const last = runs[runs.length - 1];
    if (last && last.place === place) last.to = i;
    else runs.push({ place, from: i, to: i });
  });
  return runs;
}

/**
 * Change vs the previous bar, only when it is like-for-like: adjacent years (a gap year has none), both with a figure,
 * from the same source (DMDC location, DMDC 309A, or troopdata: they differ on afloat and on 2003-05 contingency forces),
 * and on the same side of the Dec 2017 break. Null otherwise (the page says so instead of showing a misleading percentage).
 */
export function changeVsPrior(data: TroopsData, m: number, yi: number, country = -1): { prev: number; pct: number } | null {
  const prev = yi - 1;
  if (prev < 0) return null;
  const { breakYear, years, periods } = data.payload;
  if (years[yi].fy - years[prev].fy !== 1) return null;
  if (prev < breakYear && yi >= breakYear) return null;
  if (years[yi].partial || years[prev].partial) return null;
  const a = periods[years[yi].period];
  const b = periods[years[prev].period];
  if (a.source !== b.source || a.snapshot !== b.snapshot) return null;
  if (unavailable(data, m, years[yi].period) || unavailable(data, m, years[prev].period)) return null;
  const x = stackByRegion(data, m, yi, yi, country)[0].total;
  const y = stackByRegion(data, m, prev, prev, country)[0].total;
  return y > 0 ? { prev, pct: x / y - 1 } : null;
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

/** Label every `n`th calendar year on a year axis so 4-digit labels keep about 46px apart at bar spacing `step` (a few years at a time on a phone, not all). */
export { yearLabelEvery } from "./chart-bars";

export const formatCount = (n: number) => Math.round(n).toLocaleString("en-US");
export const formatCountAxis = (v: number) => (v >= 1_000_000 ? `${+(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(v));
export const formatCountCompact = (v: number) => (v >= 1_000_000 ? `${+(v / 1_000_000).toFixed(2)}M` : v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(Math.round(v)));

/** Fixed absolute bins for the map, so periods stay comparable while scrubbing. */
export const MAP_BINS = {
  labels: ["1–99", "100–999", "1,000–4,999", "5,000–19,999", "20,000+"],
  mix: [20, 38, 58, 80, 100],
  classOf(v: number): number {
    return v <= 0 ? 0 : v < 100 ? 1 : v < 1000 ? 2 : v < 5000 ? 3 : v < 20000 ? 4 : 5;
  },
};

export const BRANCH_VARS = ["--branch-army", "--branch-navy", "--branch-marine", "--branch-air-space"] as const;
export const BRANCH_NAMES = ["Army", "Navy", "Marine Corps", "Air & Space Force"] as const;

export const measureLabel = (m: number) => MEASURES[m].label;

export const regionIndex = (id: RegionId) => REGION_IDS.indexOf(id);
