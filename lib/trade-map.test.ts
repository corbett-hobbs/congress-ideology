import { describe, expect, it } from "vitest";
import { buildMapModel, mapFill, topByTotal } from "./trade-map";
import { partnerChartRows } from "./trade-partners";
import type { YearPartnerRow } from "./trade-types";

const P: YearPartnerRow[] = [
  ["CHN", "China", 150_000, 450_000, null, null],
  ["CAN", "Canada", 340_000, 420_000, null, null],
  ["NLD", "Netherlands", 60_000, 20_000, null, null],
  ["MLT", "Malta", 500, 300, null, null],
  ["ZZZ", "Nowhere", 0, 0, null, null],
];

describe("trade map", () => {
  it("bins total trade on fixed thresholds", () => {
    const rows = partnerChartRows(P, { key: "total", reversed: false });
    const f = (c: string) => mapFill(rows.find((r) => r.code === c), "total");
    expect(f("CHN").cls).toBe(5);
    expect(f("MLT").cls).toBe(1);
    expect(f("ZZZ").cls).toBe(0);
  });
  it("splits balance into deficit and surplus", () => {
    const rows = partnerChartRows(P, { key: "total", reversed: false });
    expect(mapFill(rows.find((r) => r.code === "CHN"), "balance")).toEqual({ cls: 4, side: "deficit" });
    expect(mapFill(rows.find((r) => r.code === "NLD"), "balance")).toEqual({ cls: 3, side: "surplus" });
  });
  it("lists partners with no outline and ranks the top by total", () => {
    const m = buildMapModel(P, new Set(["CHN", "CAN", "NLD"]));
    expect(m.undrawn.map((r) => r.code)).toEqual(["MLT"]);
    expect(topByTotal(P, 2)).toEqual(["CAN", "CHN"]);
  });
});
