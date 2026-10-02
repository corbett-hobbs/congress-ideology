import type { Administration } from "./executive-orders-entities";
import type { AidMeta, AidRow } from "./foreign-aid-entities";
import { AidDataError } from "./foreign-aid-entities";
import type { AidCountryRef, AidPayload, AidTerm } from "./foreign-aid-types";

/**
 * Pure shaping and arithmetic for /presidency/foreign-aid. No file I/O (the reader is
 * `lib/foreign-aid-data.ts`), so it is unit-tested over the real committed files.
 *
 * Every function takes the decoded `AidData` plus an index filter: `ci` is a country id
 * (-1 = all countries, regional and global programs included) and `sec` is a sector id
 * (-1 = all sectors). Dollars are exact nominal disbursements; negatives are kept as
 * published (the source documents them as recoveries/adjustments) and only clamped where a
 * chart cannot draw them.
 */

/** Source sector names in display order. The first five get their own color; the rest share one. */
export const SECTOR_ORDER = [
  "Peace and Security",
  "Health",
  "Humanitarian Assistance",
  "Economic Development",
  "Program Support",
  "Multi-sector",
  "Democracy, Human Rights, and Governance",
  "Education and Social Services",
  "Environment",
] as const;

/** Sentence-case labels for the page; the source names stay the data keys. */
export const SECTOR_LABEL: Record<(typeof SECTOR_ORDER)[number], string> = {
  "Peace and Security": "Peace and security",
  Health: "Health",
  "Humanitarian Assistance": "Humanitarian assistance",
  "Economic Development": "Economic development",
  "Program Support": "Program support",
  "Multi-sector": "Multi-sector",
  "Democracy, Human Rights, and Governance": "Democracy, human rights, and governance",
  "Education and Social Services": "Education and social services",
  Environment: "Environment",
};

/** Chart slots: five colored sectors plus one neutral "All other". */
export const SLOT_COUNT = 6;
export const SLOT_OTHER = 5;
export const SLOT_NAME = ["Peace and security", "Health", "Humanitarian", "Economic development", "Program support", "All other sectors"] as const;
/** CSS custom property (see app/globals.css) behind each slot. */
export const SLOT_VAR = ["--sector-ps", "--sector-health", "--sector-hum", "--sector-econ", "--sector-prog", "--sector-other"] as const;
/** Sector id -> chart slot. */
export const slotOfSector = (si: number) => (si < SLOT_OTHER ? si : SLOT_OTHER);
/** Sector id of Peace and Security, where almost all military assistance sits. */
export const SECTOR_PEACE = 0;

/** Decoded, indexable view of an `AidPayload`. */
export interface AidData {
  payload: AidPayload;
  nc: number;
  ny: number;
  ns: number;
  /** `[(country * ny + year) * ns + sector]` */
  disb: Float64Array;
  mil: Float64Array;
  /** Regional and global programs: `[year * ns + sector]` */
  non: Float64Array;
}

export function decodeAid(p: AidPayload): AidData {
  const nc = p.countries.length;
  const ny = p.years.length;
  const ns = p.sectors.length;
  const disb = new Float64Array(nc * ny * ns);
  const mil = new Float64Array(nc * ny * ns);
  const non = new Float64Array(ny * ns);
  for (const [c, y, s, d, m] of p.rows) {
    const i = (c * ny + y) * ns + s;
    disb[i] = d;
    mil[i] = m;
  }
  for (const [y, s, d] of p.nonCountry) non[y * ns + s] = d;
  return { payload: p, nc, ny, ns, disb, mil, non };
}

/* ---------------------------------------------------------------- building the payload */

const isoDay = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

/** The administration in office for most of fiscal year `fy` (Oct 1 of fy-1 through Sep 30). */
export function administrationForFiscalYear(fy: number, admins: readonly Administration[]): Administration {
  const from = isoDay(`${fy - 1}-10-01`);
  const to = isoDay(`${fy}-09-30`);
  let best: Administration | null = null;
  let bestDays = 0;
  for (const a of admins) {
    const days = Math.min(to, a.end === null ? to : isoDay(a.end)) - Math.max(from, isoDay(a.start)) + 1;
    if (days > bestDays) {
      best = a;
      bestDays = days;
    }
  }
  if (!best) throw new AidDataError(`No administration covers FY${fy}`);
  return best;
}

export function buildAidTerms(admins: readonly Administration[], years: readonly number[]): AidTerm[] {
  const byTerm = new Map<string, number[]>();
  for (const fy of years) {
    const id = administrationForFiscalYear(fy, admins).term_id;
    byTerm.set(id, [...(byTerm.get(id) ?? []), fy]);
  }
  return admins
    .filter((a) => byTerm.has(a.term_id))
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((a) => {
      const fys = byTerm.get(a.term_id)!;
      const last = a.president.split(" ").pop() ?? a.president;
      const startYear = Number(a.start.slice(0, 4));
      const endYear = a.end === null ? null : Number(a.end.slice(0, 4)) + 1;
      return {
        termId: a.term_id,
        president: a.president,
        last,
        party: a.party === "Democratic" ? "D" : "R",
        fromFy: Math.min(...fys),
        toFy: Math.max(...fys),
        label: `${a.president} (${startYear}–${endYear ?? "present"})`,
      };
    });
}

/** Latest fiscal year not flagged partial: the page's default. Derived, never hardcoded. */
export function latestCompleteFiscalYear(meta: Pick<AidMeta, "years">): number {
  const complete = meta.years.filter((y) => !y.is_partial).map((y) => y.fiscal_year);
  if (!complete.length) throw new AidDataError("foreign_assistance_meta.json has no complete fiscal year");
  return Math.max(...complete);
}

/**
 * Pivots the pipeline rows into the page payload. Fails with a specific message when the
 * file stops matching what the page was built around (a new sector, a gap in the years,
 * a duplicate row, a country row with no name).
 */
export function buildAidPayload(rows: readonly AidRow[], meta: AidMeta, admins: readonly Administration[]): AidPayload {
  const sectors = [...SECTOR_ORDER] as string[];
  const unknown = meta.sector_categories.filter((s) => !sectors.includes(s));
  if (unknown.length) throw new AidDataError(`foreign assistance: unknown sector(s) ${unknown.join("; ")}; add them to SECTOR_ORDER and decide their chart slot`);
  const missing = sectors.filter((s) => !meta.sector_categories.includes(s));
  if (missing.length) throw new AidDataError(`foreign assistance: sector(s) ${missing.join("; ")} are no longer in the data`);

  const years = meta.years.map((y) => y.fiscal_year);
  years.forEach((y, i) => {
    if (i > 0 && y !== years[i - 1] + 1) throw new AidDataError(`foreign assistance: fiscal years are not contiguous at FY${y}`);
  });
  if (years[0] !== meta.first_fiscal_year || years[years.length - 1] !== meta.latest_fiscal_year) throw new AidDataError("foreign assistance: meta years do not match first/latest fiscal year");

  const yearIdx = new Map(years.map((y, i) => [y, i]));
  const sectorIdx = new Map(sectors.map((s, i) => [s, i]));
  const countryNames = [...new Set(rows.filter((r) => r.recipient_type === "country").map((r) => r.recipient_name))].sort((a, b) => a.localeCompare(b));
  const countryIdx = new Map(countryNames.map((n, i) => [n, i]));
  const keyOf = new Map<string, string | null>();
  for (const r of rows) if (r.recipient_type === "country") keyOf.set(r.recipient_name, r.country_key);
  const countries: AidCountryRef[] = countryNames.map((name) => ({ name, key: keyOf.get(name) ?? null }));

  const seen = new Set<string>();
  const out: AidPayload["rows"] = [];
  const nonAcc = new Map<number, number>();
  for (const r of rows) {
    const y = yearIdx.get(r.fiscal_year);
    const s = sectorIdx.get(r.sector_category);
    if (y === undefined) throw new AidDataError(`foreign assistance: row for FY${r.fiscal_year} is outside the meta years`);
    if (s === undefined) throw new AidDataError(`foreign assistance: row with unknown sector ${r.sector_category}`);
    const dup = `${r.recipient_type}|${r.recipient_name}|${y}|${s}`;
    if (seen.has(dup)) throw new AidDataError(`foreign assistance: duplicate row ${dup}`);
    seen.add(dup);
    if (r.recipient_type === "country") {
      if (r.disbursements_usd === 0 && r.military_disbursements_usd === 0) continue;
      out.push([countryIdx.get(r.recipient_name)!, y, s, r.disbursements_usd, r.military_disbursements_usd]);
    } else if (r.disbursements_usd !== 0) {
      const k = y * sectors.length + s;
      nonAcc.set(k, (nonAcc.get(k) ?? 0) + r.disbursements_usd);
    }
  }
  out.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const nonCountry: AidPayload["nonCountry"] = [...nonAcc.entries()]
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => [Math.floor(k / sectors.length), k % sectors.length, v] as [number, number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  return {
    sectors,
    years,
    partialYears: meta.years.filter((y) => y.is_partial).map((y) => y.fiscal_year),
    defaultYear: latestCompleteFiscalYear(meta),
    dataThrough: meta.data_through,
    countries,
    rows: out,
    nonCountry,
    terms: buildAidTerms(admins, years),
  };
}

/* ---------------------------------------------------------------- queries */

const at = (d: AidData, ci: number, yi: number) => (ci * d.ny + yi) * d.ns;

/** One country's disbursements in a year (one sector, or all when `sec` = -1). */
export function countryValue(d: AidData, ci: number, yi: number, sec: number): number {
  const b = at(d, ci, yi);
  if (sec >= 0) return d.disb[b + sec];
  let t = 0;
  for (let s = 0; s < d.ns; s++) t += d.disb[b + s];
  return t;
}

/**
 * Military assistance for the map's share view. All sectors: every military dollar. Peace and
 * Security: only that sector's own rows. Any other sector: 0. About $4.6B of ~$300B military
 * dollars is recorded under other sectors; "All" counts it, Peace and Security does not
 * (docs/FOREIGN_AID_METHODOLOGY.md).
 */
export function countryMilitary(d: AidData, ci: number, yi: number, sec: number): number {
  const b = at(d, ci, yi);
  if (sec === SECTOR_PEACE) return d.mil[b + SECTOR_PEACE];
  if (sec > 0) return 0;
  let t = 0;
  for (let s = 0; s < d.ns; s++) t += d.mil[b + s];
  return t;
}

/** The map's military-share view only makes sense where military dollars are counted. */
export const militaryShareAvailable = (sec: number) => sec <= SECTOR_PEACE;

/** Dollars to regional and global programs in a year. */
export function nonCountryValue(d: AidData, yi: number, sec: number): number {
  const b = yi * d.ns;
  if (sec >= 0) return d.non[b + sec];
  let t = 0;
  for (let s = 0; s < d.ns; s++) t += d.non[b + s];
  return t;
}

/** Adds one country-year's disbursements into the six chart slots. */
export function addCountrySlots(out: number[], d: AidData, ci: number, yi: number, sec: number): void {
  const b = at(d, ci, yi);
  if (sec >= 0) out[slotOfSector(sec)] += d.disb[b + sec];
  else for (let s = 0; s < d.ns; s++) out[slotOfSector(s)] += d.disb[b + s];
}

export function addNonCountrySlots(out: number[], d: AidData, yi: number, sec: number): void {
  const b = yi * d.ns;
  if (sec >= 0) out[slotOfSector(sec)] += d.non[b + sec];
  else for (let s = 0; s < d.ns; s++) out[slotOfSector(s)] += d.non[b + s];
}

export interface SpendingYear {
  fy: number;
  yi: number;
  slots: number[];
  /** Net total, negatives included. */
  total: number;
  /** Sum of the positive slots: the height the bar is drawn to. */
  drawn: number;
}

/** Stacked totals per fiscal year. `ci` = -1: every country plus regional and global programs. */
export function spendingByYear(d: AidData, fromFy: number, toFy: number, ci: number, sec: number): SpendingYear[] {
  const out: SpendingYear[] = [];
  for (let fy = fromFy; fy <= toFy; fy++) {
    const yi = fy - d.payload.years[0];
    const slots = new Array<number>(SLOT_COUNT).fill(0);
    if (ci >= 0) addCountrySlots(slots, d, ci, yi, sec);
    else {
      for (let c = 0; c < d.nc; c++) addCountrySlots(slots, d, c, yi, sec);
      addNonCountrySlots(slots, d, yi, sec);
    }
    out.push({ fy, yi, slots, total: slots.reduce((a, b) => a + b, 0), drawn: slots.reduce((a, b) => a + Math.max(0, b), 0) });
  }
  return out;
}

/** The year's all-countries (or one country's) net total. */
export function yearTotal(d: AidData, fy: number, ci: number, sec: number): number {
  return spendingByYear(d, fy, fy, ci, sec)[0].total;
}

/**
 * Percent change from the prior fiscal year, or null when it isn't comparable: the first
 * year, a partial year (either side), or a prior total of zero.
 */
export function changeVsPrior(d: AidData, fy: number, ci: number, sec: number): number | null {
  if (!changeAvailable(d, fy)) return null;
  const prev = yearTotal(d, fy - 1, ci, sec);
  if (prev <= 0) return null;
  return (yearTotal(d, fy, ci, sec) - prev) / prev;
}

/** "Change vs. prior year" is disabled for FY2001 (no prior year) and for any partial year. */
export function changeAvailable(d: AidData, fy: number): boolean {
  return fy > d.payload.years[0] && !d.payload.partialYears.includes(fy) && !d.payload.partialYears.includes(fy - 1);
}

export interface RankedCountry {
  ci: number;
  value: number;
  /** Chart slots (six), for the sector-split bar. */
  slots: number[];
  /** Change in dollars from the prior full year; null when not comparable. */
  delta: number | null;
  /** 1-based rank by total, among countries with a nonzero total. */
  rank: number;
}

/** Every country with a nonzero total in the year, ranked by total (largest first). */
export function rankCountries(d: AidData, fy: number, sec: number): RankedCountry[] {
  const yi = fy - d.payload.years[0];
  const comparable = changeAvailable(d, fy);
  const items: RankedCountry[] = [];
  for (let c = 0; c < d.nc; c++) {
    const value = countryValue(d, c, yi, sec);
    if (value === 0) continue;
    const slots = new Array<number>(SLOT_COUNT).fill(0);
    addCountrySlots(slots, d, c, yi, sec);
    items.push({ ci: c, value, slots, delta: comparable ? value - countryValue(d, c, yi - 1, sec) : null, rank: 0 });
  }
  items.sort((a, b) => b.value - a.value || a.ci - b.ci);
  items.forEach((it, i) => (it.rank = i + 1));
  return items;
}

export interface TopYear {
  fy: number;
  /** Positive-total countries, largest first. */
  ranked: { ci: number; value: number }[];
  /** Country-attributed positive dollars. */
  countryTotal: number;
  topSlots: number[];
}

/** The No. 1 recipient country per fiscal year (countries only; regional and global programs never rank). */
export function topRecipientsByYear(d: AidData, fromFy: number, toFy: number, sec: number): TopYear[] {
  const out: TopYear[] = [];
  for (let fy = fromFy; fy <= toFy; fy++) {
    const yi = fy - d.payload.years[0];
    const ranked: TopYear["ranked"] = [];
    let countryTotal = 0;
    for (let c = 0; c < d.nc; c++) {
      const value = countryValue(d, c, yi, sec);
      if (value > 0) {
        ranked.push({ ci: c, value });
        countryTotal += value;
      }
    }
    ranked.sort((a, b) => b.value - a.value || a.ci - b.ci);
    const topSlots = new Array<number>(SLOT_COUNT).fill(0);
    if (ranked[0]) addCountrySlots(topSlots, d, ranked[0].ci, yi, sec);
    out.push({ fy, ranked, countryTotal, topSlots });
  }
  return out;
}

export interface TopRun {
  /** Country id, or -1 where no country had positive aid. */
  ci: number;
  /** Index range into the years array, inclusive. */
  from: number;
  to: number;
}

/** Consecutive years with the same No. 1 collapsed into runs. */
export function topRuns(years: readonly TopYear[]): TopRun[] {
  const runs: TopRun[] = [];
  years.forEach((y, i) => {
    const ci = y.ranked[0]?.ci ?? -1;
    const last = runs[runs.length - 1];
    if (last && last.ci === ci) last.to = i;
    else runs.push({ ci, from: i, to: i });
  });
  return runs;
}

/* ---------------------------------------------------------------- formatting */

/** `$6.8B`, `$450M`, `$4.3M`, `$12K`, `−$1.2M` (true minus). */
export function formatAidMoney(v: number, signed = false): string {
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : signed && v > 0 ? "+" : "";
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e7) return `${sign}$${Math.round(a / 1e6)}M`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)}K`;
  return `${sign}$${Math.round(a)}`;
}

/** Axis tick label: `$0`, `$20B`, `$2.5M`, `$500K`. */
export function formatAidAxis(v: number): string {
  if (v === 0) return "$0";
  const trim = (n: number) => String(+n.toFixed(2));
  if (v >= 1e9) return `$${trim(v / 1e9)}B`;
  if (v >= 1e6) return `$${trim(v / 1e6)}M`;
  return `$${trim(v / 1e3)}K`;
}

/** About four nice ticks covering `max` (1, 2, 2.5, 5, 10 steps): works from billions down to thousands. */
export function niceDollarTicks(max: number): { ticks: number[]; top: number } {
  if (!(max > 0)) max = 1;
  const raw = max / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.999; v += step) {
    ticks.push(+v.toFixed(6));
    if (v >= max) break;
  }
  return { ticks, top: ticks[ticks.length - 1] };
}

/** "Oct 2024 – Sep 2025" */
export const fiscalYearSpan = (fy: number) => `Oct ${fy - 1} – Sep ${fy}`;
