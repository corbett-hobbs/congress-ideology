import { describe, expect, it } from "vitest";
import {
  fromEconomyPayload,
  monthlySeries,
  quarterlySeries,
  recessionLabel,
  recessionSpans,
  toEconomyPayload,
  weeklyTuples,
  type EconomyData,
} from "./indicator-payload";
import { dateOfDay, dayOf, dayOfIso } from "./indicator-time";

describe("indicator payload builders", () => {
  it("indexes monthly series from Jan 1991 with null gaps", () => {
    const s = monthlySeries(
      [
        { date: "1991-01-01", value: 1 },
        { date: "1991-03-01", value: 3 },
        { date: "1990-12-01", value: 9 },
      ],
      1,
    );
    expect(s).toEqual([1, null, 3]);
  });
  it("keeps derived nulls", () => {
    expect(monthlySeries([{ date: "1991-01-01", value: null }], 1)).toEqual([null]);
  });
  it("indexes quarterly from Q1 1991", () => {
    expect(quarterlySeries([{ date: "1991-04-01", value: 5 }], 2)).toEqual([null, 5]);
  });
  it("weekly tuples are [day, value] and drop pre-axis dates", () => {
    expect(weeklyTuples([{ date: "1990-12-31", value: 1 }, { date: "1991-01-21", value: 1.1234 }], 3)).toEqual([[20, 1.123]]);
  });
  it("recession runs span first month through end of the last month", () => {
    const pts = [
      ["1990-06-01", 0], ["1990-07-01", 1], ["1991-03-01", 1], ["1991-04-01", 0],
      ["2020-02-01", 1], ["2020-03-01", 1], ["2020-04-01", 1], ["2020-05-01", 0],
      ["2026-08-01", 1],
    ].map(([date, value]) => ({ date: date as string, value: value as number }));
    const r = recessionSpans(pts);
    expect(r).toEqual([
      [dayOfIso("1990-07-01"), dayOfIso("1991-04-01")],
      [dayOfIso("2020-02-01"), dayOfIso("2020-05-01")],
      [dayOfIso("2026-08-01"), dayOfIso("2026-09-01")],
    ]);
    expect(recessionLabel(r[0], dateOfDay)).toBe("1990–91");
    expect(recessionLabel(r[1], dateOfDay)).toBe("2020");
  });
  it("drops recessions that ended before the axis", () => {
    expect(recessionSpans([{ date: "1980-01-01", value: 1 }, { date: "1980-02-01", value: 0 }])).toEqual([]);
  });
  it("a December run ends on Jan 1 of the next year", () => {
    expect(recessionSpans([{ date: "2001-12-01", value: 1 }, { date: "2002-01-01", value: 0 }])[0][1]).toBe(dayOf(2002, 0, 1));
  });
});

describe("EconomyPayload codec", () => {
  it("round-trips annual records through tuples", () => {
    const d = { inc: { 1991: 1, 2024: 3 }, def: { 2000: -1.5 } } as unknown as EconomyData;
    const p = toEconomyPayload(d);
    expect(p.inc).toEqual([[1991, 1], [2024, 3]]);
    const back = fromEconomyPayload(p);
    expect(back.inc).toEqual(d.inc);
    expect(back.def).toEqual(d.def);
  });
});
