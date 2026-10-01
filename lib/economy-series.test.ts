import { describe, expect, it } from "vitest";
import { fiscalBars, miseryPoints, monthlyPoints, yearRows } from "./economy-series";
import { dayOf } from "./indicator-time";

describe("economy series", () => {
  it("monthly points sit on the first of the month and keep gaps", () => {
    const p = monthlyPoints([1, null]);
    expect(p[1]).toEqual({ day: dayOf(1991, 1, 1), value: null });
  });
  it("fiscal bars run Oct 1 to Sep 30", () => {
    const [b] = fiscalBars({ 2020: -14.5 });
    expect(b.s).toBe(dayOf(2019, 9, 1));
    expect(b.e).toBe(dayOf(2020, 9, 1));
    expect(b.mid).toBe(dayOf(2020, 3, 1));
  });
  it("misery is null when either input is missing", () => {
    expect(miseryPoints({ un: [5, null], infl: [2, 3] }).map((p) => p.value)).toEqual([7, null]);
  });
  it("year rows summarise last/low/high and skip gaps", () => {
    const rows = yearRows([
      { day: dayOf(1991, 0, 1), value: 3 },
      { day: dayOf(1991, 5, 1), value: 1 },
      { day: dayOf(1991, 8, 1), value: null },
      { day: dayOf(1991, 11, 1), value: 2 },
    ]);
    expect(rows).toEqual([{ year: 1991, last: 2, low: 1, high: 3 }]);
  });
});
