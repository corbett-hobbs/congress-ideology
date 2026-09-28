import { describe, expect, it } from "vitest";
import {
  jitterOffsets,
  jitterSpreadWidth,
  pickStandouts,
  spreadLabelsY,
  yearsOfData,
} from "./wealth-scatter";
import type { WealthMember } from "./wealth-data";

function member(
  bioguideId: string,
  points: { year: number; midpoint: number }[],
): WealthMember {
  return {
    bioguideId,
    name: `First ${bioguideId}`,
    chamber: "house",
    state: "CA",
    district: 1,
    caucus: "Democrat",
    entryYear: 2013,
    hasPhoto: false,
    series: [],
    points: points.map((p) => ({
      year: p.year,
      midpoint: p.midpoint,
      range: { lo: null, hi: null, openEnded: false, unavailable: true },
    })),
  };
}

describe("yearsOfData", () => {
  it("is the span between first and last usable year", () => {
    const m = member("A000001", [
      { year: 2015, midpoint: 100 },
      { year: 2020, midpoint: 200 },
    ]);
    expect(yearsOfData(m)).toBe(5);
  });
});

describe("jitterOffsets", () => {
  it("returns a single 0 offset for one point", () => {
    expect(jitterOffsets(1, 44)).toEqual([0]);
  });

  it("evenly spreads n points across the width, centered on 0", () => {
    const offsets = jitterOffsets(3, 40);
    expect(offsets).toEqual([-20, 0, 20]);
    expect(offsets.reduce((a, b) => a + b, 0)).toBeCloseTo(0);
  });
});

describe("jitterSpreadWidth", () => {
  it("caps at 44px", () => {
    expect(jitterSpreadWidth(1000)).toBe(44);
  });

  it("is 80% of a narrow column", () => {
    expect(jitterSpreadWidth(40)).toBeCloseTo(32);
  });
});

describe("pickStandouts", () => {
  it("picks top/bottom n by rate with no overlap", () => {
    const cohort = [
      member("A", [{ year: 2013, midpoint: 0 }, { year: 2020, midpoint: 70_000_000 }]), // +10M/yr
      member("B", [{ year: 2013, midpoint: 0 }, { year: 2020, midpoint: 7_000_000 }]), // +1M/yr
      member("C", [{ year: 2013, midpoint: 0 }, { year: 2020, midpoint: -70_000_000 }]), // -10M/yr
      member("D", [{ year: 2013, midpoint: 0 }, { year: 2020, midpoint: -7_000_000 }]), // -1M/yr
    ];
    const { top, bottom } = pickStandouts(cohort, 2);
    expect(top.map((e) => e.member.bioguideId)).toEqual(["A", "B"]);
    expect(bottom.map((e) => e.member.bioguideId)).toEqual(["C", "D"]);
  });

  it("never puts the same member in both top and bottom for a small cohort", () => {
    const cohort = [
      member("A", [{ year: 2013, midpoint: 0 }, { year: 2020, midpoint: 100 }]),
    ];
    const { top, bottom } = pickStandouts(cohort, 3);
    expect(top).toHaveLength(1);
    expect(bottom).toHaveLength(0);
  });
});

describe("spreadLabelsY", () => {
  it("leaves well-separated labels alone", () => {
    expect(spreadLabelsY([10, 100, 200], 20, 300)).toEqual([10, 100, 200]);
  });

  it("pushes colliding labels apart", () => {
    const out = spreadLabelsY([100, 105], 20, 300);
    expect(out[1] - out[0]).toBeCloseTo(20, 5);
  });

  it("clamps to the chart bounds", () => {
    const out = spreadLabelsY([0, 5], 20, 300);
    expect(out[0]).toBeGreaterThanOrEqual(0);
  });
});
