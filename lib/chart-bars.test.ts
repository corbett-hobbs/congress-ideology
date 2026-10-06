import { describe, expect, it } from "vitest";
import { segmentLabelFits, yLabelInset } from "./chart-bars";

const fmt = (v: number) => `${v}k`;

describe("yLabelInset", () => {
  it("is 0 when no bar rises above a label's gridline", () => {
    expect(yLabelInset({ ticks: [0, 100], format: fmt, tops: [0, 0], step: 40, barW: 30 })).toBe(0);
  });
  it("is 0 when the first bar already starts clear of the label", () => {
    expect(yLabelInset({ ticks: [100], format: fmt, tops: [500], step: 120, barW: 30 })).toBe(0);
  });
  it("pushes the first bar right when a tall bar sits under a label", () => {
    const inset = yLabelInset({ ticks: [0, 100, 200], format: fmt, tops: [300, 300], step: 40, barW: 28 });
    expect(inset).toBeGreaterThan(0);
    expect(6 + inset).toBeGreaterThanOrEqual("200k".length * 6.2 + 8);
  });
});

describe("segmentLabelFits", () => {
  it("needs enough height and width", () => {
    expect(segmentLabelFits(20, 40, "31")).toBe(true);
    expect(segmentLabelFits(10, 40, "31")).toBe(false);
    expect(segmentLabelFits(20, 12, "31")).toBe(false);
  });
});
