import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { TradeDataError } from "../../lib/trade-entities";
import { CENSUS_RAW_DIR, parseRawDuties } from "../fetch/census-trade-lib";
import { DATAWEB_RAW_DIR, parseDataWebRaw } from "../fetch/dataweb-duties-lib";
import {
  buildCountries,
  buildDuties,
  type DutiesInput,
  buildGoods,
  goodsSightings,
  lastPublishedMonth,
  parseCountryXlsx,
  parseGands,
  parseScheduleC,
  validateTrade,
} from "./trade";
import { readXlsx } from "./xlsx";

// Every fixture is the real, committed Census snapshot (no invented rows).
const raw = (f: string) => readFileSync(`${CENSUS_RAW_DIR}/${f}`);
const gandsRows = readXlsx(raw("gands.xlsx"));
const goodsData = parseCountryXlsx(readXlsx(raw("country.xlsx")));
const schedC = parseScheduleC(raw("country.txt").toString("latin1"));
const censusDuties: DutiesInput[] = readdirSync(`${CENSUS_RAW_DIR}/duties`)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => ({ ...parseRawDuties(JSON.parse(readFileSync(`${CENSUS_RAW_DIR}/duties/${f}`, "utf8"))), source: "census_api" as const }));
const dataWebDuties: DutiesInput[] = readdirSync(DATAWEB_RAW_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => ({ ...parseDataWebRaw(JSON.parse(readFileSync(`${DATAWEB_RAW_DIR}/${f}`, "utf8"))), source: "usitc_dataweb" as const }));
const rawDuties = [...censusDuties, ...dataWebDuties];

function buildAll() {
  const dutyNames = new Map<string, string>();
  for (const r of rawDuties) for (const x of r.rows) if (/^[1-9]\d{3}$/.test(x[1])) dutyNames.set(x[1], x[2]);
  const countries = buildCountries(goodsSightings(goodsData), dutyNames, schedC);
  const goods = buildGoods(goodsData, parseGands(gandsRows), countries);
  const duties = buildDuties(rawDuties, countries);
  return {
    countries,
    national: goods.national,
    byCountry: goods.byCountry,
    lastYear: goods.lastYear,
    lastMonth: goods.lastMonth,
    dutiesCountry: duties.byCountry,
    dutiesNational: duties.national,
    dutiesLastPeriod: duties.lastPeriod,
  };
}

describe("published figures (checked against Census's own fetched tables)", () => {
  it("gands.xlsx 1985 BOP goods and services: balance -121,879; exports 289,071; imports 410,951", () => {
    const row = gandsRows.find((r) => r.cells.A === "1985")!;
    expect([row.cells.B, row.cells.E, row.cells.H].map(Number)).toEqual([-121879, 289071, 410951]);
  });

  it("1991 BOP goods and services come through unchanged", () => {
    const r = parseGands(gandsRows).find((x) => x.period === "1991" && x.scope === "goods_services")!;
    expect([r.balance, r.exports, r.imports]).toEqual([-31136, 578343, 609479]);
  });

  it("1991 Census-basis World goods: imports 488,453.1 and exports 421,730.0", () => {
    const w = goodsData.find((r) => r.code === "0015" && r.year === 1991)!;
    expect([w.imports_year, w.exports_year]).toEqual([488453.1, 421730]);
  });

  it("the last published month is read from the World total, not the zero-filled tail", () => {
    const { year, month } = lastPublishedMonth(goodsData);
    expect(year).toBeGreaterThanOrEqual(2026);
    expect(month).toBeGreaterThanOrEqual(1);
    expect(month).toBeLessThan(12);
  });
});

describe("country directory", () => {
  const { countries } = buildAll();
  it("keys every partner by ISO3, with no clean-ISO3 exceptions left unmapped", () => {
    for (const c of countries.filter((x) => x.kind === "country" && x.iso2)) expect(c.country_code).toMatch(/^[A-Z]{3}$/);
    expect(countries.find((c) => c.census_code === "5700")?.country_code).toBe("CHN");
    expect(countries.find((c) => c.census_code === "4803")?.country_code).toBe("XKX");
  });
  it("flags every aggregate so country sums can exclude them", () => {
    expect(countries.filter((c) => c.is_aggregate).every((c) => ["region", "group", "world", "product"].includes(c.kind))).toBe(true);
    expect(countries.find((c) => c.census_code === "0003")?.is_aggregate).toBe(true);
  });
  it("fails on a Census code it cannot map", () => {
    expect(() => buildCountries(new Map([["9999", { name: "Nowhere", first_year: 2000, last_year: 2001 }]]), new Map(), schedC)).toThrow(TradeDataError);
  });
  it("continues a country across a Census recode (Ethiopia 7740 -> 7749 shares one country_code)", () => {
    const codes = countries.filter((c) => c.country_code === "ETH").map((c) => c.census_code);
    expect(codes).toEqual(expect.arrayContaining(["7740", "7749"]));
  });
});

describe("duties: USITC DataWeb bridge (1993-2009)", () => {
  const { dutiesNational, dutiesCountry } = buildAll();
  it("covers 1993-01 onward with no gap and marks the source by year", () => {
    expect(dutiesNational[0].period).toBe("1993-01");
    for (const r of dutiesNational) expect(r.source).toBe(Number(r.period.slice(0, 4)) < 2010 ? "usitc_dataweb" : "census_api");
    for (const r of dutiesCountry) expect(r.source).toBe(r.year < 2010 ? "usitc_dataweb" : "census_api");
  });
  it("has 12 months for 2009 and no jump in the average rate across the 2009-to-2010 source change", () => {
    const y = dutiesNational.filter((r) => r.period.startsWith("2009"));
    expect(y).toHaveLength(12);
    // Continuity across the source change: the average rate must not jump (2009 1.37% -> 2010 1.36%).
    const rate = (yr: string) => {
      const rows = dutiesNational.filter((r) => r.period.startsWith(yr));
      return rows.reduce((s, r) => s + r.duties, 0) / rows.reduce((s, r) => s + r.import_value, 0);
    };
    expect(Math.abs(rate("2010") - rate("2009"))).toBeLessThan(0.002);
  });
  it("rejects a bridge year whose country rows disagree with the all-countries total (corrupted fixture)", () => {
    const bad = JSON.parse(JSON.stringify(buildAll()));
    const r = bad.dutiesCountry.find((x: { year: number; country_code: string }) => x.year === 2001 && x.country_code === "CHN");
    r.duties[3] += 5_000_000_000;
    r.rate[3] = r.duties[3] / r.import_value[3];
    expect(() => validateTrade(bad)).toThrow(/duties 2001-04/);
  });
  it("rejects a country row whose source disagrees with its year's total", () => {
    const bad = JSON.parse(JSON.stringify(buildAll()));
    bad.dutiesCountry.find((x: { year: number }) => x.year === 2001).source = "census_api";
    expect(() => validateTrade(bad)).toThrow(/source census_api differs/);
  });
  it("rejects a year supplied by both sources", () => {
    const dup = { ...dataWebDuties[0], source: "census_api" as const, rows: [] };
    expect(() => buildDuties([...dataWebDuties, dup], buildAll().countries)).toThrow(/a year has one source/);
  });
});

describe("duties", () => {
  const { dutiesNational, dutiesCountry } = buildAll();
  it("computes the rate as calculated duties over imports for consumption", () => {
    const p = dutiesNational.find((r) => r.period === "2025-04")!;
    expect(p.rate).toBeCloseTo(p.duties / p.import_value, 5);
  });
  it("covers the Feb 24 2026 cut-over months at monthly grain", () => {
    for (const p of ["2025-12", "2026-01", "2026-02", "2026-03"]) expect(dutiesNational.some((r) => r.period === p)).toBe(true);
  });
  it("carries no aggregate rows", () => {
    expect(dutiesCountry.some((r) => r.country_code.startsWith("AGG_"))).toBe(false);
  });
});

describe("validation fails loudly on corrupted data", () => {
  let good: ReturnType<typeof buildAll>;
  beforeAll(() => {
    good = buildAll();
  });
  const clone = <T,>(x: T): T => structuredClone(x);

  it("accepts the real data", () => {
    expect(() => validateTrade(good)).not.toThrow();
  });
  it("rejects a negative import", () => {
    const bad = clone(good);
    bad.byCountry[0].imports[0] = -5;
    expect(() => validateTrade(bad)).toThrow(/negative/);
  });
  it("rejects a duplicate country-year", () => {
    const bad = clone(good);
    bad.byCountry.push(clone(bad.byCountry[0]));
    expect(() => validateTrade(bad)).toThrow(/duplicate by-country row/);
  });
  it("rejects exports - imports != balance", () => {
    const bad = clone(good);
    bad.byCountry[0].balance_year += 50;
    expect(() => validateTrade(bad)).toThrow(/exports - imports != balance/);
  });
  it("rejects months that do not add up to the annual column", () => {
    const bad = clone(good);
    const r = bad.byCountry.find((x) => x.year === 2020 && x.exports_year > 1000)!;
    r.exports[3] = (r.exports[3] ?? 0) + 5000;
    expect(() => validateTrade(bad)).toThrow(/months sum to/);
  });
  it("rejects country rows that no longer sum to World", () => {
    const bad = clone(good);
    bad.byCountry = bad.byCountry.filter((r) => !(r.year === 2020 && r.country_code === "CHN"));
    expect(() => validateTrade(bad)).toThrow(/country rows sum to/);
  });
  it("rejects a gap in the monthly national series", () => {
    const bad = clone(good);
    bad.national = bad.national.filter((r) => !(r.period === "2005-06" && r.frequency === "monthly" && r.adjustment === "nsa"));
    expect(() => validateTrade(bad)).toThrow(/missing 2005-06/);
  });
  it("rejects a gap in the annual BOP series", () => {
    const bad = clone(good);
    bad.national = bad.national.filter((r) => !(r.basis === "bop" && r.period === "2000"));
    expect(() => validateTrade(bad)).toThrow(/gap at 2000/);
  });
  it("rejects duties whose country rows disagree with the all-countries total", () => {
    const bad = clone(good);
    const r = bad.dutiesCountry.find((x) => x.year === 2025 && x.country_code === "CHN")!;
    r.duties[5] = (r.duties[5] ?? 0) + 5_000_000_000;
    r.rate[5] = r.duties[5] / r.import_value[5]!; // keep the row self-consistent so only the cross-check can catch it
    expect(() => validateTrade(bad)).toThrow(/duties 2025-06/);
  });
  it("rejects a missing month in the duties total", () => {
    const bad = clone(good);
    bad.dutiesNational = bad.dutiesNational.filter((r) => r.period !== "2018-03");
    expect(() => validateTrade(bad)).toThrow(/missing 2018-03/);
  });
});

describe("xlsx reader", () => {
  it("fails on bytes that are not a zip", () => {
    expect(() => readXlsx(Buffer.from("not a spreadsheet at all, just text padding padding"))).toThrow(/not a zip/);
  });
  it("fails loudly if Census changes the country.xlsx layout", () => {
    const rows = readXlsx(raw("country.xlsx")).slice(0, 3);
    rows[0].cells.D = "SOMETHING";
    expect(() => parseCountryXlsx(rows)).toThrow(/layout/);
  });
});
