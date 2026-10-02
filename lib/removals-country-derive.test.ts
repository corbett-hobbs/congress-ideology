import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { iceCatalog } from "./enforcement-entities";
import {
  buildRemovalsCountryPayload,
  coverageLabel,
  formatChange,
  rankYear,
  selectableYears,
  sortRanked,
} from "./removals-country-derive";
import { removalsCountryReport, removalsCountryRow } from "./removals-country-entities";

const read = (f: string): unknown => JSON.parse(readFileSync(f, "utf8"));
const rows = (read("pipeline/output/removals_by_country.json") as unknown[]).map((r) => removalsCountryRow.parse(r));
const report = removalsCountryReport.parse(read("pipeline/output/removals_by_country_report.json"));
const sources = iceCatalog.parse(read("pipeline/reference/ice-removals-catalog.json")).sources;
const payload = buildRemovalsCountryPayload(rows, report, sources);
const year = (fy: number) => payload.years.find((y) => y.fy === fy)!;
const name = (ci: number) => payload.countries[ci].name;

describe("buildRemovalsCountryPayload (real files)", () => {
  it("covers FY2014–FY2024 and names the uncovered years", () => {
    expect(coverageLabel(payload)).toBe("FY2014–FY2024");
    expect(payload.uncovered.map((u) => u.fy)).toEqual([2013, 2025]);
  });

  it("totals match the national ICE series and rows come largest first", () => {
    for (const y of payload.years) {
      expect(y.rows.reduce((a, r) => a + r[1], 0)).toBe(y.total);
      expect(y.rows.map((r) => r[1])).toEqual([...y.rows.map((r) => r[1])].sort((a, b) => b - a));
    }
    expect(year(2024).total).toBe(271_484);
    expect(year(2017).total).toBe(226_119);
  });

  it("computes the change from the prior year at serving time, null for the first year", () => {
    expect(year(2014).rows.every((r) => r[2] === null)).toBe(true);
    const mex = (fy: number) => year(fy).rows.find((r) => name(r[0]) === "Mexico")!;
    expect(mex(2015)[2]).toBe(mex(2015)[1] - mex(2014)[1]);
    expect(mex(2015)[2]).toBe(146_132 - 176_968);
    // A country absent the year before counts from zero.
    const prior = new Set(year(2016).rows.map((r) => r[0]));
    const fresh = year(2017).rows.find((r) => !prior.has(r[0]));
    if (fresh) expect(fresh[2]).toBe(fresh[1]);
  });

  it("keeps one display name per country key", () => {
    expect(new Set(payload.countries.map((c) => c.key)).size).toBe(payload.countries.length);
  });
});

describe("sorting", () => {
  const ranked = rankYear(year(2024));
  const order = (key: "total" | "change" | "name", reversed = false) => sortRanked(ranked, payload.countries, key, reversed);

  it("Total is largest first and reverses", () => {
    expect(name(order("total")[0].ci)).toBe("Mexico");
    expect(order("total", true).map((r) => r.ci)).toEqual([...order("total")].reverse().map((r) => r.ci));
  });

  it("Change puts the biggest increase first, A–Z is alphabetical, both reversible", () => {
    const c = order("change").map((r) => r.change ?? 0);
    expect(c).toEqual([...c].sort((a, b) => b - a));
    const n = order("name").map((r) => name(r.ci));
    expect(n).toEqual([...n].sort((a, b) => a.localeCompare(b)));
    expect(order("name", true).map((r) => r.ci)).toEqual([...order("name")].reverse().map((r) => r.ci));
  });

  it("keeps every row: sorting never drops a country", () => {
    expect(order("change")).toHaveLength(ranked.length);
  });

  it("ranks by removals regardless of the sort", () => {
    expect(order("name").find((r) => name(r.ci) === "Mexico")?.rank).toBe(1);
  });
});

describe("formatChange and selectableYears", () => {
  it("formats arrows, zero and missing", () => {
    expect(formatChange(1204)).toBe("▲ 1,204");
    expect(formatChange(-310)).toBe("▼ 310");
    expect(formatChange(0)).toBe("–");
    expect(formatChange(null)).toBe("–");
  });

  it("narrows to an administration's covered years, and can be empty", () => {
    expect(selectableYears(payload, null)).toHaveLength(11);
    expect(selectableYears(payload, new Set([2009, 2010, 2014, 2015, 2016]))).toEqual([2014, 2015, 2016]);
    expect(selectableYears(payload, new Set([2025]))).toEqual([]);
  });
});
