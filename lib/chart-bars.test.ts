import { describe, expect, it } from "vitest";
import { Y_GUTTER, segmentLabelFits, yGutter } from "./chart-bars";

describe("yGutter", () => {
  it("fits the widest label plus the 6px tick offset and some air", () => {
    expect(yGutter(["0", "500k"])).toBeGreaterThanOrEqual(4 * 6.7 + 10);
    expect(yGutter(["0", "1.5M", "100"])).toBe(yGutter(["1.5M"]));
    expect(yGutter([])).toBe(10);
  });
  it("has a default that holds five characters", () => {
    expect(Y_GUTTER).toBeGreaterThanOrEqual(yGutter(["−0.50", "$30B", "100%"]));
  });
});

describe("segmentLabelFits", () => {
  it("needs enough height and width", () => {
    expect(segmentLabelFits(20, 40, "31")).toBe(true);
    expect(segmentLabelFits(10, 40, "31")).toBe(false);
    expect(segmentLabelFits(20, 12, "31")).toBe(false);
  });
});
