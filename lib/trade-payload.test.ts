import { readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { countryRow, dutiesByCountryRow, dutiesNationalRow, tradeByCountryRow, tradeNationalRow } from "./trade-entities";
import { buildCountryPayload, buildNationalPayload, buildYearPayload, lastGoodsPeriod } from "./trade-payload";
import { monthIndex } from "./trade-derive";

// Real committed pipeline output (no invented rows).
const OUT = "pipeline/output";
const read = (f: string) => JSON.parse(readFileSync(`${OUT}/${f}`, "utf8")) as unknown[];
const countries = read("countries.json").map((r) => countryRow.parse(r));
const national = read("trade_national.json").map((r) => tradeNationalRow.parse(r));
const dutiesNat = read("duties_national.json").map((r) => dutiesNationalRow.parse(r));
const shards = <T>(dir: string, parse: (r: unknown) => T) => readdirSync(`${OUT}/${dir}`).flatMap((f) => read(`${dir}/${f}`).map(parse));
const trade = shards("trade_by_country", (r) => tradeByCountryRow.parse(r));
const duties = shards("duties_by_country", (r) => dutiesByCountryRow.parse(r));

describe("national payload", () => {
  const p = buildNationalPayload(national, dutiesNat);
  it("is a monthly array from 1991-01 to the last published month", () => {
    expect(p.lastPeriod).toBe(lastGoodsPeriod(national));
    const n = monthIndex(p.lastPeriod) + 1;
    for (const a of [p.sa.exports, p.sa.imports, p.nsa.exports, p.nsa.imports, p.duties, p.dutyImports]) expect(a).toHaveLength(n);
    expect(p.sa.exports.every((v) => v !== null)).toBe(true);
  });
  it("matches Census's published January 1991 goods totals (NSA 1991 annual deficit ≈ $66.7B)", () => {
    const sum = (a: (number | null)[]) => a.slice(0, 12).reduce<number>((s, v) => s + (v ?? 0), 0);
    const y91 = sum(p.nsa.exports) - sum(p.nsa.imports);
    expect(y91).toBeCloseTo(-66723.1, 0);
  });
  it("starts duties in 1993-01 and records the source change", () => {
    expect(p.duties.slice(0, 24).every((v) => v === null)).toBe(true);
    expect(p.duties[monthIndex("1993-01")]).not.toBeNull();
    expect(p.dutySources).toEqual([
      { source: "usitc_dataweb", first: "1993-01" },
      { source: "census_api", first: "2010-01" },
    ]);
  });
});

describe("country payload (pivot)", () => {
  const len = monthIndex(buildNationalPayload(national, dutiesNat).lastPeriod) + 1;
  const china = buildCountryPayload({ country_code: "CHN", name: "China" }, trade, duties, len);
  it("lays each year's months at the right axis index", () => {
    const row = trade.find((r) => r.country_code === "CHN" && r.year === 2024)!;
    expect(china.exports[monthIndex("2024-03")]).toBe(row.exports[2]);
    expect(china.imports[monthIndex("2024-12")]).toBe(row.imports[11]);
  });
  it("has duties from 1993 and none before; China 2010-01 duties are $851.7M on $25.25B", () => {
    expect(china.duties[monthIndex("1992-12")]).toBeNull();
    expect(china.duties[monthIndex("1993-01")]).not.toBeNull();
    expect(china.duties[monthIndex("2010-01")]! / 1e6).toBeCloseTo(851.7, 0);
    expect(china.dutyImports[monthIndex("2010-01")]! / 1e9).toBeCloseTo(25.25, 1);
  });
  it("keeps unpublished months null after the last published month", () => {
    expect(china.exports).toHaveLength(len);
    expect(china.exports[len - 1]).not.toBeNull();
  });
  it("sums a recode into one continuous series (Ethiopia: one code across the 1993 recode)", () => {
    const eth = buildCountryPayload({ country_code: "ETH", name: "Ethiopia" }, trade, duties, len);
    expect(eth.imports[monthIndex("1992-06")]).not.toBeNull();
    expect(eth.imports[monthIndex("1994-06")]).not.toBeNull();
  });
});

describe("year payload", () => {
  const y = buildYearPayload(2024, countries, trade.filter((r) => r.year === 2024), duties.filter((r) => r.year === 2024));
  it("lists non-aggregate partners only, with the duties source", () => {
    expect(y.partners.length).toBeGreaterThan(200);
    expect(y.partners.some((r) => r[0].startsWith("AGG_"))).toBe(false);
    expect(y.dutySource).toBe("census_api");
  });
  it("a pre-duties year has no duties", () => {
    const y91 = buildYearPayload(1991, countries, trade.filter((r) => r.year === 1991), []);
    expect(y91.dutySource).toBeNull();
    expect(y91.partners.every((r) => r[4] === null)).toBe(true);
  });
});

describe("payload budget (measured, not enforced by feel)", () => {
  const gz = (o: unknown) => gzipSync(JSON.stringify(o)).length;
  const nat = buildNationalPayload(national, dutiesNat);
  const len = monthIndex(nat.lastPeriod) + 1;
  it("national inline payload stays under 60 KB gzipped; one country under 12 KB; one year under 25 KB", () => {
    const sizes = {
      national: gz(nat),
      china: gz(buildCountryPayload({ country_code: "CHN", name: "China" }, trade, duties, len)),
      year2024: gz(buildYearPayload(2024, countries, trade.filter((r) => r.year === 2024), duties.filter((r) => r.year === 2024))),
    };
    console.log("trade payload gzip bytes", JSON.stringify(sizes));
    expect(sizes.national).toBeLessThan(60_000);
    expect(sizes.china).toBeLessThan(12_000);
    expect(sizes.year2024).toBeLessThan(25_000);
  });
});
