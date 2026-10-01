import {
  DUTIES_START_PERIOD,
  TRADE_START_YEAR,
  TradeDataError,
  type CountryRow,
  type DutiesByCountryRow,
  type DutiesNationalRow,
  type DutiesSource,
  type TradeByCountryRow,
  type TradeNationalRow,
} from "../../lib/trade-entities";
import type { RawDuties } from "../fetch/census-trade-lib";
import { ISO2_TO_ISO3, NON_ISO } from "./trade-iso";
import type { XlsxRow } from "./xlsx";

/**
 * Trade-track transform logic (pure; file I/O is in trade-run.ts). Sources:
 *   country.xlsx  monthly goods by country, Census basis, $ millions (1985-)
 *   gands.xlsx    annual goods and services, BOP basis, $ millions (1960-)
 *   country.txt   Schedule C codes + ISO alpha-2
 *   duties/*.json calculated duties + imports for consumption by country and month, whole $ (2010-)
 */

/** Reconciliation tolerances ($M unless noted). Tripping one fails the build; see docs/TRADE_METHODOLOGY.md. */
export const TOL = {
  /** Annual column vs the sum of its twelve months (each month is rounded to $0.1M). */
  monthsVsYear: 1,
  /** exports - imports vs published balance (BOP table is in whole $M). */
  balance: 1.5,
  /** Sum of non-aggregate countries vs the World total, per month: share of World imports/exports. */
  countrySumShare: 0.002,
  /**
   * Before January 1992 Census itemizes only ~80 partners, so countries cannot sum to World. Measured
   * shortfall for 1991 is 1.7% of exports and 1.0% of imports (annual); 3% bounds it with headroom for
   * individual months. From 1992 the country rows sum to World to within rounding (measured ~0.00%).
   */
  countrySumSharePre1992: 0.03,
  /** Same, for duties: sum of countries vs the API's all-countries row, share of the total. */
  dutiesSumShare: 0.001,
};

const MONTHS = 12;
const round1 = (x: number) => Math.round(x * 10) / 10;
const round5 = (x: number) => Math.round(x * 1e5) / 1e5;
const num = (s: string | undefined) => (s === undefined || s === "" ? 0 : Number(s));
const COLS_IMP = ["D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"];
const COLS_EXP = ["Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "AA", "AB"];
const mm = (m: number) => String(m + 1).padStart(2, "0");

// ---------------------------------------------------------------- Schedule C

export interface ScheduleCEntry {
  name: string;
  iso2: string | null;
}

export function parseScheduleC(text: string): Map<string, ScheduleCEntry> {
  const out = new Map<string, ScheduleCEntry>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^(\d{4})\s*\|\s*(.*?)\s*\|\s*(\S*)\s*$/.exec(line);
    if (m) out.set(m[1], { name: m[2], iso2: m[3] || null });
  }
  if (out.size < 200) throw new TradeDataError(`country.txt: only ${out.size} Schedule C codes parsed (expected 200+)`);
  return out;
}

// ------------------------------------------------------------ country.xlsx

export interface CountryYear {
  year: number;
  code: string;
  name: string;
  imports: number[]; // 12, $M, 1 decimal
  exports: number[];
  imports_year: number;
  exports_year: number;
}

const COUNTRY_HEADER: Record<string, string> = {
  A: "year", B: "CTY_CODE", C: "CTYNAME", D: "IJAN", O: "IDEC", P: "IYR", Q: "EJAN", AB: "EDEC", AC: "EYR",
};

export function parseCountryXlsx(rows: XlsxRow[]): CountryYear[] {
  const header = rows[0];
  for (const [col, want] of Object.entries(COUNTRY_HEADER)) {
    if (header?.cells[col] !== want) {
      throw new TradeDataError(`country.xlsx: expected column ${col} = "${want}", found "${header?.cells[col]}" — Census changed the layout`);
    }
  }
  const out: CountryYear[] = [];
  for (const { row, cells } of rows.slice(1)) {
    if (!/^\d{4}$/.test(cells.A ?? "")) throw new TradeDataError(`country.xlsx row ${row}: bad year "${cells.A}"`);
    if (!cells.B) throw new TradeDataError(`country.xlsx row ${row}: no country code`);
    const values = [...COLS_IMP, "P", ...COLS_EXP, "AC"].map((c) => num(cells[c]));
    if (values.some((v) => !Number.isFinite(v))) throw new TradeDataError(`country.xlsx row ${row} (${cells.B} ${cells.A}): non-numeric value`);
    out.push({
      year: Number(cells.A),
      code: cells.B,
      name: cells.C ?? "",
      imports: values.slice(0, MONTHS).map(round1),
      imports_year: round1(values[MONTHS]),
      exports: values.slice(MONTHS + 1, 2 * MONTHS + 1).map(round1),
      exports_year: round1(values[2 * MONTHS + 1]),
    });
  }
  return out;
}

// -------------------------------------------------------------- gands.xlsx

const GANDS_HEADER: Record<string, string> = { A: "Period", B: "Total", C: "Goods BOP", D: "Services", E: "Total", F: "Goods BOP", G: "Services", H: "Total ", I: "Goods BOP", J: "Services" };

/** Annual BOP rows from `TRADE_START_YEAR`, all three scopes. */
export function parseGands(rows: XlsxRow[]): TradeNationalRow[] {
  const header = rows.find((r) => r.cells.A === "Period");
  if (!header) throw new TradeDataError("gands.xlsx: no 'Period' header row");
  for (const [c, want] of Object.entries(GANDS_HEADER)) {
    if (header.cells[c] !== want) throw new TradeDataError(`gands.xlsx: expected column ${c} = "${want}", found "${header.cells[c]}"`);
  }
  const out: TradeNationalRow[] = [];
  for (const { row, cells } of rows) {
    if (row <= header.row || !/^\d{4}$/.test(cells.A ?? "")) continue;
    const y = Number(cells.A);
    if (y < TRADE_START_YEAR) continue;
    const scopes = [
      ["goods_services", "B", "E", "H"],
      ["goods", "C", "F", "I"],
      ["services", "D", "G", "J"],
    ] as const;
    for (const [scope, b, e, i] of scopes) {
      const [balance, exports, imports] = [b, e, i].map((c) => Number(cells[c]));
      if (![balance, exports, imports].every(Number.isFinite)) throw new TradeDataError(`gands.xlsx ${y} ${scope}: non-numeric value`);
      out.push({
        period: cells.A,
        frequency: "annual",
        basis: "bop",
        scope,
        adjustment: "nsa",
        exports: round1(exports),
        imports: round1(imports),
        balance: round1(balance),
      });
    }
  }
  return out;
}

// -------------------------------------------------------- country directory

/** Census codes that no longer exist in Schedule C (2014 edition) or differ from it. */
const FORMER: Record<string, { code: string; kind: "former" | "unallocated" | "country"; note: string }> = {
  "2771": { code: "ANT", kind: "former", note: "Netherlands Antilles, dissolved 2010; Curacao (2777) and Sint Maarten (2774) report separately afterwards." },
  "4350": { code: "CSK", kind: "former", note: "Czechoslovakia: trade appears in 1992 only; the Czech Republic (4351) and Slovakia (4359) report separately from 1993." },
  "4610": { code: "SUN", kind: "former", note: "USSR: 1991-1992; the successor states (4621-4644) report separately from 1992." },
  "4790": { code: "YUG", kind: "former", note: "Yugoslavia (former): 1991-1992; successor states (4791-4794, 4801 etc.) report separately afterwards." },
  "4799": { code: "SCG", kind: "former", note: "Serbia and Montenegro, 1992-2006; Serbia (4801/4802) and Montenegro (4804) follow." },
  "4802": { code: "SRB", kind: "country", note: "Serbia under an interim code (2007-2008); 4801 is Serbia from 2009. Same country_code, no overlap." },
  "5160": { code: "NTZ", kind: "former", note: "Iraq-Saudi Arabia Neutral Zone, reported through 2003." },
  "7320": { code: "SDN", kind: "country", note: "Sudan through 2011 (before South Sudan, 7323, is reported separately); 7321 continues Sudan. Same country_code; the 2011 changeover year carries both codes." },
  "7740": { code: "ETH", kind: "country", note: "Ethiopia (including Eritrea) through mid-1993; 7749 is Ethiopia afterwards and 7741 is Eritrea. Same country_code as 7749; the 1993 changeover year carries both codes." },
  "8220": { code: "UNALLOC_8220", kind: "unallocated", note: "Unidentified Countries: Census residual. Counted in the country sum (it is part of the World total)." },
  "8500": { code: "UNALLOC_8500", kind: "unallocated", note: "International Organizations: Census residual. Counted in the country sum." },
};

/** Aggregate codes in country.xlsx (the `00xx` block). Names come from the file. */
const AGGREGATE_KIND: Record<string, CountryRow["kind"]> = {
  "0003": "group", "0004": "world", "0005": "group", "0006": "group", "0007": "product", "0009": "region",
  "0010": "region", "0012": "region", "0013": "region", "0014": "group", "0015": "world", "0016": "region",
  "0017": "group", "0018": "region", "0019": "region", "0021": "group", "0022": "group",
};
export const WORLD_NSA = "0015";
export const WORLD_SA = "0004";

export interface CodeSighting {
  name: string;
  first_year: number;
  last_year: number;
}

/**
 * One row per Census code that carries goods trade in the output window or duties.
 * `goods` = sightings in country.xlsx (>= TRADE_START_YEAR); `duties` = codes seen in the API.
 */
export function buildCountries(
  goods: Map<string, CodeSighting>,
  dutyNames: Map<string, string>,
  schedC: Map<string, ScheduleCEntry>,
): CountryRow[] {
  const codes = new Set([...goods.keys(), ...dutyNames.keys()]);
  const rows: CountryRow[] = [];
  for (const census_code of [...codes].sort()) {
    const seen = goods.get(census_code);
    const first_year = seen?.first_year ?? null;
    const last_year = seen?.last_year ?? null;
    if (census_code in AGGREGATE_KIND) {
      rows.push({
        country_code: `AGG_${census_code}`,
        census_code,
        name: seen?.name ?? "",
        iso2: null,
        kind: AGGREGATE_KIND[census_code],
        is_aggregate: true,
        first_year,
        last_year,
        note: null,
      });
      continue;
    }
    if (census_code.startsWith("0")) throw new TradeDataError(`Census aggregate code ${census_code} (${seen?.name}) is not classified in trade.ts AGGREGATE_KIND`);
    const former = FORMER[census_code];
    const ref = schedC.get(census_code);
    if (former) {
      rows.push({
        country_code: former.code,
        census_code,
        name: ref?.name ?? seen?.name ?? dutyNames.get(census_code) ?? census_code,
        iso2: null,
        kind: former.kind,
        is_aggregate: false,
        first_year,
        last_year,
        note: former.note,
      });
      continue;
    }
    if (!ref) throw new TradeDataError(`Census code ${census_code} (${seen?.name ?? dutyNames.get(census_code)}) is in the trade data but not in Schedule C or the FORMER table — add it deliberately`);
    const iso2 = ref.iso2;
    const iso3 = iso2 ? (NON_ISO.get(iso2) ?? ISO2_TO_ISO3.get(iso2)) : undefined;
    if (!iso2 || !iso3) throw new TradeDataError(`Census code ${census_code} (${ref.name}): ISO code "${iso2}" has no alpha-3 mapping in trade-iso.ts`);
    rows.push({
      country_code: iso3,
      census_code,
      name: ref.name,
      iso2: NON_ISO.has(iso2) ? null : iso2,
      kind: "country",
      is_aggregate: false,
      first_year,
      last_year,
      note: NON_ISO.has(iso2) ? `Census code ${iso2} has no ISO 3166-1 alpha-3; ${iso3} is a user-assigned code.` : null,
    });
  }
  return rows;
}

// ------------------------------------------------------------- goods build

export interface GoodsBuild {
  national: TradeNationalRow[];
  byCountry: TradeByCountryRow[];
  /** Last published month (1-12) of the last year, from the World total. */
  lastYear: number;
  lastMonth: number;
}

/** The newest month in which the World NSA total is non-zero; later months of that year are unpublished. */
export function lastPublishedMonth(data: CountryYear[]): { year: number; month: number } {
  const world = data.filter((r) => r.code === WORLD_NSA);
  if (!world.length) throw new TradeDataError(`country.xlsx has no World (${WORLD_NSA}) rows`);
  const year = Math.max(...world.map((r) => r.year));
  const w = world.find((r) => r.year === year)!;
  let month = 0;
  for (let m = 0; m < MONTHS; m++) if (w.imports[m] > 0 || w.exports[m] > 0) month = m + 1;
  if (!month) throw new TradeDataError(`country.xlsx: World total for ${year} has no published months`);
  return { year, month };
}

/** First/last year (>= TRADE_START_YEAR) each code has non-zero goods trade in country.xlsx. */
export function goodsSightings(data: CountryYear[]): Map<string, CodeSighting> {
  const out = new Map<string, CodeSighting>();
  for (const r of data) {
    if (r.year < TRADE_START_YEAR) continue;
    if (![...r.imports, ...r.exports, r.imports_year, r.exports_year].some((v) => v !== 0)) continue;
    const s = out.get(r.code);
    if (!s) out.set(r.code, { name: r.name, first_year: r.year, last_year: r.year });
    else {
      s.first_year = Math.min(s.first_year, r.year);
      s.last_year = Math.max(s.last_year, r.year);
    }
  }
  return out;
}

export function buildGoods(data: CountryYear[], gands: TradeNationalRow[], countries: CountryRow[]): GoodsBuild {
  const { year: lastYear, month: lastMonth } = lastPublishedMonth(data);
  const national: TradeNationalRow[] = [...gands];
  const byCountry: TradeByCountryRow[] = [];
  const codeToCountry = new Map(countries.map((c) => [c.census_code, c.country_code]));
  const merged = new Map<string, { country_code: string; year: number; codes: string[]; exports: (number | null)[]; imports: (number | null)[]; exports_year: number; imports_year: number }>();

  for (const r of data) {
    if (r.year < TRADE_START_YEAR) continue;
    const publishedMonths = r.year === lastYear ? lastMonth : MONTHS;
    const cut = (a: number[]) => a.map((v, m) => (m < publishedMonths ? v : null));

    if (r.code === WORLD_NSA || r.code === WORLD_SA) {
      const adjustment = r.code === WORLD_SA ? "sa" : "nsa";
      for (let m = 0; m < publishedMonths; m++) {
        national.push({
          period: `${r.year}-${mm(m)}`,
          frequency: "monthly",
          basis: "census",
          scope: "goods",
          adjustment,
          exports: r.exports[m],
          imports: r.imports[m],
          balance: round1(r.exports[m] - r.imports[m]),
        });
      }
      if (adjustment === "nsa") {
        national.push({
          period: String(r.year),
          frequency: "annual",
          basis: "census",
          scope: "goods",
          adjustment,
          exports: r.exports_year,
          imports: r.imports_year,
          balance: round1(r.exports_year - r.imports_year),
        });
      }
      continue;
    }

    const anyTrade = [...r.imports, ...r.exports, r.imports_year, r.exports_year].some((v) => v !== 0);
    if (!anyTrade) continue;
    const country_code = codeToCountry.get(r.code)!;
    const key = `${country_code}|${r.year}`;
    const have = merged.get(key);
    const piece = { exports: cut(r.exports), imports: cut(r.imports), exports_year: r.exports_year, imports_year: r.imports_year };
    if (!have) {
      merged.set(key, { country_code, year: r.year, codes: [r.code], ...piece });
      continue;
    }
    for (let m = 0; m < MONTHS; m++) {
      have.exports[m] = piece.exports[m] === null ? have.exports[m] : (have.exports[m] ?? 0) + piece.exports[m]!;
      have.imports[m] = piece.imports[m] === null ? have.imports[m] : (have.imports[m] ?? 0) + piece.imports[m]!;
    }
    have.codes.push(r.code);
    have.exports_year = round1(have.exports_year + piece.exports_year);
    have.imports_year = round1(have.imports_year + piece.imports_year);
  }
  for (const m of merged.values()) {
    byCountry.push({
      country_code: m.country_code,
      year: m.year,
      exports: m.exports.map((v) => (v === null ? null : round1(v))),
      imports: m.imports.map((v) => (v === null ? null : round1(v))),
      exports_year: m.exports_year,
      imports_year: m.imports_year,
      balance_year: round1(m.exports_year - m.imports_year),
    });
  }
  national.sort((a, b) => a.period.localeCompare(b.period) || a.frequency.localeCompare(b.frequency) || a.basis.localeCompare(b.basis) || a.scope.localeCompare(b.scope) || a.adjustment.localeCompare(b.adjustment));
  byCountry.sort((a, b) => a.year - b.year || a.country_code.localeCompare(b.country_code));
  return { national, byCountry, lastYear, lastMonth };
}

// ------------------------------------------------------------------ duties

export interface DutiesBuild {
  byCountry: DutiesByCountryRow[];
  national: DutiesNationalRow[];
  lastPeriod: string;
  droppedAggregates: string[];
  names: Map<string, string>;
}

const COUNTRY_CODE_RE = /^[1-9]\d{3}$/;

/** A year of duties rows plus where they came from (the Census API unless stated). */
export type DutiesInput = Pick<RawDuties, "year" | "rows"> & { source?: DutiesSource };

export function buildDuties(raws: DutiesInput[], countries: CountryRow[]): DutiesBuild {
  const toCountry = new Map(countries.map((c) => [c.census_code, c.country_code]));
  const names = new Map<string, string>();
  const dropped = new Set<string>();
  type Cell = { d: number; v: number };
  const national = new Map<string, Cell>();
  const perCountry = new Map<string, Map<string, Cell>>(); // `${country_code}|${year}` -> period -> cell
  const seenRows = new Set<string>();
  const sourceOfYear = new Map<number, DutiesSource>();
  let lastPeriod = "";

  for (const raw of raws) {
    const source = raw.source ?? "census_api";
    const prior = sourceOfYear.get(raw.year);
    if (prior && prior !== source) throw new TradeDataError(`duties ${raw.year}: provided by both ${prior} and ${source}; a year has one source`);
    sourceOfYear.set(raw.year, source);
    for (const [time, code, name, dutStr, valStr] of raw.rows) {
      const d = Number(dutStr);
      const v = Number(valStr);
      if (!Number.isInteger(d) || !Number.isInteger(v)) throw new TradeDataError(`duties ${time} ${code}: non-integer value "${dutStr}" / "${valStr}"`);
      if (time > lastPeriod) lastPeriod = time;
      if (code === "-") {
        if (national.has(time)) throw new TradeDataError(`duties: duplicate all-countries row for ${time}`);
        national.set(time, { d, v });
      } else if (COUNTRY_CODE_RE.test(code)) {
        names.set(code, name);
        const cc = toCountry.get(code);
        if (!cc) throw new TradeDataError(`duties: Census code ${code} (${name}) is not in countries.json`);
        if (seenRows.has(`${code}|${time}`)) throw new TradeDataError(`duties: duplicate row ${code} ${time}`);
        seenRows.add(`${code}|${time}`);
        const key = `${cc}|${time.slice(0, 4)}`;
        const months = perCountry.get(key) ?? new Map<string, Cell>();
        const have = months.get(time);
        months.set(time, have ? { d: have.d + d, v: have.v + v } : { d, v });
        perCountry.set(key, months);
      } else {
        dropped.add(`${code} ${name}`);
      }
    }
  }
  const lastYear = Number(lastPeriod.slice(0, 4));
  const lastMonth = Number(lastPeriod.slice(5));
  const rateOf = (d: number, v: number) => (v > 0 ? round5(d / v) : null);

  const byCountry: DutiesByCountryRow[] = [];
  for (const [key, months] of perCountry) {
    const [country_code, ys] = key.split("|");
    const year = Number(ys);
    const published = year === lastYear ? lastMonth : MONTHS;
    const duties: (number | null)[] = [];
    const import_value: (number | null)[] = [];
    const rate: (number | null)[] = [];
    let dy = 0;
    let vy = 0;
    for (let m = 0; m < MONTHS; m++) {
      if (m >= published) {
        duties.push(null);
        import_value.push(null);
        rate.push(null);
        continue;
      }
      const c = months.get(`${year}-${mm(m)}`) ?? { d: 0, v: 0 };
      duties.push(c.d);
      import_value.push(c.v);
      rate.push(rateOf(c.d, c.v));
      dy += c.d;
      vy += c.v;
    }
    if (dy === 0 && vy === 0) continue;
    byCountry.push({ country_code, year, duties, import_value, rate, duties_year: dy, import_value_year: vy, rate_year: rateOf(dy, vy), source: sourceOfYear.get(year) ?? "census_api" });
  }
  byCountry.sort((a, b) => a.year - b.year || a.country_code.localeCompare(b.country_code));
  const nat: DutiesNationalRow[] = [...national]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, c]) => ({ period, duties: c.d, import_value: c.v, rate: rateOf(c.d, c.v), source: sourceOfYear.get(Number(period.slice(0, 4))) ?? "census_api" }));
  return { byCountry, national: nat, lastPeriod, droppedAggregates: [...dropped].sort(), names };
}

// -------------------------------------------------------------- validation

export interface TradeValidation {
  goodsFirstPeriod: string;
  goodsLastPeriod: string;
  worstCountrySumGap: { period: string; flow: string; gap: number; share: number };
  worstCountrySumGapPre1992: { period: string; flow: string; gap: number; share: number };
  worstDutiesSumGap: { period: string; gap: number; share: number } | null;
  worstMonthsVsYear: number;
}

const periodsFrom = (startY: number, startM: number, endY: number, endM: number) => {
  const out: string[] = [];
  for (let y = startY, m = startM; y < endY || (y === endY && m <= endM); m === 12 ? (y++, (m = 1)) : m++) out.push(`${y}-${String(m).padStart(2, "0")}`);
  return out;
};

export function validateTrade(args: {
  countries: CountryRow[];
  national: TradeNationalRow[];
  byCountry: TradeByCountryRow[];
  lastYear: number;
  lastMonth: number;
  dutiesCountry: DutiesByCountryRow[];
  dutiesNational: DutiesNationalRow[];
  dutiesLastPeriod: string;
}): TradeValidation {
  const { countries, national, byCountry, lastYear, lastMonth } = args;
  const fail = (m: string): never => {
    throw new TradeDataError(`trade validation: ${m}`);
  };
  const aggregate = new Set(countries.filter((c) => c.is_aggregate).map((c) => c.country_code));
  const known = new Set(countries.map((c) => c.country_code));
  if (new Set(countries.map((c) => c.census_code)).size !== countries.length) fail("duplicate census_code in countries.json");

  // National: duplicates, balance identity, no negatives, coverage.
  const seen = new Set<string>();
  for (const r of national) {
    const k = [r.period, r.frequency, r.basis, r.scope, r.adjustment].join("|");
    if (seen.has(k)) fail(`duplicate national row ${k}`);
    seen.add(k);
    if (r.scope === "goods_services" || r.scope === "goods") {
      if (r.exports < 0 || r.imports < 0) fail(`negative exports/imports in national row ${k}`);
    } else if (r.exports < 0 || r.imports < 0) fail(`negative services exports/imports ${k}`);
    if (Math.abs(r.exports - r.imports - r.balance) > TOL.balance) fail(`national ${k}: exports - imports (${round1(r.exports - r.imports)}) != balance (${r.balance})`);
  }
  const bopYears = national.filter((r) => r.basis === "bop" && r.scope === "goods_services").map((r) => Number(r.period));
  for (let y = TRADE_START_YEAR; y <= Math.max(...bopYears); y++) if (!bopYears.includes(y)) fail(`BOP annual series has a gap at ${y}`);
  for (const adj of ["nsa", "sa"] as const) {
    const have = new Set(national.filter((r) => r.frequency === "monthly" && r.adjustment === adj).map((r) => r.period));
    for (const p of periodsFrom(TRADE_START_YEAR, 1, lastYear, lastMonth)) if (!have.has(p)) fail(`monthly goods (${adj}) missing ${p}`);
  }
  const censusAnnual = new Set(national.filter((r) => r.frequency === "annual" && r.basis === "census").map((r) => r.period));
  for (let y = TRADE_START_YEAR; y <= lastYear; y++) if (!censusAnnual.has(String(y))) fail(`Census-basis annual goods missing ${y}`);

  // By country: duplicates, identity, no negatives, months vs year, same-country overlap.
  const keySeen = new Set<string>();
  let worstMonthsVsYear = 0;
  for (const r of byCountry) {
    if (!known.has(r.country_code)) fail(`by-country row ${r.country_code} ${r.year} has a country_code that is not in countries.json`);
    const k = `${r.country_code}|${r.year}`;
    if (keySeen.has(k)) fail(`duplicate by-country row ${k}`);
    keySeen.add(k);
    for (const a of [r.exports, r.imports]) for (const v of a) if (v !== null && v < 0) fail(`negative value in ${r.country_code} ${r.year}`);
    if (r.exports_year < 0 || r.imports_year < 0) fail(`negative annual value in ${r.country_code} ${r.year}`);
    if (Math.abs(r.exports_year - r.imports_year - r.balance_year) > 0.11) fail(`${r.country_code} ${r.year}: exports - imports != balance`);
    for (const [label, a, annual] of [["exports", r.exports, r.exports_year], ["imports", r.imports, r.imports_year]] as const) {
      const sum = a.reduce<number>((s, v) => s + (v ?? 0), 0);
      const gap = Math.abs(sum - annual);
      worstMonthsVsYear = Math.max(worstMonthsVsYear, gap);
      if (gap > TOL.monthsVsYear) fail(`${r.country_code} ${r.year} ${label}: months sum to ${round1(sum)} but the annual column says ${annual}`);
    }
  }
  for (let y = TRADE_START_YEAR; y <= lastYear; y++) if (!byCountry.some((r) => r.year === y)) fail(`no by-country rows for ${y}`);

  // Census-basis: non-aggregate country rows must sum to the World NSA total each month.
  const world = new Map(national.filter((r) => r.frequency === "monthly" && r.adjustment === "nsa").map((r) => [r.period, r]));
  const sums = new Map<string, { e: number; i: number }>();
  for (const r of byCountry) {
    if (aggregate.has(r.country_code)) continue;
    for (let m = 0; m < MONTHS; m++) {
      if (r.exports[m] === null) continue;
      const p = `${r.year}-${mm(m)}`;
      const s = sums.get(p) ?? { e: 0, i: 0 };
      s.e += r.exports[m]!;
      s.i += r.imports[m]!;
      sums.set(p, s);
    }
  }
  let worst = { period: "", flow: "", gap: 0, share: 0 };
  let worstPre = { period: "", flow: "", gap: 0, share: 0 };
  for (const [p, w] of world) {
    const s = sums.get(p);
    if (!s) fail(`no country rows for ${p}`);
    for (const [flow, got, want] of [["exports", s!.e, w.exports], ["imports", s!.i, w.imports]] as const) {
      const gap = Math.abs(got - want);
      const share = want ? gap / want : 0;
      if (p >= "1992-01" && share > worst.share) worst = { period: p, flow, gap: round1(gap), share };
      if (p < "1992-01" && share > worstPre.share) worstPre = { period: p, flow, gap: round1(gap), share };
      const tol = p < "1992-01" ? TOL.countrySumSharePre1992 : TOL.countrySumShare;
      if (share > tol) fail(`${p} ${flow}: country rows sum to ${round1(got)} but World is ${want} (gap ${round1(gap)}, ${(share * 100).toFixed(3)}% > ${(tol * 100).toFixed(2)}%)`);
    }
  }

  // Duties.
  const dseen = new Set<string>();
  for (const r of args.dutiesCountry) {
    const k = `${r.country_code}|${r.year}`;
    if (dseen.has(k)) fail(`duplicate duties row ${k}`);
    dseen.add(k);
    if (!known.has(r.country_code)) fail(`duties row for ${r.country_code} has no countries.json entry`);
    if (aggregate.has(r.country_code)) fail(`duties row for aggregate ${r.country_code}`);
    for (let m = 0; m < MONTHS; m++) {
      const [d, v, rt] = [r.duties[m], r.import_value[m], r.rate[m]];
      if ((d === null) !== (v === null)) fail(`duties ${k} month ${m + 1}: duties/value published mismatch`);
      if (d !== null && v !== null) {
        if (v === 0 && d > 0) fail(`duties ${k} month ${m + 1}: duties without import value`);
        if (rt !== null && Math.abs(rt - d / v) > 1e-5) fail(`duties ${k} month ${m + 1}: rate != duties / value`);
      }
    }
  }
  const natSource = new Map(args.dutiesNational.map((r) => [Number(r.period.slice(0, 4)), r.source]));
  for (const r of args.dutiesCountry) if (natSource.get(r.year) !== r.source) fail(`duties ${r.country_code} ${r.year}: source ${r.source} differs from the year's all-countries total (${natSource.get(r.year)})`);
  const dnat = new Set(args.dutiesNational.map((r) => r.period));
  const [dly, dlm] = [Number(args.dutiesLastPeriod.slice(0, 4)), Number(args.dutiesLastPeriod.slice(5))];
  for (const p of periodsFrom(Number(DUTIES_START_PERIOD.slice(0, 4)), 1, dly, dlm)) if (!dnat.has(p)) fail(`duties: all-countries total missing ${p}`);
  const dsums = new Map<string, { d: number; v: number }>();
  for (const r of args.dutiesCountry) {
    for (let m = 0; m < MONTHS; m++) {
      if (r.duties[m] === null) continue;
      const p = `${r.year}-${mm(m)}`;
      const s = dsums.get(p) ?? { d: 0, v: 0 };
      s.d += r.duties[m]!;
      s.v += r.import_value[m]!;
      dsums.set(p, s);
    }
  }
  let worstDuties: TradeValidation["worstDutiesSumGap"] = null;
  for (const n of args.dutiesNational) {
    const s = dsums.get(n.period) ?? { d: 0, v: 0 };
    const gap = Math.abs(s.d - n.duties);
    const share = n.duties ? gap / n.duties : 0;
    if (!worstDuties || share > worstDuties.share) worstDuties = { period: n.period, gap, share };
    if (share > TOL.dutiesSumShare) fail(`duties ${n.period}: country rows sum to ${s.d} but the all-countries total is ${n.duties} (${(share * 100).toFixed(3)}%)`);
    const vgap = n.import_value ? Math.abs(s.v - n.import_value) / n.import_value : 0;
    if (vgap > TOL.dutiesSumShare) fail(`duties ${n.period}: country import values sum to ${s.v} but the total is ${n.import_value}`);
  }

  return {
    goodsFirstPeriod: `${TRADE_START_YEAR}-01`,
    goodsLastPeriod: `${lastYear}-${String(lastMonth).padStart(2, "0")}`,
    worstCountrySumGap: worst,
    worstCountrySumGapPre1992: worstPre,
    worstDutiesSumGap: worstDuties,
    worstMonthsVsYear: round1(worstMonthsVsYear),
  };
}
