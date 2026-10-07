import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { energyObservation } from "./energy-entities";
import { energyActionsFile } from "./energy-actions-entities";
import { administration } from "./executive-orders-entities";
import { BUSH_41, buildEconomyTerms } from "./economy-presidents";
import { dayOfIso } from "./indicator-time";
import {
  laggedNote,
  buildSeries,
  firstPreliminary,
  flagInputs,
  flagLabel,
  flagsForCard,
  groupObservations,
  isPreliminary,
  layoutFlags,
  monthOfDay,
  monthlyAt,
  otherGeneration,
  spanOf,
  sprAt,
  termAtDay,
  termIdOn,
  toFlag,
  KIND_LABEL,
} from "./energy-derive";
import { FUEL_KEYS } from "./energy-types";

const OUT = join(process.cwd(), "pipeline", "output");
const json = (f: string): unknown => JSON.parse(readFileSync(join(OUT, f), "utf8"));
const rows = z.array(energyObservation).parse(json("energy_observations.json"));
const by = groupObservations(rows);
const built = buildSeries(by);
const actions = energyActionsFile.parse(json("energy_actions.json")).actions;
const flags = actions.map(toFlag);
const admins = z.array(administration).parse(json("administrations.json"));

describe("windowing", () => {
  it("starts monthly arrays at January 1991 and the weekly SPR inside the display window", () => {
    expect(built.monthly.prod[0]).toBeCloseTo(by.get("PNPRPUS")!.find((r) => r.date === "1991-01-01")!.value, -1);
    expect(built.spr[0][0]).toBeGreaterThanOrEqual(dayOfIso("1991-01-21"));
    expect(built.spr[0][0]).toBeLessThan(dayOfIso("1991-02-01"));
  });
  it("keeps late starts as nulls before their first month", () => {
    expect(built.monthly.lng[0]).toBeNull();
    expect(built.monthly.lng[72]).not.toBeNull(); // January 1997
    expect(built.monthly.small.slice(0, 276).every((v) => v === null)).toBe(true); // before January 2014
    expect(built.monthly.small[276]).not.toBeNull();
  });
  it("ends the axis the day after the newest weekly SPR reading", () => {
    const last = by.get("WCSSTUS1")!.at(-1)!;
    expect(spanOf(built.spr)).toBe(dayOfIso(last.date) + 1);
  });
});

describe("other generation", () => {
  it("is the total minus the six named fuels, and the stack always adds back to the total", () => {
    const o = otherGeneration(by);
    expect(o.find((p) => p.date === "1991-01-01")!.value).toBeCloseTo(17399.813, 2);
    for (let m = 0; m < built.monthly.total.length; m++) {
      const sum = FUEL_KEYS.reduce((s, k) => s + (built.monthly[k][m] ?? 0), 0);
      expect(Math.abs(sum - (built.monthly.total[m] ?? 0))).toBeLessThanOrEqual(FUEL_KEYS.length); // each array is rounded to a whole unit
    }
  });
  it("is never negative (it would mean the named fuels overshoot the total)", () => {
    expect(Math.min(...otherGeneration(by).map((p) => p.value))).toBeGreaterThan(0);
  });
});

describe("preliminary boundaries", () => {
  it("follows the status field, per series", () => {
    expect(firstPreliminary(by.get("PNPRPUS"))).toBe(monthOfDay(dayOfIso("2025-09-01")));
    expect(firstPreliminary(by.get("CLETPUS"))).toBe(monthOfDay(dayOfIso("2025-01-01")));
    expect(firstPreliminary(by.get("WCSSTUS1"))).toBeUndefined();
  });
  it("marks months at and after the boundary only", () => {
    const m = built.prelim.prod!;
    expect(isPreliminary(built, "prod", m - 1)).toBe(false);
    expect(isPreliminary(built, "prod", m)).toBe(true);
    expect(isPreliminary(built, "wind", 0)).toBe(built.prelim.wind === 0);
  });
});

describe("date lookups", () => {
  it("reads the SPR level at a known date (394.6 million barrels, week of 2025-01-17)", () => {
    expect(sprAt(built.spr, dayOfIso("2025-01-20"))).toEqual({ day: dayOfIso("2025-01-17"), value: 394566 });
    expect(sprAt(built.spr, 0)).toBeNull();
  });
  it("reads a monthly value and gives null past the end", () => {
    expect(monthlyAt(built.monthly.lng, dayOfIso("2016-02-15"))).toBe(3309);
    expect(monthlyAt(built.monthly.lng, dayOfIso("2040-01-01"))).toBeNull();
  });
  it("joins dates to presidents through the shared term table", () => {
    const terms = buildEconomyTerms(admins, spanOf(built.spr));
    expect(termAtDay(terms, dayOfIso("1992-06-01"))!.last).toBe("Bush");
    expect(termAtDay(terms, dayOfIso("2022-03-31"))!.label).toBe("Biden");
    expect(termIdOn("2026-03-11", [BUSH_41, ...admins])).toBe("2025-01-20");
  });
});

describe("flags", () => {
  it("puts the four SPR actions on the SPR card, each with its authority and what happened to the oil", () => {
    const spr = flagsForCard(flags, "spr");
    expect(spr.map((f) => f.date)).toEqual(["2021-11-23", "2022-03-31", "2024-11-08", "2026-03-11"]);
    expect(spr.map((f) => KIND_LABEL[f.kind])).toEqual(["Sale and exchange", "Sale", "Refill", "Exchange"]);
    expect(flagLabel(spr[3])).toMatch(/^Executive · Exchange · /);
  });
  it("puts the export repeal on the oil card, the two laws on electricity and the pause and reversal on LNG", () => {
    expect(flagsForCard(flags, "oil").map((f) => f.date)).toEqual(["2015-12-18"]);
    expect(flagsForCard(flags, "electricity").filter((f) => f.priority === 1).map((f) => f.date)).toEqual(["2022-08-16", "2025-07-04"]);
    expect(flagsForCard(flags, "lng").map((f) => f.date)).toEqual(["2024-01-26", "2025-01-20"]);
  });
  it("never leaves a lagged action without the flag the UI keys its wording on", () => {
    for (const a of actions) expect(toFlag(a).lagged).toBe(a.lagged_effect);
    expect(flagsForCard(flags, "oil")[0].lagged).toBe(true);
    expect(flagsForCard(flags, "spr").every((f) => !f.lagged)).toBe(true);
  });
  it("numbers the flags when labels are off", () => {
    const inputs = flagInputs(flagsForCard(flags, "spr"));
    const X = (d: number) => 40 + (d / spanOf(built.spr)) * 1000;
    const placed = layoutFlags(inputs, { X, viewStart: 0, viewEnd: spanOf(built.spr), span: spanOf(built.spr), plotLeft: 40, plotRight: 1040, labels: false });
    expect(placed.map((p) => p.number)).toEqual([1, 2, 3, 4]);
    // squeezed into a phone-width plot, the two actions four months apart read as one marker
    const narrow = layoutFlags(inputs, { X: (d) => 20 + (d / spanOf(built.spr)) * 300, viewStart: 0, viewEnd: spanOf(built.spr), span: spanOf(built.spr), plotLeft: 20, plotRight: 320, labels: false });
    expect(narrow.map((p) => p.ids.length)).toEqual([2, 1, 1]);
  });
});

describe("laggedNote", () => {
  const now = new Date("2026-10-06T12:00:00");
  it("says the effect came years after for an old action", () => {
    expect(laggedNote("2015-12-18", now)).toContain("came years after");
  });
  it("says the effect may not show yet for an action within two years", () => {
    expect(laggedNote("2025-03-01", now)).toContain("may not show yet");
    expect(laggedNote("2024-10-06", now)).toContain("may not show yet");
    expect(laggedNote("2024-10-05", now)).toContain("came years after");
  });
});
