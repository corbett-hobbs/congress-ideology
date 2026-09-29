import { describe, expect, it } from "vitest";
import {
  NET_WORTH_CAP,
  clampNetWorth,
  isClipped,
  netWorthChange,
  pickStandouts,
  placeStandoutLabels,
  signedLog,
  signedLogInverse,
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

describe("signedLog", () => {
  it("is odd, zero at zero, and monotonic", () => {
    expect(signedLog(0)).toBe(0);
    expect(signedLog(-5_000_000)).toBeCloseTo(-signedLog(5_000_000));
    expect(signedLog(1e6)).toBeGreaterThan(signedLog(1e5));
  });

  it("round-trips whole-dollar tick values", () => {
    for (const v of [0, 100_000, -1_000_000, 5_000_000, -20_000_000]) {
      expect(signedLogInverse(signedLog(v))).toBe(v);
    }
  });
});

describe("clampNetWorth / isClipped", () => {
  it("clamps to the cap on both sides", () => {
    expect(clampNetWorth(125_950_000)).toBe(NET_WORTH_CAP);
    expect(clampNetWorth(-90_000_000)).toBe(-NET_WORTH_CAP);
    expect(clampNetWorth(1234)).toBe(1234);
  });

  it("flags a member clipped on either coordinate, not one exactly at the cap", () => {
    const at = member("A", [{ year: 2013, midpoint: NET_WORTH_CAP }, { year: 2020, midpoint: 5 }]);
    const over = member("B", [{ year: 2013, midpoint: 5 }, { year: 2020, midpoint: NET_WORTH_CAP + 1 }]);
    expect(isClipped(at)).toBe(false);
    expect(isClipped(over)).toBe(true);
  });
});

describe("pickStandouts", () => {
  it("picks top/bottom n by total dollar change, not rate", () => {
    const cohort = [
      member("A", [{ year: 2013, midpoint: 0 }, { year: 2023, midpoint: 70_000_000 }]), // +70M over 10y
      member("B", [{ year: 2013, midpoint: 0 }, { year: 2015, midpoint: 7_000_000 }]), // +7M over 2y: higher rate than A, smaller total
      member("C", [{ year: 2013, midpoint: 0 }, { year: 2023, midpoint: -70_000_000 }]),
      member("D", [{ year: 2013, midpoint: 0 }, { year: 2015, midpoint: -7_000_000 }]),
    ];
    const { top, bottom } = pickStandouts(cohort, 2);
    expect(top.map((e) => e.member.bioguideId)).toEqual(["A", "B"]);
    expect(bottom.map((e) => e.member.bioguideId)).toEqual(["C", "D"]);
    expect(netWorthChange(cohort[0])).toBe(70_000_000);
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

describe("placeStandoutLabels", () => {
  it("flips labels for dots on the right side and separates stacked ones", () => {
    const out = placeStandoutLabels(
      [
        { cx: 50, cy: 100 },
        { cx: 500, cy: 102 },
        { cx: 60, cy: 104 },
      ],
      560,
    );
    expect(out[0].anchor).toBe("start");
    expect(out[1].anchor).toBe("end");
    expect(Math.abs(out[2].y - out[0].y)).toBeGreaterThanOrEqual(14 - 1e-9);
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
