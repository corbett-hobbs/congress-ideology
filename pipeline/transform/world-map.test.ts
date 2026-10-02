import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { aidRow } from "../../lib/foreign-aid-entities";
import { MARKER_AREA_PX2, MUST_SHOW_USD, RECIPIENT_PATHS, buildWorldMap, featureKey, simplifyRing, ringPath, type NeCollection } from "./world-map";
import { recipientsOf } from "./world-map-run";

const geo = JSON.parse(readFileSync("pipeline/raw/natural-earth/ne_50m_admin_0_countries.geojson", "utf8")) as NeCollection;
const rows = (JSON.parse(readFileSync("pipeline/output/foreign_assistance.json", "utf8")) as unknown[]).map((r) => aidRow.parse(r));
const recipients = recipientsOf(rows);
const map = buildWorldMap(geo, recipients);
const committed = readFileSync("pipeline/output/world_map.json", "utf8");

describe("coverage", () => {
  it("every recipient above the threshold in any year has an outline, a marker, or is on the undrawn list", () => {
    const big = recipients.filter((r) => r.peak >= MUST_SHOW_USD);
    expect(big.length).toBeGreaterThan(100);
    const drawn = new Map(map.recipients.map((r) => [r.name, r]));
    const feat = new Set(map.features.map((f) => f.key));
    for (const r of big) {
      const d = drawn.get(r.name);
      if (d) {
        expect(d.paths.length, r.name).toBeGreaterThan(0);
        for (const k of d.paths) expect(feat.has(k), `${r.name} -> ${k}`).toBe(true);
      } else expect(map.undrawn, r.name).toContain(r.name);
    }
  });
  it("recipients are either drawn or undrawn, never both", () => {
    const names = new Set(map.recipients.map((r) => r.name));
    for (const u of map.undrawn) expect(names.has(u)).toBe(false);
    expect(map.recipients.length + map.undrawn.length).toBe(recipients.length);
  });
  it("the named undrawn entities are listed", () => {
    for (const n of ["Czechoslovakia (former)", "Netherlands Antilles (former)", "Serbia and Montenegro (former)", "China (Tibet)", "Pacific Island Trust Territory"]) expect(map.undrawn).toContain(n);
  });
});

describe("keys and aliases", () => {
  it("Kosovo is XKX; Antarctica is dropped", () => {
    expect(map.features.some((f) => f.key === "XKX")).toBe(true);
    expect(map.features.some((f) => f.key === "KOS" || f.key === "ATA")).toBe(false);
    expect(map.recipients.find((r) => r.name === "Kosovo")?.paths).toEqual(["XKX"]);
  });
  it("Sudan (former) and West Bank and Gaza are drawn on today's outlines", () => {
    expect(map.recipients.find((r) => r.name === "Sudan (former)")?.paths).toEqual(RECIPIENT_PATHS["Sudan (former)"]);
    expect(map.recipients.find((r) => r.name === "West Bank and Gaza")?.paths).toEqual(["PSE"]);
  });
  it("feature keys are unique", () => {
    expect(new Set(map.features.map((f) => f.key)).size).toBe(map.features.length);
  });
  it("the Natural Earth codes that share an ISO code keep their own key", () => {
    const aus = geo.features.filter((f) => String(f.properties.ISO_A3_EH) === "AUS");
    expect(new Set(aus.map((f) => featureKey(f.properties))).size).toBe(aus.length);
  });
});

describe("markers", () => {
  it("small recipients get one, large ones do not", () => {
    const m = (n: string) => map.recipients.find((r) => r.name === n)!;
    for (const n of ["Singapore", "Maldives", "Malta", "Bahrain", "Marshall Islands", "Comoros", "Barbados", "Cyprus", "Curacao", "Kosovo"]) expect(m(n).marker, n).not.toBeNull();
    for (const n of ["Ukraine", "Brazil", "Nigeria", "India"]) expect(m(n).marker, n).toBeNull();
    expect(MARKER_AREA_PX2).toBeGreaterThan(0);
  });
  it("markers sit inside the viewBox", () => {
    for (const r of map.recipients) if (r.marker) {
      expect(r.marker.x).toBeGreaterThanOrEqual(0);
      expect(r.marker.x).toBeLessThanOrEqual(map.width);
      expect(r.marker.y).toBeGreaterThanOrEqual(0);
      expect(r.marker.y).toBeLessThanOrEqual(map.height);
    }
  });
});

describe("size and determinism", () => {
  it("stays well under the mockup's ~1 MB of raw paths", () => {
    const raw = JSON.stringify(map).length;
    expect(raw).toBeLessThan(250_000);
    expect(gzipSync(JSON.stringify(map)).length).toBeLessThan(80_000);
  });
  it("the committed file is exactly what the transform produces", () => {
    expect(committed).toBe(JSON.stringify(map) + "\n");
  });
});

describe("simplification", () => {
  it("keeps corners, drops collinear points, and path deltas never accumulate rounding", () => {
    const ring: [number, number][] = [[0, 0], [5, 0.01], [10, 0], [10, 10], [0, 10]];
    expect(simplifyRing(ring, 0.1)).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
    expect(ringPath([[0.04, 0.04], [10.03, 0.04], [10.03, 10.04]])).toBe("M0,0l10,0 0,10z");
  });
});
