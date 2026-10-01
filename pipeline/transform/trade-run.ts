import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { z } from "zod";
import {
  TradeDataError,
  countryRow,
  dutiesByCountryRow,
  dutiesNationalRow,
  tradeByCountryRow,
  tradeNationalRow,
} from "../../lib/trade-entities";
import { CENSUS_RAW_DIR, parseRawDuties, type RawDuties } from "../fetch/census-trade-lib";
import {
  buildCountries,
  buildDuties,
  buildGoods,
  goodsSightings,
  parseCountryXlsx,
  parseGands,
  parseScheduleC,
  validateTrade,
} from "./trade";
import { readXlsx } from "./xlsx";

/**
 * Trade track transform: raw/census-trade/* -> pipeline/output/
 *   countries.json, trade_national.json, trade_by_country/<year>.json,
 *   duties_national.json, duties_by_country/<year>.json, trade_report.json
 * Deterministic (no run timestamp). Fails the build on any validation error.
 */
const OUT = "pipeline/output";

const oneRowPerLine = (rows: readonly unknown[]) =>
  rows.length === 0 ? "[]\n" : `[\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`;

async function writeShards<T extends { year: number }>(dir: string, rows: T[]): Promise<Record<string, number>> {
  await rm(`${OUT}/${dir}`, { recursive: true, force: true });
  await mkdir(`${OUT}/${dir}`, { recursive: true });
  const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
  const sizes: Record<string, number> = {};
  for (const y of years) {
    const path = `${OUT}/${dir}/${y}.json`;
    await writeFile(path, oneRowPerLine(rows.filter((r) => r.year === y)));
    sizes[`${dir}/${y}.json`] = (await stat(path)).size;
  }
  return sizes;
}

async function size(name: string): Promise<number> {
  return (await stat(`${OUT}/${name}`)).size;
}

async function readRawDuties(): Promise<RawDuties[]> {
  const dir = `${CENSUS_RAW_DIR}/duties`;
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => /^\d{4}\.json$/.test(f)).sort();
  } catch {
    throw new TradeDataError(`${dir} is missing — run pnpm fetch:census-trade`);
  }
  if (!files.length) throw new TradeDataError(`${dir} is empty — run pnpm fetch:census-trade`);
  const out: RawDuties[] = [];
  for (const f of files) {
    const raw = parseRawDuties(JSON.parse(await readFile(`${dir}/${f}`, "utf8")));
    if (`${raw.year}.json` !== f) throw new TradeDataError(`${dir}/${f}: year field ${raw.year} does not match the file name`);
    out.push(raw);
  }
  return out;
}

async function main() {
  console.log("transform:trade");
  const readRaw = async (f: string) => {
    try {
      return await readFile(`${CENSUS_RAW_DIR}/${f}`);
    } catch {
      throw new TradeDataError(`${CENSUS_RAW_DIR}/${f} is missing — run pnpm fetch:census-trade`);
    }
  };
  const goodsData = parseCountryXlsx(readXlsx(await readRaw("country.xlsx")));
  const gands = parseGands(readXlsx(await readRaw("gands.xlsx")));
  const schedC = parseScheduleC((await readRaw("country.txt")).toString("latin1"));
  const rawDuties = await readRawDuties();

  // Duties first only to learn which codes the API names; countries.json is the union.
  const dutyNames = new Map<string, string>();
  for (const raw of rawDuties) for (const r of raw.rows) if (/^[1-9]\d{3}$/.test(r[1])) dutyNames.set(r[1], r[2]);
  const countries = buildCountries(goodsSightings(goodsData), dutyNames, schedC).map((c) => countryRow.parse(c));

  const goods = buildGoods(goodsData, gands, countries);
  const duties = buildDuties(rawDuties, countries);
  const national = goods.national.map((r) => tradeNationalRow.parse(r));
  const byCountry = goods.byCountry.map((r) => tradeByCountryRow.parse(r));
  const dutiesCountry = duties.byCountry.map((r) => dutiesByCountryRow.parse(r));
  const dutiesNational = duties.national.map((r) => dutiesNationalRow.parse(r));

  const v = validateTrade({
    countries,
    national,
    byCountry,
    lastYear: goods.lastYear,
    lastMonth: goods.lastMonth,
    dutiesCountry,
    dutiesNational,
    dutiesLastPeriod: duties.lastPeriod,
  });

  await mkdir(OUT, { recursive: true });
  await writeFile(`${OUT}/countries.json`, oneRowPerLine(countries));
  await writeFile(`${OUT}/trade_national.json`, oneRowPerLine(national));
  await writeFile(`${OUT}/duties_national.json`, oneRowPerLine(dutiesNational));
  const shardSizes = {
    ...(await writeShards("trade_by_country", byCountry)),
    ...(await writeShards("duties_by_country", dutiesCountry)),
  };

  const shardTotal = (dir: string) => Object.entries(shardSizes).filter(([k]) => k.startsWith(`${dir}/`)).reduce((s, [, n]) => s + n, 0);
  const shardMax = (dir: string) => Math.max(...Object.entries(shardSizes).filter(([k]) => k.startsWith(`${dir}/`)).map(([, n]) => n));
  const real = countries.filter((c) => !c.is_aggregate);
  const dutyYears = [...new Set(dutiesCountry.map((r) => r.year))].sort();

  const report = {
    sources: {
      "country.xlsx": { rows: goodsData.length, first_period: `${Math.min(...goodsData.map((r) => r.year))}-01`, last_period: v.goodsLastPeriod, note: "output window starts 1991-01" },
      "gands.xlsx": { rows: gands.length / 3, first_period: String(Math.min(...gands.map((r) => Number(r.period)))), last_period: String(Math.max(...gands.map((r) => Number(r.period)))), note: "annual BOP, output window starts 1991" },
      "duties (api)": { rows: rawDuties.reduce((s, r) => s + r.rows.length, 0), first_period: duties.national[0]?.period, last_period: duties.lastPeriod },
    },
    countries: {
      rows: countries.length,
      partners: real.length,
      partners_by_kind: Object.fromEntries(["country", "former", "unallocated"].map((k) => [k, real.filter((c) => c.kind === k).length])),
      aggregates: countries.length - real.length,
      distinct_country_codes: new Set(real.map((c) => c.country_code)).size,
    },
    rows: {
      trade_national: national.length,
      trade_by_country: byCountry.length,
      duties_national: dutiesNational.length,
      duties_by_country: dutiesCountry.length,
    },
    coverage: {
      trade_by_country: { first_year: byCountry[0].year, last_year: goods.lastYear, last_month: goods.lastMonth },
      duties_by_country: { first_year: dutyYears[0], last_year: dutyYears[dutyYears.length - 1], last_period: duties.lastPeriod },
    },
    reconciliation: {
      tolerances: "see TOL in pipeline/transform/trade.ts",
      worst_country_sum_vs_world_1992_on: v.worstCountrySumGap,
      worst_country_sum_vs_world_1991: v.worstCountrySumGapPre1992,
      worst_duties_country_sum_vs_total: v.worstDutiesSumGap,
      worst_months_vs_annual_column_usd_millions: v.worstMonthsVsYear,
    },
    duties_codes_not_carried: duties.droppedAggregates,
    file_sizes_bytes: {
      "countries.json": await size("countries.json"),
      "trade_national.json": await size("trade_national.json"),
      "duties_national.json": await size("duties_national.json"),
      "trade_by_country/* (total)": shardTotal("trade_by_country"),
      "trade_by_country/* (largest year)": shardMax("trade_by_country"),
      "duties_by_country/* (total)": shardTotal("duties_by_country"),
      "duties_by_country/* (largest year)": shardMax("duties_by_country"),
    },
  };
  await writeFile(`${OUT}/trade_report.json`, JSON.stringify(report, null, 2) + "\n");

  console.log(`  countries     ${real.length} partners (${report.countries.distinct_country_codes} country_codes) + ${report.countries.aggregates} aggregates`);
  console.log(`  goods         ${report.sources["country.xlsx"].first_period.slice(0, 4)}..${v.goodsLastPeriod}, output from 1991-01; ${byCountry.length} country-years`);
  console.log(`  duties        ${duties.national[0]?.period}..${duties.lastPeriod}; ${dutiesCountry.length} country-years`);
  console.log(`  worst country-sum vs World (1992+): ${JSON.stringify(v.worstCountrySumGap)}; 1991: ${JSON.stringify(v.worstCountrySumGapPre1992)}`);
  console.log(`  worst duties country-sum vs total: ${JSON.stringify(v.worstDutiesSumGap)}`);
}

if (process.argv[1]?.endsWith("trade-run.ts")) {
  main().catch((err: unknown) => {
    console.error("\ntransform:trade FAILED");
    console.error(err instanceof z.ZodError ? z.prettifyError(err) : err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
