import type { CountryRow, DutiesByCountryRow, DutiesNationalRow, DutiesSource, TradeByCountryRow, TradeNationalRow } from "./trade-entities";
import { AXIS_START_YEAR, type Monthly, type TradeCountryPayload, type TradeNationalPayload, type TradeYearPayload, type YearPartnerRow } from "./trade-types";
import { monthCount, monthIndex } from "./trade-derive";

/**
 * Builds the trade page's client payloads from the pipeline rows. Pure (no
 * `server-only`, no fs) so it is unit-testable; `lib/trade-data.ts` feeds it the
 * files. The pipeline shards by year; a country view needs one country across
 * 36 years, so this pivots rows into fixed-index monthly arrays (month 0 =
 * 1991-01) that the app serves per country on demand.
 */

const blank = (n: number): Monthly => Array.from({ length: n }, () => null);

function put(target: Monthly, year: number, months: readonly (number | null)[]) {
  const base = (year - AXIS_START_YEAR) * 12;
  for (let m = 0; m < 12; m++) if (base + m < target.length) target[base + m] = months[m] ?? null;
}

/** Last month with a published Census-basis goods total. */
export function lastGoodsPeriod(national: readonly TradeNationalRow[]): string {
  const periods = national.filter((r) => r.frequency === "monthly" && r.scope === "goods" && r.adjustment === "nsa").map((r) => r.period);
  if (!periods.length) throw new Error("trade_national.json has no monthly goods rows");
  return periods.reduce((a, b) => (b > a ? b : a));
}

export function buildNationalPayload(national: readonly TradeNationalRow[], duties: readonly DutiesNationalRow[]): TradeNationalPayload {
  const lastPeriod = lastGoodsPeriod(national);
  const n = monthCount(lastPeriod);
  const series = (adj: "sa" | "nsa") => {
    const exports = blank(n);
    const imports = blank(n);
    for (const r of national) {
      if (r.frequency !== "monthly" || r.scope !== "goods" || r.basis !== "census" || r.adjustment !== adj) continue;
      const i = monthIndex(r.period);
      if (i < 0 || i >= n) continue;
      exports[i] = r.exports;
      imports[i] = r.imports;
    }
    return { exports, imports };
  };
  const dutyArr = blank(n);
  const dutyImports = blank(n);
  const firstBySource = new Map<DutiesSource, string>();
  for (const r of duties) {
    const i = monthIndex(r.period);
    if (i >= 0 && i < n) {
      dutyArr[i] = r.duties;
      dutyImports[i] = r.import_value;
    }
    const f = firstBySource.get(r.source);
    if (!f || r.period < f) firstBySource.set(r.source, r.period);
  }
  return {
    lastPeriod,
    sa: series("sa"),
    nsa: series("nsa"),
    duties: dutyArr,
    dutyImports,
    dutySources: [...firstBySource].map(([source, first]) => ({ source, first })).sort((a, b) => a.first.localeCompare(b.first)),
  };
}

/** One country across every year, from the by-year shards. Months outside the shards stay null. */
export function buildCountryPayload(
  country: Pick<CountryRow, "country_code" | "name">,
  trade: readonly TradeByCountryRow[],
  duties: readonly DutiesByCountryRow[],
  length: number,
): TradeCountryPayload {
  const out: TradeCountryPayload = { code: country.country_code, name: country.name, exports: blank(length), imports: blank(length), duties: blank(length), dutyImports: blank(length) };
  for (const r of trade) {
    if (r.country_code !== country.country_code) continue;
    put(out.exports, r.year, r.exports);
    put(out.imports, r.year, r.imports);
  }
  for (const r of duties) {
    if (r.country_code !== country.country_code) continue;
    put(out.duties, r.year, r.duties);
    put(out.dutyImports, r.year, r.import_value);
  }
  return out;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** The partners chart for one year: non-aggregate countries only, with that year's duties where present. */
export function buildYearPayload(
  year: number,
  countries: readonly CountryRow[],
  trade: readonly TradeByCountryRow[],
  duties: readonly DutiesByCountryRow[],
): TradeYearPayload {
  const byCode = new Map<string, CountryRow>();
  for (const c of countries) if (!c.is_aggregate && !byCode.has(c.country_code)) byCode.set(c.country_code, c);
  const dutyBy = new Map(duties.filter((d) => d.year === year).map((d) => [d.country_code, d]));
  const partners: YearPartnerRow[] = [];
  for (const r of trade) {
    if (r.year !== year) continue;
    const c = byCode.get(r.country_code);
    if (!c) continue; // aggregates carry no country row
    const d = dutyBy.get(r.country_code);
    partners.push([c.country_code, c.name, round1(r.exports_year), round1(r.imports_year), d?.duties_year ?? null, d?.import_value_year ?? null]);
  }
  partners.sort((a, b) => a[1].localeCompare(b[1]));
  return { year, partners, dutySource: dutyBy.size ? [...dutyBy.values()][0].source : null };
}
