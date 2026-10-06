import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENERGY_CATALOG, type EnergyObservation, type EnergySeries, type RawEnergySeries } from "../../lib/energy-entities";
import { diffSeries } from "../fetch/energy-diff";
import { EnergyDataError, normalizeSeries, parseValue, periodToDate, statusFor, validateEnergy } from "./energy";

const entry = (id: string) => ENERGY_CATALOG.find((c) => c.series_id === id)!;
const rows = <T>(f: string) => JSON.parse(readFileSync(`pipeline/output/${f}`, "utf8")) as T[];
const series = rows<EnergySeries>("energy_series.json");
const obs = rows<EnergyObservation>("energy_observations.json");
const val = (id: string, date: string) => obs.find((o) => o.series_id === id && o.date === date)?.value;
const sumYear = (id: string, year: number) => obs.filter((o) => o.series_id === id && o.date.startsWith(`${year}-`)).reduce((s, o) => s + o.value, 0);

const raw = (id: string, observations: [string, string | null][], over: Partial<RawEnergySeries["series"]> = {}): RawEnergySeries => ({
  fetched_at: "2026-10-06T12:00:00.000Z",
  series: { id, title: "t", units: entry(id).source_units, route: entry(id).source.route, query: "q", total: observations.length, ...over },
  observations,
});

describe("parseValue", () => {
  it("reads numbers, including small negatives and bare decimals", () => {
    expect(parseValue("13850.419", "x")).toBe(13850.419);
    expect(parseValue("-.069", "x")).toBe(-0.069);
    expect(parseValue(".5", "x")).toBe(0.5);
  });
  it("treats the known missing markers as missing, never zero", () => {
    expect(parseValue("Not Available", "x")).toBeNull();
    expect(parseValue("No Data Reported", "x")).toBeNull();
    expect(parseValue(null, "x")).toBeNull();
  });
  it("fails loudly on any other string", () => {
    expect(() => parseValue("NA", "x")).toThrow(EnergyDataError);
    expect(() => parseValue("1,234", "x")).toThrow(EnergyDataError);
  });
});

describe("periodToDate", () => {
  it("dates a month to its first day and keeps weekly dates", () => {
    expect(periodToDate("2026-08", "monthly", "x")).toBe("2026-08-01");
    expect(periodToDate("2026-09-25", "weekly", "x")).toBe("2026-09-25");
  });
  it("rejects the wrong shape for the frequency", () => {
    expect(() => periodToDate("2026-08-01", "monthly", "x")).toThrow();
    expect(() => periodToDate("2026-08", "weekly", "x")).toThrow();
    expect(() => periodToDate("2026-13", "monthly", "x")).toThrow();
  });
});

describe("statusFor", () => {
  it("marks the trailing 12 months preliminary", () => {
    expect(statusFor("trailing_12_months", "2026-08-01", "2026-08-01", "2026-10-06T00:00:00Z")).toBe("preliminary");
    expect(statusFor("trailing_12_months", "2025-09-01", "2026-08-01", "2026-10-06T00:00:00Z")).toBe("preliminary");
    expect(statusFor("trailing_12_months", "2025-08-01", "2026-08-01", "2026-10-06T00:00:00Z")).toBe("final");
  });
  it("electricity: fetch year and the year before are preliminary (EPM wording)", () => {
    expect(statusFor("current_and_prior_calendar_year", "2025-01-01", "2026-06-01", "2026-10-06T00:00:00Z")).toBe("preliminary");
    expect(statusFor("current_and_prior_calendar_year", "2024-12-01", "2026-06-01", "2026-10-06T00:00:00Z")).toBe("final");
  });
  it("a stock reading is never preliminary", () => {
    expect(statusFor("none", "2026-09-25", "2026-09-25", "2026-10-06T00:00:00Z")).toBe("final");
  });
});

describe("normalizeSeries", () => {
  it("skips missing markers and reports them", () => {
    const n = normalizeSeries(raw("PAPRPUS", [["1973-01", "No Data Reported"], ["1973-02", "9000"]]), entry("PAPRPUS"));
    expect(n.observations.map((o) => o.date)).toEqual(["1973-02-01"]);
    expect(n.skippedMissing).toEqual(["1973-01-01"]);
  });
  it("fails when the API's units change (series redefined)", () => {
    expect(() => normalizeSeries(raw("PAPRPUS", [["1973-01", "1"]], { units: "Million Barrels" }), entry("PAPRPUS"))).toThrow(/redefined/);
  });
  it("fails when the snapshot has fewer rows than the API reported (truncation)", () => {
    expect(() => normalizeSeries(raw("PAPRPUS", [["1973-01", "1"]], { total: 5000 }), entry("PAPRPUS"))).toThrow(/truncated/);
  });
});

describe("validateEnergy", () => {
  it("passes on the committed output", () => {
    const s = validateEnergy(series, obs);
    expect(Object.keys(s.counts)).toHaveLength(ENERGY_CATALOG.length);
  });
  it("rejects a duplicate (series, date)", () => {
    expect(() => validateEnergy(series, [...obs, obs[0]])).toThrow(/duplicate/);
  });
  it("rejects a gap inside the display window", () => {
    const gappy = obs.filter((o) => !(o.series_id === "PAPRPUS" && o.date >= "2000-01-01" && o.date <= "2000-06-01"));
    const s = series.map((r) => (r.series_id === "PAPRPUS" ? { ...r, observation_count: r.observation_count - 6 } : r));
    expect(() => validateEnergy(s, gappy)).toThrow(/gap/);
  });
});

describe("committed output spot checks (independent EIA figures, fetched 2026-10-06)", () => {
  it("matches the MER CSV and the weekly bulk file", () => {
    expect(val("PAPRPUS", "2026-08-01")).toBe(13850.419);
    expect(val("WCSSTUS1", "2026-09-25")).toBe(283767);
    expect(val("N9133US2", "2016-02-01")).toBe(3309);
  });
  it("monthly electricity sums to MER's own annual total", () => {
    expect(sumYear("CLETPUS", 1991)).toBeCloseTo(1590622.748, 2);
    expect(sumYear("ELETPUS", 1991)).toBeCloseTo(3073798.885, 2);
  });
  it("covers the pre-flight anchors", () => {
    expect(series.find((s) => s.series_id === "WCSSTUS1")?.first_observation).toBe("1982-08-20");
    expect(series.find((s) => s.series_id === "ELEC_SMALL_SOLAR")?.first_observation).toBe("2014-01-01");
    expect(series.find((s) => s.series_id === "N9133US2")?.first_observation).toBe("1997-01-01");
  });
  it("tails are preliminary, history is final", () => {
    const last = obs.filter((o) => o.series_id === "PAPRPUS").at(-1)!;
    expect(last.status).toBe("preliminary");
    expect(val("PAPRPUS", "1991-01-01")).toBeDefined();
    expect(obs.find((o) => o.series_id === "PAPRPUS" && o.date === "1991-01-01")?.status).toBe("final");
  });
});

describe("diffSeries (materiality rule)", () => {
  const base = raw("PAPRPUS", [["2020-01", "100"], ["2026-07", "13000"], ["2026-08", "13100"]]);
  const withObs = (o: [string, string | null][]) => raw("PAPRPUS", o);
  it("a new period is material", () => {
    expect(diffSeries(entry("PAPRPUS"), base, withObs([...base.observations, ["2026-09", "13200"]])).material).toBe(true);
  });
  it("a small revision of a preliminary value is not material, a large one is", () => {
    expect(diffSeries(entry("PAPRPUS"), base, withObs([["2020-01", "100"], ["2026-07", "13010"], ["2026-08", "13100"]])).material).toBe(false);
    expect(diffSeries(entry("PAPRPUS"), base, withObs([["2020-01", "100"], ["2026-07", "13400"], ["2026-08", "13100"]])).material).toBe(true);
  });
  it("any change to a final value is material", () => {
    expect(diffSeries(entry("PAPRPUS"), base, withObs([["2020-01", "101"], ["2026-07", "13000"], ["2026-08", "13100"]])).material).toBe(true);
  });
  it("an identical snapshot is not material", () => {
    expect(diffSeries(entry("PAPRPUS"), base, base).material).toBe(false);
  });
});
