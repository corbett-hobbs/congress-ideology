import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { baseRow } from "../../lib/bases-entities";
import { countryRow } from "../../lib/trade-entities";
import { BASE_COLUMNS, ISO_EXCEPTIONS, buildBases, cleanName, parseCsv } from "./bases";
import { worldProjection, type NeCollection } from "./world-map";

const csv = readFileSync("pipeline/raw/troopdata/basedata.csv").toString("latin1");
const geo = JSON.parse(readFileSync("pipeline/raw/natural-earth/ne_50m_admin_0_countries.geojson", "utf8")) as NeCollection;
const map = JSON.parse(readFileSync("pipeline/output/world_map.json", "utf8")) as {
  width: number;
  height: number;
  features: { key: string; d: string }[];
  recipients: { name: string; paths: string[]; marker: { x: number; y: number } | null }[];
};
const countryCodes = new Set((JSON.parse(readFileSync("pipeline/output/countries.json", "utf8")) as unknown[]).map((r) => countryRow.parse(r)).filter((c) => !c.is_aggregate).map((c) => c.country_code));
const build = () => buildBases({ csv, geo, countryCodes, troopHostIso3: new Set(["DEU"]), mapSize: map });
const { rows, report, failures } = build();
const committed = readFileSync("pipeline/output/bases.json", "utf8");
const at = (name: string) => rows.find((r) => r.name === name)!;

/** Bounding box of a path written as an absolute start and relative deltas (`ringPath`). */
function bbox(d: string) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ring of d.split("z").filter(Boolean)) {
    const m = /^M([-\d.]+),([-\d.]+)l(.*)$/.exec(ring)!;
    let x = Number(m[1]), y = Number(m[2]);
    const pts: [number, number][] = [[x, y]];
    for (const p of m[3].trim().split(/\s+/).filter(Boolean)) {
      const [dx, dy] = p.split(",").map(Number);
      x += dx; y += dy;
      pts.push([x, y]);
    }
    for (const [px, py] of pts) {
      minX = Math.min(minX, px); minY = Math.min(minY, py); maxX = Math.max(maxX, px); maxY = Math.max(maxY, py);
    }
  }
  return { minX, minY, maxX, maxY };
}
const near = (b: ReturnType<typeof bbox>, x: number, y: number, pad: number) => x >= b.minX - pad && x <= b.maxX + pad && y >= b.minY - pad && y <= b.maxY + pad;

describe("gates", () => {
  it("passes every gate on the real file", () => {
    expect(failures).toEqual([]);
    expect(report.unmapped_iso3).toEqual([]);
  });
  it("every row parses, ids are unique, coordinates are in range and inside the map", () => {
    expect(rows.length).toBeGreaterThan(380);
    for (const r of rows) {
      baseRow.parse(r);
      expect(r.x, r.base_id).toBeGreaterThanOrEqual(0);
      expect(r.x, r.base_id).toBeLessThanOrEqual(map.width);
      expect(r.y, r.base_id).toBeGreaterThanOrEqual(0);
      expect(r.y, r.base_id).toBeLessThanOrEqual(map.height);
      expect(countryCodes.has(r.iso3) || r.iso3 in ISO_EXCEPTIONS, r.base_id).toBe(true);
    }
    expect(new Set(rows.map((r) => r.base_id)).size).toBe(rows.length);
  });
  it("every source row is either kept or excluded with a reason", () => {
    expect(rows.length + report.excluded.length).toBe(report.source_rows);
    expect(parseCsv(csv).length - 1).toBe(report.source_rows);
    for (const e of report.excluded) expect(e.reason.length).toBeGreaterThan(0);
  });
  it("reads every expected column", () => {
    const head = parseCsv(csv)[0];
    for (const c of BASE_COLUMNS) expect(head).toContain(c);
  });
  it("is byte-identical to the committed file and deterministic", () => {
    expect(JSON.stringify(rows) + "\n").toBe(committed);
    expect(JSON.stringify(build().rows)).toBe(JSON.stringify(rows));
  });
});

describe("cleaning", () => {
  it("removes tabs and the glued-on country, keeps the rest", () => {
    expect(cleanName("Guantanamo Bay\tCuba")).toBe("Guantanamo Bay");
    expect(cleanName("Osan\tSouth Korea")).toBe("Osan");
    expect(cleanName("Pohang\t(Camp Mujuk)")).toBe("Pohang (Camp Mujuk)");
    expect(cleanName("Kleine-Brogel\t Air Base")).toBe("Kleine-Brogel Air Base");
  });
  it("decodes the Latin-1 file", () => {
    expect(rows.some((r) => r.name.includes("�"))).toBe(false);
  });
  it("maps dependencies to the codes the map and troop series use", () => {
    expect(at("Camp Bondsteel").iso3).toBe("XKX");
    expect(at("Thule Air Base").iso3).toBe("GRL");
    expect(at("Diego Garcia").iso3).toBe("IOT");
    expect(at("Wake Island").iso3).toBe("UMI");
    expect(at("Anderson AFB").iso3).toBe("GUM");
    expect(rows.some((r) => r.iso3 === "KSV" || r.iso3 === "USA")).toBe(false);
    expect(rows.some((r) => r.country === "Antarctica")).toBe(false);
  });
  it("flags the known bad coordinates", () => {
    const flagged = rows.filter((r) => r.needs_review).map((r) => r.base_id);
    expect(flagged).toContain("kor-camp-humphreys-richmond-taejon");
    expect(flagged).toContain("jpn-yokota-ab-tokyo");
    expect(at("Ramstein AFB").needs_review).toBe(false);
  });
});

describe("projection", () => {
  const p = worldProjection(geo);
  it("matches world_map.json: Diego Garcia, Thule, Bondsteel, Kwajalein land on their outlines", () => {
    const feat = (k: string) => map.features.find((f) => f.key === k)!;
    const dg = at("Diego Garcia");
    expect(near(bbox(feat("IOT").d), dg.x, dg.y, 1.5)).toBe(true);
    const th = at("Thule Air Base");
    expect(near(bbox(feat("GRL").d), th.x, th.y, 0)).toBe(true);
    const bs = at("Camp Bondsteel");
    expect(near(bbox(feat("XKX").d), bs.x, bs.y, 0)).toBe(true);
    const kw = at("US Army Kwajalein Atoll, R.Reagan Test Site");
    expect(near(bbox(feat("MHL").d), kw.x, kw.y, 10)).toBe(true);
  });
  it("Guam and Wake (no outline at this scale) land where the projection puts them", () => {
    const g = p([144.9244, 13.5761])!;
    const w = p([166.647717, 19.280042])!;
    expect([at("Anderson AFB").x, at("Anderson AFB").y]).toEqual([Math.round(g[0] * 10) / 10, Math.round(g[1] * 10) / 10]);
    expect([at("Wake Island").x, at("Wake Island").y]).toEqual([Math.round(w[0] * 10) / 10, Math.round(w[1] * 10) / 10]);
    // Pinned so a projection change is a deliberate act: Guam sits west of Wake, both in the western Pacific.
    expect(at("Anderson AFB").x).toBeLessThan(at("Wake Island").x);
    expect(at("Anderson AFB").x).toBeGreaterThan(880);
  });
  it("a recipient marker and the base in the same tiny place agree", () => {
    const mhl = map.recipients.find((r) => r.name === "Marshall Islands")?.marker;
    const kw = at("US Army Kwajalein Atoll, R.Reagan Test Site");
    if (mhl) expect(Math.hypot(mhl.x - kw.x, mhl.y - kw.y)).toBeLessThan(12);
  });
});
