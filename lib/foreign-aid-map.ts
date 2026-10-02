import type { AidData } from "./foreign-aid-derive";
import { SLOT_COUNT, addCountrySlots, countryMilitary, countryValue, nonCountryValue } from "./foreign-aid-derive";
import type { WorldMapFile } from "./foreign-aid-entities";

/**
 * Pure model for the choropleth: which outlines belong to which country rows, the fixed absolute
 * bins (so years stay comparable while scrubbing), and the "not on the map" arithmetic.
 */

/** Outline key -> the country ids drawn on it (Sudan (former) and Sudan share the SDN outline). */
export function buildPathIndex(d: AidData, map: WorldMapFile): Map<string, number[]> {
  const idx = new Map(d.payload.countries.map((c, i) => [c.name, i]));
  const out = new Map<string, number[]>();
  for (const r of map.recipients) {
    const ci = idx.get(r.name);
    if (ci === undefined) throw new Error(`world map: recipient ${r.name} is not in the aid payload`);
    for (const p of r.paths) out.set(p, [...(out.get(p) ?? []), ci]);
  }
  return out;
}

/** Country ids the map cannot draw (no modern outline). */
export function undrawnCountries(d: AidData, map: WorldMapFile): number[] {
  const idx = new Map(d.payload.countries.map((c, i) => [c.name, i]));
  return map.undrawn.map((n) => idx.get(n)).filter((i): i is number => i !== undefined);
}

export interface Bins {
  /** Upper bounds of every class but the last, ascending. */
  thresholds: number[];
  labels: string[];
}

/** All sectors: <$10M … $1B+. One sector's totals are an order of magnitude smaller, so it gets lower bins. */
export const dollarBins = (sec: number): Bins =>
  sec < 0
    ? { thresholds: [1e7, 5e7, 2.5e8, 1e9], labels: ["<$10M", "$10–50M", "$50–250M", "$250M–1B", "$1B+"] }
    : { thresholds: [1e6, 5e6, 2.5e7, 1e8], labels: ["<$1M", "$1–5M", "$5–25M", "$25–100M", "$100M+"] };
export const SHARE_BINS: Bins = { thresholds: [0.25, 0.5, 0.75], labels: ["<25%", "25–50%", "50–75%", "75%+"] };
/** Percent of the base color mixed into the surface, per class (1-based). */
export const DOLLAR_MIX = [16, 34, 56, 78, 100];
export const SHARE_MIX = [26, 52, 76, 100];

/** 1-based class for a positive value; 0 for no aid (or a net-negative total). */
export function dollarClass(v: number, bins: Bins): number {
  if (!(v > 0)) return 0;
  const i = bins.thresholds.findIndex((t) => v < t);
  return i === -1 ? bins.thresholds.length + 1 : i + 1;
}

/** 1-based class for a military share; 0 when the country has no military dollars or no positive total. */
export function shareClass(v: number, m: number): number {
  if (!(v > 0) || !(m > 0)) return 0;
  const s = m / v;
  const i = SHARE_BINS.thresholds.findIndex((t) => s < t);
  return i === -1 ? SHARE_BINS.thresholds.length + 1 : i + 1;
}

export interface NodeValue {
  /** Disbursements. */
  v: number;
  /** Military subset (all military dollars for All sectors, Peace and Security's own for that sector, 0 otherwise). */
  m: number;
  /** Slots (six) for the tooltip's top sectors. */
  slots: number[];
}

/** One outline or marker: the sum over the country rows drawn on it. */
export function nodeValue(d: AidData, cis: readonly number[], yi: number, sec: number): NodeValue {
  let v = 0;
  let m = 0;
  const slots = new Array<number>(SLOT_COUNT).fill(0);
  for (const ci of cis) {
    v += countryValue(d, ci, yi, sec);
    m += countryMilitary(d, ci, yi, sec);
    addCountrySlots(slots, d, ci, yi, sec);
  }
  return { v, m, slots };
}

export interface NotOnMap {
  /** Regional and global programs. */
  programs: number;
  /** Country rows with no modern outline. */
  undrawn: number;
  /** Every country row, drawn or not. */
  countries: number;
  /** Everything: countries + programs. */
  total: number;
  /** Number of country rows with nonzero dollars. */
  countryCount: number;
}

export function notOnMap(d: AidData, undrawn: readonly number[], fy: number, sec: number): NotOnMap {
  const yi = fy - d.payload.years[0];
  let countries = 0;
  let countryCount = 0;
  for (let c = 0; c < d.nc; c++) {
    const v = countryValue(d, c, yi, sec);
    if (v !== 0) countryCount++;
    countries += v;
  }
  const programs = nonCountryValue(d, yi, sec);
  const u = undrawn.reduce((a, c) => a + countryValue(d, c, yi, sec), 0);
  return { programs, undrawn: u, countries, total: countries + programs, countryCount };
}
