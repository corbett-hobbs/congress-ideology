import { describe, expect, it } from "vitest";
import { partnerChartRows, partnerMeta, partnerScale } from "./trade-partners";
import type { YearPartnerRow } from "./trade-types";

const row = (code: string, name: string, ex: number, im: number, d: number | null = null, v: number | null = null): YearPartnerRow => [code, name, ex, im, d, v];
const partners = [row("CHN", "China", 150_000, 440_000, 80_000_000_000, 440_000_000_000), row("CAN", "Canada", 340_000, 410_000), row("ZZZ", "Nothing", 0, 0), row("SGP", "Singapore", 40_000, 20_000)];

describe("partnerChartRows", () => {
  it("drops partners with no trade and sorts by balance, biggest deficit first", () => {
    const rows = partnerChartRows(partners, { key: "balance", reversed: false });
    expect(rows.map((r) => r.code)).toEqual(["CHN", "CAN", "SGP"]);
    expect(rows[0].balance).toBe(-290_000);
  });
  it("reverses", () => {
    expect(partnerChartRows(partners, { key: "balance", reversed: true }).map((r) => r.code)).toEqual(["SGP", "CAN", "CHN"]);
  });
  it("derives the duty rate from the year's duties over imports for consumption", () => {
    const rows = partnerChartRows(partners, { key: "alpha", reversed: false });
    expect(rows.find((r) => r.code === "CHN")!.rate).toBeCloseTo(80 / 440, 6);
    expect(rows.find((r) => r.code === "CAN")!.rate).toBeNull();
  });
  it("labels the signed balance with a true minus", () => {
    const [china, , sgp] = partnerChartRows(partners, { key: "balance", reversed: false });
    expect(partnerMeta(china)).toBe("−$290B");
    expect(partnerMeta(sgp)).toBe("+$20.0B");
  });
});

describe("partnerScale", () => {
  const rows = partnerChartRows(partners, { key: "alpha", reversed: false });
  const s = partnerScale(rows);
  it("covers the largest flow and keeps small partners distinguishable from zero", () => {
    const x = s.make(1000);
    expect(x(0)).toBe(0);
    expect(x(440_000)).toBeLessThan(1000);
    expect(x(440_000)).toBeGreaterThan(900);
    // $500M and $5B must not collapse onto the same pixel on a symlog axis
    expect(x(5_000) - x(500)).toBeGreaterThan(50);
  });
  it("ticks are 0 and powers of ten up to the maximum", () => {
    expect(s.ticks).toEqual([0, 1_000, 10_000, 100_000]);
    expect(partnerScale([]).ticks).toEqual([0, 1_000]);
  });
});
