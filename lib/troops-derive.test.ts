import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { administration } from "./executive-orders-entities";
import { REGION_IDS, regionOf } from "./troops-regions";
import { changeVsPrior, buildTroopsPayload, decodeTroops, formatCountAxis, niceCountTicks, periodView, quarterEnd, quarterOf, stackByRegion, termAtQuarter, unavailable } from "./troops-derive";
import { troopsMeta, troopsRow } from "./troops-entities";

const read = (f: string) => JSON.parse(readFileSync(`pipeline/output/${f}`, "utf8")) as unknown;
const rows = (read("troops_location.json") as unknown[]).map((r) => troopsRow.parse(r));
const meta = troopsMeta.parse(read("troops_location_meta.json"));
const admins = (read("administrations.json") as unknown[]).map((r) => administration.parse(r));
const payload = buildTroopsPayload(rows, meta, admins);
const data = decodeTroops(payload);
const pi = (p: string) => payload.periods.findIndex((x) => x.period === p);
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
  it("covers all periods with a term each, and carries the break and the Army gap", () => {
    expect(payload.periods).toHaveLength(56);
    expect(payload.periods[payload.defaultPeriod].period).toBe("2026-03");
    expect(payload.periods[payload.breakPeriod].period).toBe("2017-12");
    expect(payload.armyGap.map((i) => payload.periods[i].period)).toEqual(["2022-12", "2023-03", "2023-06"]);
    expect(payload.terms.map((t) => t.last)).toEqual(["Bush", "Obama", "Trump", "Biden", "Trump"]);
    expect(payload.terms[0]).toMatchObject({ from: 0, to: 0 });
    expect(payload.terms.at(-1)?.label).toBe("Donald Trump (2025–present)");
  });
  it("assigns a president by quarter-end date", () => {
    expect(payload.terms[payload.periods[pi("2017-03")].term].last).toBe("Trump");
    expect(payload.terms[payload.periods[pi("2020-12")].term].last).toBe("Trump");
    expect(payload.terms[payload.periods[pi("2021-03")].term].last).toBe("Biden");
    expect(payload.terms[payload.periods[pi("2025-03")].term].termId).toBe("2025-01-20");
  });
  it("converts quarters", () => {
    expect(quarterOf("2026-03")).toBe(2026 * 4);
    expect(quarterEnd(quarterOf("2024-03"))).toBe("2024-03-31");
    expect(quarterEnd(quarterOf("2020-12"))).toBe("2020-12-31");
    expect(termAtQuarter(payload.terms, quarterOf("2021-03"))).toBe(3);
  });
});

describe("stacks and views", () => {
  it("sums hosts and afloat by region, and equals Σ rows minus territories (printed total ± documented gap)", () => {
    const m = 0;
    for (const p of payload.periods.filter((x) => !x.armyNotReported)) {
      const i = pi(p.period);
      const s = stackByRegion(data, m, i, i)[0];
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
    expect(unavailable(data, 0, i)).toBe(true);
    expect(unavailable(data, 1, i)).toBe(true);
    expect(unavailable(data, 2, i)).toBe(false);
    expect(stackByRegion(data, 0, i, i)[0]).toMatchObject({ unavailable: true, total: 0 });
    expect(stackByRegion(data, 2, i, i)[0].total).toBeGreaterThan(10000); // Navy overseas
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
    const s = stackByRegion(data, 0, pi("2025-12"), pi("2025-12"), jp)[0];
    expect(s.total).toBe(54288);
    expect(s.regions[REGION_IDS.indexOf("east_asia_pacific")]).toBe(54288);
    expect(stackByRegion(data, 0, pi("2025-12"), pi("2025-12"), place("Germany"))[0].total).toBe(36436);
  });
  it("merges Space Force into Air & Space Force so the branch is comparable across Sep 2023", () => {
    const jp = place("Japan");
    const a = stackByRegion(data, 4, pi("2023-06"), pi("2023-06"), jp)[0].total;
    const b = stackByRegion(data, 4, pi("2023-09"), pi("2023-09"), jp)[0].total;
    expect(a).toBeGreaterThan(1000);
    expect(Math.abs(b - a) / a).toBeLessThan(0.25);
  });
  it("refuses a percent change across the Dec 2017 break or an unavailable quarter", () => {
    expect(changeVsPrior(data, 0, pi("2017-12"))).toBeNull();
    expect(changeVsPrior(data, 0, pi("2023-09"))).toBeNull();
    expect(changeVsPrior(data, 0, pi("2023-12"))).not.toBeNull();
    expect(changeVsPrior(data, 0, pi("2018-03"))).not.toBeNull();
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
