import { describe, expect, it } from "vitest";
import { findExtremes } from "./chart-extremes";

const p = (day: number, value: number | null) => ({ day, value });

describe("findExtremes", () => {
  it("finds the highest and lowest point", () => {
    const { peak, low } = findExtremes([p(1, 3), p(2, 9), p(3, 1), p(4, 5)]);
    expect(peak?.day).toBe(2);
    expect(low?.day).toBe(3);
  });

  it("skips gaps and takes the earliest of tied points", () => {
    const { peak, low } = findExtremes([p(1, null), p(2, 7), p(3, 7), p(4, 2), p(5, 2)]);
    expect(peak?.day).toBe(2);
    expect(low?.day).toBe(4);
  });

  it("returns neither for a flat, single-value or empty series", () => {
    expect(findExtremes([p(1, 4), p(2, 4)])).toEqual({ peak: null, low: null });
    expect(findExtremes([p(1, 4)])).toEqual({ peak: null, low: null });
    expect(findExtremes([p(1, null)])).toEqual({ peak: null, low: null });
    expect(findExtremes([])).toEqual({ peak: null, low: null });
  });

  it("handles negative values", () => {
    const { peak, low } = findExtremes([p(1, -5), p(2, -20), p(3, -1)]);
    expect(peak?.day).toBe(3);
    expect(low?.day).toBe(2);
  });
});

import { pickPerGroup } from "./chart-extremes";

describe("pickPerGroup", () => {
  const items = [
    { g: "D", x: -0.4 }, { g: "D", x: -0.9 }, { g: "D", x: -0.2 },
    { g: "R", x: 0.5 }, { g: "R", x: 0.95 },
    { g: "I", x: 0.1 },
  ];
  it("takes the highest-scoring item of each group, largest group first", () => {
    const out = pickPerGroup(items, (i) => i.g, (i) => Math.abs(i.x));
    expect(out.map((i) => i.x)).toEqual([-0.9, 0.95, 0.1]);
  });
  it("caps the number of groups and skips null scores", () => {
    expect(pickPerGroup(items, (i) => i.g, (i) => Math.abs(i.x), 2).map((i) => i.g)).toEqual(["D", "R"]);
    expect(pickPerGroup(items, (i) => i.g, () => null)).toEqual([]);
  });
});
