import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENERGY_CATALOG } from "../../lib/energy-entities";
import { EnergyActionsError, validateEnergyActions } from "./energy-actions";

const ref = JSON.parse(readFileSync("pipeline/reference/energy-actions.json", "utf8")) as { last_reviewed: string; actions: Record<string, unknown>[] };
const eos = JSON.parse(readFileSync("pipeline/output/executive_orders.json", "utf8")) as { eo_number: number }[];
const ctx = { seriesIds: new Set(ENERGY_CATALOG.map((c) => c.series_id)), eoNumbers: new Set(eos.map((e) => e.eo_number)), today: "2026-10-06" };
const clone = () => structuredClone(ref);
const mutate = (id: string, f: (a: Record<string, unknown>) => void) => {
  const c = clone();
  f(c.actions.find((a) => a.action_id === id)!);
  return c;
};

describe("energy actions (curated file)", () => {
  it("validates the committed file", () => {
    const f = validateEnergyActions(ref, ctx);
    expect(f.actions.length).toBeGreaterThanOrEqual(15);
    expect(f.actions.filter((a) => a.flag_priority === 1).length).toBeLessThanOrEqual(10);
  });
  it("every row has a primary source and the SPR rows are typed release or refill", () => {
    const f = validateEnergyActions(ref, ctx);
    for (const a of f.actions) expect(a.sources.some((s) => s.kind === "primary")).toBe(true);
    const spr = f.actions.filter((a) => a.area === "spr").map((a) => a.kind);
    expect(spr).toEqual(expect.arrayContaining(["release_mixed", "release_sale", "refill", "release_exchange"]));
  });
  it("the 2026 SPR action is an exchange, not a sale", () => {
    const f = validateEnergyActions(ref, ctx);
    expect(f.actions.find((a) => a.action_id === "2026-03-11-spr-172-million-exchange")?.kind).toBe("release_exchange");
  });
  it("the crude-export repeal is congressional and marked as a lagged effect", () => {
    const a = validateEnergyActions(ref, ctx).actions.find((x) => x.action_id === "2015-12-18-crude-export-ban-repealed")!;
    expect(a.authority_type).toBe("congressional");
    expect(a.lagged_effect).toBe(true);
  });
  it("rejects an unknown series, an unknown EO, a missing primary source and a future date", () => {
    expect(() => validateEnergyActions(mutate("2015-12-18-crude-export-ban-repealed", (a) => (a.series = ["NOPE"])), ctx)).toThrow(/not in the energy catalog/);
    expect(() => validateEnergyActions(mutate("2017-03-28-eo-13783-energy-independence", (a) => (a.links = { eo_numbers: [99999] })), ctx)).toThrow(/eo_number 99999/);
    expect(() => validateEnergyActions(mutate("2015-11-06-keystone-xl-rejected", (a) => (a.sources = [{ ...(a.sources as Record<string, unknown>[])[0], kind: "secondary" }])), ctx)).toThrow(/primary source/);
    expect(() => validateEnergyActions(ref, { ...ctx, today: "2020-01-01" })).toThrow(EnergyActionsError);
  });
  it("rejects an SPR action without the SPR series and an unsorted file", () => {
    expect(() => validateEnergyActions(mutate("2026-03-11-spr-172-million-exchange", (a) => (a.series = [])), ctx)).toThrow(/WCSSTUS1/);
    const c = clone();
    c.actions.reverse();
    expect(() => validateEnergyActions(c, ctx)).toThrow(/not sorted/);
  });
});
