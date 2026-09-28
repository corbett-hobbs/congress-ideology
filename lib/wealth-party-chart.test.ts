import { describe, expect, it } from "vitest";
import { sampleRange, type PartyChartPoint } from "./wealth-party-chart";

const series: PartyChartPoint[] = [
  { year: 2013, dem: 100, demCount: 5, rep: null, repCount: 0 },
  { year: 2014, dem: 200, demCount: 10, rep: 50, repCount: 3 },
  { year: 2015, dem: null, demCount: 0, rep: 60, repCount: 8 },
];

describe("sampleRange", () => {
  it("returns [min, max] over years with a non-zero count", () => {
    expect(sampleRange(series, "demCount")).toEqual([5, 10]);
    expect(sampleRange(series, "repCount")).toEqual([3, 8]);
  });

  it("returns null when every year is empty", () => {
    const empty: PartyChartPoint[] = [
      { year: 2013, dem: null, demCount: 0, rep: null, repCount: 0 },
    ];
    expect(sampleRange(empty, "demCount")).toBeNull();
  });
});
