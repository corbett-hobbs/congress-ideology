import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { administration } from "./executive-orders-entities";
import { REGION_IDS, regionOf } from "./troops-regions";
import { changeVsPrior, buildTroopsPayload, decodeTroops, formatCountAxis, niceCountTicks, periodView, quarterEnd, quarterOf, stackByRegion, termForFiscalYear, unavailable } from "./troops-derive";
import { troopsMeta, troopsRow } from "./troops-entities";

const read = (f: string) => JSON.parse(readFileSync(`pipeline/output/${f}`, "utf8")) as unknown;
const rows = (read("troops_location.json") as unknown[]).map((r) => troopsRow.parse(r));
const meta = troopsMeta.parse(read("troops_location_meta.json"));
const admins = (read("administrations.json") as unknown[]).map((r) => administration.parse(r));
const payload = buildTroopsPayload(rows, meta, admins);
const data = decodeTroops(payload);
const pi = (p: string) => payload.periods.findIndex((x) => x.period === p);
const yidx = (fy: number) => payload.years.findIndex((y) => y.fy === fy);
const place = (n: string) => payload.places.findIndex((x) => x.name === n);

describe("regions", () => {
  it("assigns every host and afloat row a region, and no territory one", () => {
    for (const r of rows) {
      const reg = regionOf(r);
      if (r.class === "territory") expect(reg).toBeNull();
      else expect(reg, `${r.name} ${r.iso3}`).not.toBeNull();
    }
  });
  it("applies the settled judgement calls", () => {
    const reg = (name: string) => payload.places.find((p) => p.name === name)?.region;
    expect(reg("Turkey")).toBe("europe");
    expect(reg("Greenland")).toBe("europe");
    expect(reg("Egypt")).toBe("middle_east_south_central_asia");
    for (const n of ["Morocco", "Algeria", "Tunisia", "Libya", "Djibouti"]) expect(reg(n), n).toBe("africa");
    expect(reg("British Indian Ocean Territory")).toBe("middle_east_south_central_asia");
    expect(reg("Afloat / unassigned")).toBe("afloat_unassigned");
    expect(reg("Japan")).toBe("east_asia_pacific");
    expect(reg("Honduras")).toBe("western_hemisphere");
    expect(payload.places.find((p) => p.name === "Guam")?.region).toBeNull();
  });
});

describe("payload", () => {
  it("has one fiscal-year bar per year, FY2008-FY2026, each on its Sep 30 table except the partial latest", () => {
    expect(payload.years.map((y) => y.fy)).toEqual(Array.from({ length: 19 }, (_, i) => 2008 + i));
    for (const y of payload.years.slice(0, -1)) {
      expect(y.partial).toBe(false);
      expect(payload.periods[y.period].period).toBe(`${y.fy}-09`);
    }
    const last = payload.years.at(-1)!;
    expect(last).toMatchObject({ fy: 2026, partial: true });
    expect(payload.periods[last.period].period).toBe("2026-03");
    expect(payload.defaultYear).toBe(18);
  });
  it("carries the break at FY2018 and no Army gap among the years (the N/A quarters are not September)", () => {
    expect(payload.years[payload.breakYear].fy).toBe(2018);
    expect(payload.armyGapYears).toEqual([]);
    expect(payload.periods.filter((p) => p.armyNotReported).map((p) => p.period)).toEqual(["2022-12", "2023-03", "2023-06"]);
    expect(unavailable(data, 0, payload.years[yidx(2023)].period)).toBe(false);
  });
  it("assigns a president to each fiscal year by most days in office", () => {
    const last = (fy: number) => payload.terms[payload.years[yidx(fy)].term].last;
    expect(last(2008)).toBe("Bush");
    expect(last(2009)).toBe("Obama"); // Oct 2008 to Jan 19, 2009 is 111 days of Bush; the other 254 are Obama's
    expect(last(2016)).toBe("Obama");
    expect(last(2017)).toBe("Trump"); // 111 days of Obama, 254 of Trump
    expect(last(2020)).toBe("Trump");
    expect(last(2021)).toBe("Biden");
    expect(last(2024)).toBe("Biden");
    expect(last(2025)).toBe("Trump");
    expect(last(2026)).toBe("Trump");
    expect(payload.terms.map((t) => t.last)).toEqual(["Bush", "Obama", "Trump", "Biden", "Trump"]);
    expect(payload.terms.at(-1)?.label).toBe("Donald Trump (2025–present)");
    expect(termForFiscalYear(admins, 2013)).toBe(2);
  });
  it("converts quarters", () => {
    expect(quarterOf("2026-03")).toBe(2026 * 4);
    expect(quarterEnd(quarterOf("2024-03"))).toBe("2024-03-31");
    expect(quarterEnd(quarterOf("2020-12"))).toBe("2020-12-31");
  });
});

describe("stacks and views", () => {
  it("sums hosts and afloat by region, and equals Σ rows minus territories (printed total ± documented gap)", () => {
    const m = 0;
    for (const y of payload.years) {
      const p = payload.periods[y.period];
      const i = y.period;
      const s = stackByRegion(data, m, payload.years.indexOf(y), payload.years.indexOf(y))[0];
      const v = periodView(data, m, i);
      expect(s.total).toBe(v.abroad);
      const printedOverseas = meta.periods[i].printed.overseas_total.total!;
      const gap = p.overseasGap ?? 0;
      expect(v.abroad + v.territoryTotal + meta.periods[i].duplicate_rows_dropped.reduce((a, d) => a + d.total, 0)).toBe(printedOverseas + gap);
    }
  });
  it("matches known Mar 2026 figures", () => {
    const v = periodView(data, 0, pi("2026-03"));
    expect(payload.places[v.ranked[0].place].name).toBe("Japan");
    expect(v.territories.find((t) => payload.places[t.place].name === "Guam")?.value).toBe(7137);
    expect(v.abroad).toBe(meta.periods.at(-1)!.abroad_total);
  });
  it("marks All branches and Army unavailable in the Army N/A quarters, but not the other branches", () => {
    const i = pi("2023-03");
    const total = (m: number) => payload.rows.filter((r) => r[1] === i).reduce((a, r) => a + (payload.places[r[0]].region && r[2] !== 1 ? (r[3 + m] ?? 0) : 0), 0);
    expect(unavailable(data, 0, i)).toBe(true);
    expect(unavailable(data, 1, i)).toBe(true);
    expect(unavailable(data, 2, i)).toBe(false);
    expect(total(2)).toBeGreaterThan(10000); // Navy overseas is still reported
    expect(periodView(data, 0, i).ranked).toEqual([]);
  });
  it("keeps suppressed hosts out of the ranking and lists them", () => {
    const v = periodView(data, 0, pi("2019-06"));
    const names = v.suppressed.map((p) => payload.places[p].name).sort();
    expect(names).toEqual(["Afghanistan", "Iraq", "Syria"]);
    expect(v.ranked.some((r) => ["Afghanistan", "Iraq", "Syria"].includes(payload.places[r.place].name))).toBe(false);
  });
  it("filters a time series to one country", () => {
    const jp = place("Japan");
    const y = yidx(2025);
    const s = stackByRegion(data, 0, y, y, jp)[0];
    expect(s.total).toBe(payload.rows.find((r) => r[0] === jp && r[1] === payload.years[y].period)![3]);
    expect(s.regions[REGION_IDS.indexOf("east_asia_pacific")]).toBe(s.total);
    expect(s.total).toBeGreaterThan(50000);
    expect(stackByRegion(data, 0, y, y, place("Germany"))[0].regions[REGION_IDS.indexOf("europe")]).toBeGreaterThan(30000);
  });
  it("merges Space Force into Air & Space Force so the branch is comparable across Sep 2023", () => {
    const jp = place("Japan");
    const a = stackByRegion(data, 4, yidx(2023) - 1, yidx(2023) - 1, jp)[0].total; // FY2022
    const b = stackByRegion(data, 4, yidx(2023), yidx(2023), jp)[0].total; // FY2023: Space Force now has its own column
    expect(a).toBeGreaterThan(1000);
    expect(Math.abs(b - a) / a).toBeLessThan(0.25);
  });
  it("refuses a percent change across the FY2017/FY2018 break or for the partial year", () => {
    expect(changeVsPrior(data, 0, yidx(2018))).toBeNull();
    expect(changeVsPrior(data, 0, yidx(2026))).toBeNull();
    expect(changeVsPrior(data, 0, yidx(2019))).not.toBeNull();
    expect(changeVsPrior(data, 0, yidx(2017))).not.toBeNull();
    expect(changeVsPrior(data, 0, 0)).toBeNull();
  });
});

describe("axis helpers", () => {
  it("builds round ticks that hold the maximum", () => {
    const { ticks, top } = niceCountTicks(364202);
    expect(top).toBeGreaterThanOrEqual(364202);
    expect(ticks[0]).toBe(0);
    expect(ticks.at(-1)).toBe(top);
    expect(niceCountTicks(0).top).toBe(1);
    expect(formatCountAxis(150000)).toBe("150k");
    expect(formatCountAxis(2500)).toBe("2.5k");
  });
});
