import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { administration } from "./executive-orders-entities";
import { aidMeta, aidRow, worldMapFile } from "./foreign-aid-entities";
import { buildAidPayload, decodeAid } from "./foreign-aid-derive";
import { SHARE_BINS, buildPathIndex, dollarBins, dollarClass, notOnMap, nodeValue, shareClass, undrawnCountries } from "./foreign-aid-map";

const OUT = join(process.cwd(), "pipeline", "output");
const read = (f: string) => JSON.parse(readFileSync(join(OUT, f), "utf8"));
const d = decodeAid(
  buildAidPayload(
    (read("foreign_assistance.json") as unknown[]).map((r) => aidRow.parse(r)),
    aidMeta.parse(read("foreign_assistance_meta.json")),
    (read("administrations.json") as unknown[]).map((r) => administration.parse(r)),
  ),
);
const map = worldMapFile.parse(read("world_map.json"));
const ci = (n: string) => d.payload.countries.findIndex((c) => c.name === n);

describe("bins", () => {
  it("absolute bins: edges, and lower bins for one sector", () => {
    const all = dollarBins(-1);
    expect([0, 5e6, 1e7, 4.9e7, 5e7, 2.5e8, 1e9, 6.7e9].map((v) => dollarClass(v, all))).toEqual([0, 1, 2, 2, 3, 4, 5, 5]);
    expect(dollarClass(-5, all)).toBe(0);
    expect(dollarClass(5e6, dollarBins(1))).toBe(3);
  });
  it("military share classes", () => {
    expect(SHARE_BINS.labels).toHaveLength(4);
    expect([shareClass(100, 0), shareClass(100, 10), shareClass(100, 25), shareClass(100, 60), shareClass(100, 100), shareClass(0, 5)]).toEqual([0, 1, 2, 3, 4, 0]);
  });
});

describe("path index", () => {
  it("every drawn recipient resolves, Sudan (former) shares the Sudan and South Sudan outlines", () => {
    const idx = buildPathIndex(d, map);
    expect(idx.get("SDN")).toEqual(expect.arrayContaining([ci("Sudan"), ci("Sudan (former)")]));
    expect(idx.get("SSD")).toContain(ci("Sudan (former)"));
    expect(idx.get("PSE")).toEqual([ci("West Bank and Gaza")]);
    expect(idx.get("XKX")).toEqual([ci("Kosovo")]);
  });
  it("undrawn recipients are real country rows", () => {
    expect(undrawnCountries(d, map)).toHaveLength(map.undrawn.length);
  });
});

describe("not on the map (FY2025)", () => {
  it("about a third of the year goes to global and regional programs", () => {
    const n = notOnMap(d, undrawnCountries(d, map), 2025, -1);
    expect(n.total).toBe(47_841_390_743);
    expect(n.programs / n.total).toBeCloseTo(0.341, 2);
    expect(n.countries + n.programs).toBe(n.total);
    expect(n.undrawn).toBe(0); // the undrawn entities stopped receiving aid long ago
  });
  it("a node sums the country rows drawn on it", () => {
    const yi = 2025 - 2001;
    const v = nodeValue(d, [ci("Israel")], yi, -1);
    expect(v.v).toBe(3_310_792_558);
    expect(v.m).toBe(3_305_572_360);
    expect(v.slots.reduce((a, b) => a + b, 0)).toBe(v.v);
  });
});
