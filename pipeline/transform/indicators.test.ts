import { describe, expect, it } from "vitest";
import { CATALOG, type RawFredSeries } from "../../lib/indicator-entities";
import { IndicatorDataError, checkCoverage, normalizeSeries, validateIndicators } from "./indicators";

const entry = CATALOG.find((c) => c.series_id === "UNRATE")!;
const raw = (observations: [string, string][]): RawFredSeries => ({
  fetched_at: "2026-09-30T00:00:00.000Z",
  series: {
    id: "UNRATE",
    title: "Unemployment Rate",
    units: "Percent",
    frequency: "Monthly",
    seasonal_adjustment: "Seasonally Adjusted",
    observation_start: observations[0][0],
    observation_end: observations[observations.length - 1][0],
    last_updated: "2026-09-04 08:27:31-05",
    notes: "",
  },
  observations,
});

describe("normalizeSeries", () => {
  it('skips FRED\'s "." (never coerces to 0) and keeps values numeric', () => {
    const n = normalizeSeries(raw([["2025-09-01", "4.4"], ["2025-10-01", "."], ["2025-11-01", "4.6"]]), entry);
    expect(n.observations.map((o) => o.value)).toEqual([4.4, 4.6]);
    expect(n.skippedMissing).toEqual(["2025-10-01"]);
    expect(n.series.first_observation).toBe("2025-09-01");
    expect(n.series.observation_count).toBe(2);
  });
  it("rejects a non-numeric value", () => {
    expect(() => normalizeSeries(raw([["2025-09-01", "n/a"]]), entry)).toThrow(IndicatorDataError);
  });
  it("rejects an impossible date", () => {
    expect(() => normalizeSeries(raw([["2025-02-30", "4"]]), entry)).toThrow(/real date/);
  });
  it("fails when FRED has redefined the frequency", () => {
    const r = raw([["2025-09-01", "4.4"]]);
    r.series.frequency = "Quarterly";
    expect(() => normalizeSeries(r, entry)).toThrow(/redefined/);
  });
});

describe("checkCoverage", () => {
  const months = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => `${1991 + Math.floor((from + i) / 12)}-${String(((from + i) % 12) + 1).padStart(2, "0")}-01`);
  it("passes a complete monthly run and allows a single missing month (exactly 2x)", () => {
    expect(checkCoverage(months(0, 24), "monthly")).toEqual([]);
    expect(checkCoverage(months(0, 24).filter((d) => d !== "1992-06-01"), "monthly")).toEqual([]);
  });
  it("fails an internal gap larger than twice the frequency", () => {
    const dates = months(0, 24).filter((d) => d !== "1992-05-01" && d !== "1992-06-01");
    expect(checkCoverage(dates, "monthly")[0]).toMatch(/gap of 91 days/);
  });
  it("fails when the series starts after the window start", () => {
    expect(checkCoverage(["1992-01-01", "1992-02-01"], "monthly")[0]).toMatch(/after the window start/);
  });
  it("lets an annual value dated just before the start cover it, and tail lag pass", () => {
    expect(checkCoverage(["1990-01-01", "1991-01-01", "1992-01-01"], "annual")).toEqual([]);
  });
  it("catches the GASREGW head gap if the window start moved before 1991-01-21", () => {
    const weeks = ["1990-11-26", "1991-01-21", "1991-01-28"];
    expect(checkCoverage(weeks, "weekly", "1991-01-03").length).toBeGreaterThan(0);
    expect(checkCoverage(weeks, "weekly", "1991-01-21")).toEqual([]);
  });
});

describe("validateIndicators", () => {
  const all = () => {
    const n = normalizeSeries(raw(Array.from({ length: 12 }, (_, i) => [`1991-${String(i + 1).padStart(2, "0")}-01`, "6"] as [string, string])), entry);
    const series = CATALOG.map((c) => ({ ...n.series, series_id: c.series_id, frequency: "monthly" as const }));
    const observations = CATALOG.flatMap((c) => n.observations.map((o) => ({ ...o, series_id: c.series_id })));
    return { series, observations };
  };
  it("passes a complete set", () => {
    const { series, observations } = all();
    expect(validateIndicators(series, observations).counts.UNRATE).toBe(12);
  });
  it("fails loudly on a duplicate (series_id, date)", () => {
    const { series, observations } = all();
    expect(() => validateIndicators(series, [...observations, observations[0]])).toThrow(/duplicate observation/);
  });
  it("fails when a series is missing", () => {
    const { series, observations } = all();
    expect(() => validateIndicators(series.slice(1), observations)).toThrow(IndicatorDataError);
  });
});
