import { describe, expect, it } from "vitest";
import { sparklineData } from "./wealth-sparkline";

const YEARS = Array.from({ length: 13 }, (_, i) => 2013 + i);

describe("sparklineData", () => {
  it("returns empty data for an all-null series", () => {
    const d = sparklineData(new Array(13).fill(null), YEARS);
    expect(d.points).toEqual([]);
    expect(d.firstYear).toBeNull();
  });

  it("flags a single known year as singleYear, no segments", () => {
    const series = new Array(13).fill(null);
    series[5] = 100;
    const d = sparklineData(series, YEARS);
    expect(d.singleYear).toBe(true);
    expect(d.points).toHaveLength(1);
    expect(d.segments).toEqual([]);
    expect(d.firstYear).toBe(2018);
    expect(d.lastYear).toBe(2018);
  });

  it("normalizes x to [0,1] across the full span and y to the member's own range", () => {
    const series = new Array(13).fill(null);
    series[0] = 0;
    series[12] = 100;
    const d = sparklineData(series, YEARS);
    expect(d.points[0]).toMatchObject({ x: 0, y: 0, year: 2013 });
    expect(d.points[1]).toMatchObject({ x: 1, y: 1, year: 2025 });
  });

  it("marks a segment dashed when years aren't adjacent", () => {
    const series = new Array(13).fill(null);
    series[0] = 10;
    series[1] = 20;
    series[5] = 30;
    const d = sparklineData(series, YEARS);
    expect(d.segments).toEqual([
      { from: 0, to: 1, dashed: false },
      { from: 1, to: 2, dashed: true },
    ]);
  });

  it("centers y at 0.5 when every known value is equal", () => {
    const series = new Array(13).fill(null);
    series[0] = 50;
    series[1] = 50;
    const d = sparklineData(series, YEARS);
    expect(d.points.every((p) => p.y === 0.5)).toBe(true);
  });
});
