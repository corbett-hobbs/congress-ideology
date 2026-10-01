import "server-only";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  countryRow,
  dutiesByCountryRow,
  dutiesNationalRow,
  tradeByCountryRow,
  tradeNationalRow,
  type CountryRow,
  type DutiesByCountryRow,
  type TradeByCountryRow,
} from "./trade-entities";
import { buildCountryPayload, buildNationalPayload, buildYearPayload } from "./trade-payload";
import { monthCount, monthIndex } from "./trade-derive";
import { getEraLayers } from "./indicator-data";
import { spanEnd } from "./trade-chart";
import type { EconomyPayload } from "./indicator-payload";
import type { TradeCountryPayload, TradeCountryRef, TradeNationalPayload, TradeYearPayload } from "./trade-types";

/**
 * Build-time trade dataset: reads the pipeline's trade files and hands the page
 * compact payloads. Mirrors `lib/indicator-data.ts`; the pivoting lives in the
 * pure `lib/trade-payload.ts`. Nothing is fetched at runtime in the app: the page
 * ships the national series, and `/data/trade/...` serves one country (all years)
 * or one year (all partners) as static JSON on demand.
 */

const OUT = join(process.cwd(), "pipeline", "output");

const readJson = (file: string): unknown[] => JSON.parse(readFileSync(join(OUT, file), "utf8"));

let cache: {
  countries: CountryRow[];
  trade: Map<number, TradeByCountryRow[]>;
  duties: Map<number, DutiesByCountryRow[]>;
  national: TradeNationalPayload;
  length: number;
} | null = null;

function load() {
  if (cache) return cache;
  // Newest last_year first, so a code shared by a recode resolves to its current name.
  const countries = readJson("countries.json")
    .map((r) => countryRow.parse(r))
    .sort((a, b) => (b.last_year ?? 0) - (a.last_year ?? 0));
  const shards = <T>(dir: string, parse: (r: unknown) => T) => {
    const m = new Map<number, T[]>();
    for (const f of readdirSync(join(OUT, dir)).filter((x) => /^\d{4}\.json$/.test(x))) m.set(Number(f.slice(0, 4)), readJson(`${dir}/${f}`).map(parse));
    return m;
  };
  const trade = shards("trade_by_country", (r) => tradeByCountryRow.parse(r));
  const duties = shards("duties_by_country", (r) => dutiesByCountryRow.parse(r));
  const national = buildNationalPayload(
    readJson("trade_national.json").map((r) => tradeNationalRow.parse(r)),
    readJson("duties_national.json").map((r) => dutiesNationalRow.parse(r)),
  );
  cache = { countries, trade, duties, national, length: monthCount(national.lastPeriod) };
  return cache;
}

/** What ships inline with the page. */
export function getTradeNational(): TradeNationalPayload {
  return load().national;
}

/** Non-aggregate country codes with a goods series (the country dropdown and `/data/trade/countries/[code]`). */
export function getTradeCountryRefs(): TradeCountryRef[] {
  const seen = new Set<string>();
  const out: TradeCountryRef[] = [];
  for (const c of load().countries) {
    if (c.is_aggregate || seen.has(c.country_code)) continue;
    seen.add(c.country_code);
    out.push({ code: c.country_code, name: c.name, firstYear: c.first_year, lastYear: c.last_year });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function getTradeYears(): number[] {
  return [...load().trade.keys()].sort((a, b) => a - b);
}

export function getTradeCountry(code: string): TradeCountryPayload | null {
  const d = load();
  const ref = getTradeCountryRefs().find((c) => c.code === code);
  if (!ref) return null;
  const trade = [...d.trade.values()].flat().filter((r) => r.country_code === code);
  const duties = [...d.duties.values()].flat().filter((r) => r.country_code === code);
  return buildCountryPayload({ country_code: code, name: ref.name }, trade, duties, d.length);
}

export function getTradeYear(year: number): TradeYearPayload | null {
  const d = load();
  const trade = d.trade.get(year);
  if (!trade) return null;
  return buildYearPayload(year, d.countries, trade, d.duties.get(year) ?? []);
}

export interface TradePageData {
  national: TradeNationalPayload;
  countries: TradeCountryRef[];
  /** Presidential terms, recessions and chamber control on the shared day axis (same layers as the Economy page). */
  era: Pick<EconomyPayload, "rec" | "terms" | "control"> & { span: number };
  firstYear: number;
  lastYear: number;
}

/** Everything the trade page ships inline: the national series, the country list and the era layers. */
export function getTradePageData(): TradePageData {
  const national = getTradeNational();
  const last = monthIndex(national.lastPeriod);
  const span = spanEnd(last);
  return {
    national,
    countries: getTradeCountryRefs(),
    era: { span, ...getEraLayers(span) },
    firstYear: 1991,
    lastYear: Number(national.lastPeriod.slice(0, 4)),
  };
}
