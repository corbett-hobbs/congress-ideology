import { describe, expect, it } from "vitest";
import { dateOfDay } from "./indicator-time";
import { fmtMoney, fmtTick, lastIndexWithData, monthMidDay, monthStartDay, niceScale, plotted, readingAtDay, scaleFor, spanEnd, termAtDay } from "./trade-chart";
import type { EconomyTerm } from "./economy-presidents";

describe("axis days", () => {
  it("month starts land on the first of the month", () => {
    for (const i of [0, 11, 12, 426]) expect(dateOfDay(monthStartDay(i)).day).toBe(1);
    expect(dateOfDay(monthStartDay(12))).toMatchObject({ year: 1992, month: 0 });
    expect(monthMidDay(0)).toBe(14);
    expect(dateOfDay(spanEnd(426))).toMatchObject({ year: 2026, month: 7 });
  });
});

describe("money format", () => {
  it("uses a true minus and scales units", () => {
    expect(fmtMoney(-66723.1)).toBe("−$66.7B");
    expect(fmtMoney(-1_234_619)).toBe("−$1.23T");
    expect(fmtMoney(850)).toBe("$850M");
    expect(fmtMoney(5000, { signed: true })).toBe("+$5.0B");
    expect(fmtMoney(-150_000)).toBe("−$150B");
  });
  it("tick labels are compact", () => {
    expect([fmtTick(0), fmtTick(-100_000), fmtTick(50_000), fmtTick(500)]).toEqual(["0", "−$100B", "$50B", "$500M"]);
  });
});

describe("niceScale", () => {
  it("covers the data, includes 0 and uses round steps", () => {
    const s = niceScale(-118_000, 4_000);
    expect(s.lo).toBeLessThanOrEqual(-118_000);
    expect(s.hi).toBeGreaterThanOrEqual(4_000);
    expect(s.ticks).toContain(0);
    const steps = s.ticks.slice(1).map((v, i) => v - s.ticks[i]);
    expect(new Set(steps).size).toBe(1);
  });
  it("handles an all-positive and an empty range", () => {
    expect(niceScale(10, 90).lo).toBe(0);
    expect(niceScale(0, 0).ticks).toEqual([0, 1]);
  });
});

describe("series helpers", () => {
  const s = { exports: [10, 20, null, 40], imports: [30, 25, 5, null] };
  it("balance measure plots exports minus imports, nulls propagate", () => {
    expect(plotted(s, "balance").main).toEqual([-20, -5, null, null]);
    expect(plotted(s, "flows").second).toEqual(s.imports);
  });
  it("the scale is for the whole series and the last month with both values is found", () => {
    expect(scaleFor(s, "balance").lo).toBeLessThanOrEqual(-20);
    expect(lastIndexWithData(s)).toBe(1);
  });
  it("reads the month for an axis day, null past the end", () => {
    const r = readingAtDay(s, monthStartDay(1) + 10)!;
    expect(r).toMatchObject({ month: 1, label: "February 1991", exports: 20, imports: 25, balance: -5 });
    expect(readingAtDay(s, monthStartDay(9))).toBeNull();
    expect(readingAtDay(s, -3)).toBeNull();
  });
  it("finds the president for a day", () => {
    const terms = [{ s: 0, e: 100, label: "A 1" }, { s: 100, e: 200, label: "B 2" }] as EconomyTerm[];
    expect(termAtDay(terms, 150)?.label).toBe("B 2");
    expect(termAtDay(terms, 100)?.label).toBe("B 2");
  });
});
