import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildBasesPayload, clusterSites } from "./bases-derive";
import { baseRow } from "./bases-entities";
import { SITE_ORDER } from "./bases-types";

const rows = (JSON.parse(readFileSync("pipeline/output/bases.json", "utf8")) as unknown[]).map((r) => baseRow.parse(r));
const payload = buildBasesPayload(rows);
const drawn = payload.sites.filter((s) => !s.review).length;

describe("payload", () => {
  it("keeps every row, points into small tables, and is small", () => {
    expect(payload.sites.length).toBe(rows.length);
    expect(payload.through).toBe(2018);
    for (const s of payload.sites) {
      expect(payload.countries[s.c]).toBeDefined();
      expect(SITE_ORDER[s.t]).toBeDefined();
    }
    const json = JSON.stringify(payload);
    expect(gzipSync(json).length).toBeLessThan(20_000);
  });
  it("leaves flagged sites out of the drawn set", () => {
    expect(payload.sites.filter((s) => s.review).length).toBe(rows.filter((r) => r.needs_review).length);
    expect(clusterSites(payload, 0).reduce((n, c) => n + c.members.length, 0)).toBe(drawn);
  });
});

describe("clusterSites", () => {
  it("is every site on its own with no merge distance, fewer groups when zoomed out, and never mixes countries", () => {
    const solo = clusterSites(payload, 0.0001);
    const wide = clusterSites(payload, 6);
    expect(wide.length).toBeLessThan(solo.length);
    expect(solo.length).toBeGreaterThan(drawn * 0.95);
    for (const c of wide) {
      expect(new Set(c.members.map((i) => payload.countries[payload.sites[i].c].iso3)).size).toBe(1);
    }
    expect(wide.reduce((n, c) => n + c.members.length, 0)).toBe(drawn);
  });
  it("splits as the distance shrinks and is deterministic", () => {
    const a = clusterSites(payload, 6).length;
    const b = clusterSites(payload, 1.5).length;
    expect(b).toBeGreaterThan(a);
    expect(JSON.stringify(clusterSites(payload, 6))).toBe(JSON.stringify(clusterSites(payload, 6)));
  });
});
