import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { administration } from "./executive-orders-entities";
import { REGION_IDS, regionOf } from "./troops-regions";
import { HISTORICAL_ADMINISTRATIONS } from "./troops-presidents";
import { buildTroopsPayload, changeVsPrior, contingencyAt, topHostRuns, topHostsByYear, decodeTroops, formatCountAxis, yearLabelEvery, niceCountTicks, periodView, quarterEnd, quarterOf, stackByRegion, termOnDate, unavailable } from "./troops-derive";
import { historyMeta, historyRow, troopsMeta, troopsRow } from "./troops-entities";

const read = (f: string) => JSON.parse(readFileSync(`pipeline/output/${f}`, "utf8")) as unknown;
const rows = (read("troops_location.json") as unknown[]).map((r) => troopsRow.parse(r));
const meta = troopsMeta.parse(read("troops_location_meta.json"));
const admins = (read("administrations.json") as unknown[]).map((r) => administration.parse(r));
const hrows = (read("troops_history.json") as unknown[]).map((r) => historyRow.parse(r));
const hmeta = historyMeta.parse(read("troops_history_meta.json"));
const payload = buildTroopsPayload(rows, meta, admins, { rows: hrows, meta: hmeta });
const data = decodeTroops(payload);
const pi = (p: string) => payload.periods.findIndex((x) => x.period === p);
const yidx = (year: number) => payload.years.findIndex((y) => y.fy === year);
const place = (n: string) => payload.places.findIndex((x) => x.name === n);

describe("regions", () => {
  it("assigns every host and afloat row, location and history, a region, and no territory one", () => {
    for (const r of [...rows, ...hrows]) {
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
    expect(reg("East Germany")).toBe("europe");
    expect(payload.places.find((p) => p.name === "Guam")?.region).toBeNull();
  });
});

describe("payload", () => {
  it("has one bar per year: June 1953-56 (the page starts at Eisenhower), then the Sep 30 table each year to 2025, and the partial 2026", () => {
    expect(payload.years.map((y) => y.fy)).toEqual(Array.from({ length: 74 }, (_, i) => 1953 + i));
    expect(payload.years.some((y) => y.fy === 1950)).toBe(false);
    expect(payload.rows.some((t) => payload.periods[t[1]].period.startsWith("1950"))).toBe(false);
    for (const y of payload.years.slice(0, -1)) {
      const p = payload.periods[y.period];
      expect(y.partial).toBe(false);
      expect(p.period).toBe(y.fy <= 1956 ? `${y.fy}-06` : `${y.fy}-09`);
      expect(p.snapshot).toBe(y.fy <= 1956 ? "june" : p.source === "dmdc_location" ? "quarter" : "september");
    }
    const last = payload.years.at(-1)!;
    expect(last).toMatchObject({ fy: 2026, partial: true });
    expect(payload.periods[last.period].period).toBe("2026-03");
    expect(payload.defaultYear).toBe(payload.years.length - 1);
  });
  it("labels each year's source: troopdata, DMDC 309A, DMDC location", () => {
    const src = (fy: number) => payload.periods[payload.years[yidx(fy)].period].source;
    expect(src(1957)).toBe("troopdata");
    expect(src(1995)).toBe("troopdata");
    expect(src(1996)).toBe("dmdc_309a");
    expect(src(1997)).toBe("troopdata");
    expect(src(2003)).toBe("dmdc_309a");
    expect(src(2006)).toBe("troopdata");
    expect(src(2008)).toBe("dmdc_location");
    expect(payload.periods[payload.years[yidx(2006)].period].estimate).toBe(true);
    expect(payload.periods[payload.years[yidx(2007)].period].estimate).toBe(true);
    expect(payload.periods[payload.years[yidx(2005)].period].estimate).toBe(false);
    expect(payload.periods[payload.years[yidx(1997)].period].afloatIncluded).toBe(false);
    expect(payload.periods[payload.years[yidx(1998)].period].afloatIncluded).toBe(true);
  });
  it("carries the break at 2018 and no Army gap among the years (the N/A quarters are not September)", () => {
    expect(payload.years[payload.breakYear].fy).toBe(2018);
    expect(payload.armyGapYears).toEqual([]);
    expect(payload.periods.filter((p) => p.armyNotReported).map((p) => p.period)).toEqual(["2022-12", "2023-03", "2023-06"]);
    expect(unavailable(data, 0, payload.years[yidx(2023)].period)).toBe(false);
  });
  it("assigns the president in office on the snapshot date, Truman to Trump", () => {
    const last = (fy: number) => payload.terms[payload.years[yidx(fy)].term].last;
    expect(last(1953)).toBe("Eisenhower"); // June 30, 1953
    expect(last(1963)).toBe("Kennedy"); // Sep 30, 1963 (Johnson from Nov 22)
    expect(last(1964)).toBe("Johnson");
    expect(last(1974)).toBe("Ford"); // Sep 30, 1974 (Nixon until Aug 8)
    expect(last(1980)).toBe("Carter");
    expect(last(1989)).toBe("Bush"); // Bush 41
    expect(last(1993)).toBe("Clinton");
    expect(last(2008)).toBe("Bush");
    expect(last(2009)).toBe("Obama");
    expect(last(2017)).toBe("Trump");
    expect(last(2021)).toBe("Biden");
    expect(last(2025)).toBe("Trump");
    expect(payload.terms.map((t) => t.president)).toEqual([
      "Dwight D. Eisenhower", "John F. Kennedy", "Lyndon B. Johnson", "Richard Nixon", "Gerald Ford", "Jimmy Carter", "Ronald Reagan", "George H. W. Bush", "Bill Clinton", "George W. Bush", "Barack Obama", "Donald Trump", "Joe Biden", "Donald Trump",
    ]);
    expect(payload.terms.at(-1)?.label).toBe("Donald Trump (2025–present)");
  });
  it("has historical presidents that tile with the administrations table without a gap or overlap", () => {
    const all = [...HISTORICAL_ADMINISTRATIONS, ...admins].sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < all.length; i++) {
      const prevEnd = new Date(`${all[i - 1].end}T00:00:00Z`).getTime();
      expect((new Date(`${all[i].start}T00:00:00Z`).getTime() - prevEnd) / 86400000, `${all[i - 1].president} -> ${all[i].president}`).toBe(1);
    }
    expect(termOnDate(all, "1974-08-08")).toBe(all.findIndex((a) => a.president === "Richard Nixon"));
    expect(termOnDate(all, "1974-08-09")).toBe(all.findIndex((a) => a.president === "Gerald Ford"));
  });
  it("converts quarters", () => {
    expect(quarterOf("2026-03")).toBe(2026 * 4);
    expect(quarterEnd(quarterOf("2024-03"))).toBe("2024-03-31");
    expect(quarterEnd(quarterOf("2020-12"))).toBe("2020-12-31");
  });
  it("rejects a place that the two sources describe differently", () => {
    const bad = hrows.map((r) => (r.name === "Germany" ? { ...r, class: "territory" as const } : r));
    expect(() => buildTroopsPayload(rows, meta, admins, { rows: bad, meta: hmeta })).toThrow(/differs between sources/);
  });
});

describe("stacks and views", () => {
  it("sums hosts and afloat by region, and equals Σ rows minus territories (printed total ± documented gap) for the location years", () => {
    for (const y of payload.years.filter((y) => payload.periods[y.period].source === "dmdc_location")) {
      const p = payload.periods[y.period];
      const i = y.period;
      const yi = payload.years.indexOf(y);
      const s = stackByRegion(data, 0, yi, yi)[0];
      const v = periodView(data, 0, i);
      expect(s.total).toBe(v.abroad);
      const li = meta.periods.findIndex((x) => x.period === p.period);
      const printedOverseas = meta.periods[li].printed.overseas_total.total!;
      expect(v.abroad + v.territoryTotal + meta.periods[li].duplicate_rows_dropped.reduce((a, d) => a + d.total, 0)).toBe(printedOverseas + (p.overseasGap ?? 0));
    }
  });
  it("matches known Mar 2026 figures", () => {
    const v = periodView(data, 0, pi("2026-03"));
    expect(payload.places[v.ranked[0].place].name).toBe("Japan");
    expect(v.territories.find((t) => payload.places[t.place].name === "Guam")?.value).toBe(7137);
    expect(v.abroad).toBe(meta.periods.at(-1)!.abroad_total);
  });
  it("reads the history years through the same helpers", () => {
    const v = periodView(data, 0, payload.years[yidx(1957)].period);
    expect(payload.places[v.ranked[0].place].name).toBe("Germany");
    expect(v.ranked[0].value).toBe(244407);
    const vv = periodView(data, 0, payload.years[yidx(1968)].period);
    expect(payload.places[vv.ranked[0].place].name).toBe("Vietnam");
    expect(vv.ranked[0].value).toBe(537377);
    expect(stackByRegion(data, 0, yidx(2003), yidx(2003))[0].regions[REGION_IDS.indexOf("afloat_unassigned")]).toBe(47491);
    expect(stackByRegion(data, 0, yidx(1997), yidx(1997))[0].regions[REGION_IDS.indexOf("afloat_unassigned")]).toBe(0);
  });
  it("marks All branches and Army unavailable in the Army N/A quarters, but not the other branches", () => {
    const i = pi("2023-03");
    const total = (m: number) => payload.rows.filter((r) => r[1] === i).reduce((a, r) => a + (payload.places[r[0]].region && r[2] !== 1 ? (r[3 + m] ?? 0) : 0), 0);
    expect(unavailable(data, 0, i)).toBe(true);
    expect(unavailable(data, 1, i)).toBe(true);
    expect(unavailable(data, 2, i)).toBe(false);
    expect(total(2)).toBeGreaterThan(10000);
    expect(periodView(data, 0, i).ranked).toEqual([]);
  });
  it("keeps suppressed hosts out of the ranking and lists them", () => {
    const v = periodView(data, 0, pi("2019-06"));
    expect(v.suppressed.map((p) => payload.places[p].name).sort()).toEqual(["Afghanistan", "Iraq", "Syria"]);
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
    expect(stackByRegion(data, 0, yidx(1957), yidx(1957), place("Germany"))[0].total).toBe(244407);
  });
  it("merges Space Force into Air & Space Force so the branch is comparable across Sep 2023", () => {
    const jp = place("Japan");
    const a = stackByRegion(data, 4, yidx(2023) - 1, yidx(2023) - 1, jp)[0].total;
    const b = stackByRegion(data, 4, yidx(2023), yidx(2023), jp)[0].total;
    expect(a).toBeGreaterThan(1000);
    expect(Math.abs(b - a) / a).toBeLessThan(0.25);
  });
  it("refuses a percent change across a break, a source change or the partial year", () => {
    expect(changeVsPrior(data, 0, yidx(2018))).toBeNull(); // Dec 2017 break
    expect(changeVsPrior(data, 0, yidx(2026))).toBeNull(); // partial
    expect(changeVsPrior(data, 0, yidx(2019))).not.toBeNull();
    expect(changeVsPrior(data, 0, yidx(2017))).not.toBeNull();
    expect(changeVsPrior(data, 0, 0)).toBeNull();
    expect(changeVsPrior(data, 0, yidx(1996))).toBeNull(); // troopdata -> DMDC 309A (afloat starts)
    expect(changeVsPrior(data, 0, yidx(1997))).toBeNull(); // and back
    expect(changeVsPrior(data, 0, yidx(2006))).toBeNull(); // DMDC -> troopdata estimate
    expect(changeVsPrior(data, 0, yidx(2008))).toBeNull(); // troopdata -> DMDC location
    expect(changeVsPrior(data, 0, yidx(1999))).not.toBeNull(); // DMDC 309A -> DMDC 309A
    expect(changeVsPrior(data, 0, yidx(1960))).not.toBeNull(); // troopdata -> troopdata
  });
});

describe("contingency annotation (DMDC's in/around Iraq and Afghanistan totals)", () => {
  it("is carried for 2003-05 as separate figures and drawn above the bar, not inside it", () => {
    const at = (fy: number, m = 0, country = -1) => contingencyAt(data, m, payload.years[yidx(fy)].period, country);
    expect(at(2003).map((c) => [c.operation, payload.places[c.place].name, c.value])).toEqual([["OIF", "Iraq", 183002]]);
    expect(at(2004)[0]).toMatchObject({ value: 170647, basis: "includes_reserve_guard", rounded: false });
    expect(at(2005).map((c) => [payload.places[c.place].name, c.value])).toEqual([["Iraq", 192600], ["Afghanistan", 19500]]);
    expect(at(2005, 1).map((c) => c.value)).toEqual([132400, 15000]); // Army
    expect(at(2005, 0, place("Afghanistan")).map((c) => c.value)).toEqual([19500]);
    expect(at(2005, 0, place("Germany"))).toEqual([]);
    expect(at(2002)).toEqual([]);
    const s = stackByRegion(data, 0, yidx(2005), yidx(2005))[0];
    expect(s.ghost).toBe(212100);
    expect(s.total).toBe(periodView(data, 0, s.pi).abroad); // the bar itself does not include it
    expect(stackByRegion(data, 0, yidx(2006), yidx(2006))[0].ghost).toBe(0);
  });
  it("sits on rows the table prints as not reported", () => {
    for (const c of payload.contingency) {
      const r = data.byPeriod[c.period].find((x) => x.place === c.place)!;
      expect(r.state).toBe(1);
    }
    expect(periodView(data, 0, payload.years[yidx(2004)].period).contingency).toHaveLength(1);
  });
});

describe("who's hosted the most", () => {
  const all = topHostsByYear(data, 0, 0, payload.years.length - 1);
  const name = (yr: number) => payload.places[all[yidx(yr)].top[0].place].name;
  it("names the largest host each year", () => {
    expect(all).toHaveLength(payload.years.length);
    expect(name(1953)).toBe("South Korea");
    expect(name(1957)).toBe("Germany");
    expect(name(1968)).toBe("Vietnam");
    expect(name(2003)).toBe("Germany"); // Iraq is not reported in the country rows
    expect(name(2008)).toBe("Iraq");
    expect(name(2012)).toBe("Afghanistan");
    expect(name(2019)).toBe("Japan");
    expect(name(2025)).toBe("Japan");
    expect(all[yidx(2025)].top).toHaveLength(3);
    expect(all[yidx(2025)].hostTotal).toBeGreaterThan(all[yidx(2025)].top[0].value);
  });
  it("never ranks afloat/unassigned, territories or not-reported hosts", () => {
    for (const y of all) for (const t of y.top) expect(payload.places[t.place].cls).toBe("host");
    expect(all[yidx(2019)].top.some((t) => payload.places[t.place].name === "Iraq")).toBe(false);
  });
  it("groups consecutive years with the same No. 1 into runs that cover every year", () => {
    const runs = topHostRuns(all);
    expect(runs[0].from).toBe(0);
    expect(runs.at(-1)!.to).toBe(all.length - 1);
    for (let i = 1; i < runs.length; i++) expect(runs[i].from).toBe(runs[i - 1].to + 1);
    const germany = runs.filter((r) => payload.places[r.place].name === "Germany");
    expect(germany.length).toBeGreaterThanOrEqual(2);
  });
  it("has no branch split for the 2006-07 estimates, so the whole figure is the unsplit remainder", () => {
    const iraq = all[yidx(2006)].top[0];
    expect(payload.places[iraq.place].name).toBe("Iraq");
    expect(iraq.branches).toEqual([0, 0, 0, 0]);
    expect(iraq.rest).toBe(iraq.value);
    const de = all[yidx(2025)].top[0];
    expect(de.rest / de.value).toBeLessThan(0.02); // a Coast Guard-sized remainder at most
    expect(topHostsByYear(data, 1, yidx(2006), yidx(2006))[0].top.some((t) => t.rest > 0)).toBe(false); // a single branch has no remainder
  });
  it("follows the branch filter", () => {
    const navy = topHostsByYear(data, 2, yidx(2025), yidx(2025))[0];
    expect(payload.places[navy.top[0].place].name).toBe("Japan");
    expect(navy.top[0].value).toBeLessThan(all[yidx(2025)].top[0].value);
  });
});

describe("axis helpers", () => {
  it("spaces year labels about 34px apart", () => {
    expect(yearLabelEvery(40)).toBe(1);
    expect(yearLabelEvery(20)).toBe(2);
    expect(yearLabelEvery(12)).toBe(5);
    expect(yearLabelEvery(4)).toBe(10);
    expect(yearLabelEvery(1.5)).toBe(20);
  });
  it("builds round ticks that hold the maximum", () => {
    const { ticks, top } = niceCountTicks(1079005);
    expect(top).toBeGreaterThanOrEqual(1079005);
    expect(ticks[0]).toBe(0);
    expect(ticks.at(-1)).toBe(top);
    expect(niceCountTicks(0).top).toBe(1);
    expect(formatCountAxis(150000)).toBe("150k");
    expect(formatCountAxis(2500)).toBe("2.5k");
    expect(formatCountAxis(1500000)).toBe("1.5M");
  });
});
