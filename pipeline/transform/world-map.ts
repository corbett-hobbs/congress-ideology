import { geoCentroid, geoNaturalEarth1, geoStream, type GeoPermissibleObjects } from "d3-geo";

/**
 * World geometry for /presidency/foreign-aid, from Natural Earth 1:50m admin-0 countries (public domain).
 * Pure: GeoJSON in, a simplified path set out. d3-geo is used for the projection and antimeridian
 * clipping only; nothing from d3 ships to the browser. Geometry is never hand-edited: the rules
 * below (keys, aliases, simplification, markers) are the whole transform.
 */

export const MAP_WIDTH = 1000;
/** Douglas-Peucker tolerance, in viewBox units (1000 wide). */
export const SIMPLIFY_PX = 0.45;
/** A ring smaller than this is dropped (a feature always keeps its largest ring). */
export const MIN_RING_AREA_PX2 = 0.6;
/** A recipient whose drawn area is below this gets a centroid marker. At the narrowest layout the map is ~0.33x. */
export const MARKER_AREA_PX2 = 14;
/** A recipient with at least this much net aid in some fiscal year must be drawn, marked, or listed as undrawn. */
export const MUST_SHOW_USD = 1_000_000;

/** Natural Earth code -> the trade/aid `country_key`. Everything else keys by Natural Earth's ISO_A3_EH (or ADM0_A3 when that is -99). */
const KEY_OVERRIDES: Record<string, string> = { KOS: "XKX" };

/** A recipient that is not one country today, drawn on the outlines it covers. */
export const RECIPIENT_PATHS: Record<string, string[]> = {
  "West Bank and Gaza": ["PSE"],
  "Sudan (former)": ["SDN", "SSD"],
};

export interface NeFeature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: GeoPermissibleObjects & { type: string };
}
export interface NeCollection {
  type: "FeatureCollection";
  features: NeFeature[];
}

export interface MapFeature {
  key: string;
  name: string;
  d: string;
}
export interface MapRecipient {
  /** The aid source's recipient_name. */
  name: string;
  /** Keys of the `features` this recipient is drawn on (several for Sudan (former)). */
  paths: string[];
  /** Centroid marker, set when the drawn area is too small to see. */
  marker: { x: number; y: number } | null;
}
export interface WorldMap {
  source: string;
  width: number;
  height: number;
  features: MapFeature[];
  recipients: MapRecipient[];
  /** Aid recipients with no modern outline: counted in totals, not drawn. */
  undrawn: string[];
}

export interface AidRecipient {
  name: string;
  /** Trade `country_code`; null for the four recipients with none. */
  key: string | null;
  /** Largest absolute annual net disbursement, any fiscal year. */
  peak: number;
}

type Pt = [number, number];

/**
 * Natural Earth's ISO_A3_EH ("effective" ISO code), or its own ADM0_A3 when that is -99 (Kosovo,
 * Somaliland, N. Cyprus). A few dependencies share their sovereign's ISO code (the Indian Ocean
 * Territories and Ashmore and Cartier carry AUS); those keep their own ADM0_A3.
 */
export const featureKey = (p: Record<string, unknown>): string => {
  const eh = String(p.ISO_A3_EH ?? "-99");
  const own = String(p.ADM0_A3);
  const code = eh === "-99" || (eh !== own && SHARED_ISO.has(eh)) ? own : eh;
  return KEY_OVERRIDES[code] ?? code;
};
const SHARED_ISO = new Set(["AUS"]);

const ringArea = (r: readonly Pt[]) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
};

function perpDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function dp(pts: readonly Pt[], from: number, to: number, eps: number, keep: boolean[]) {
  let worst = -1;
  let idx = -1;
  for (let i = from + 1; i < to; i++) {
    const d = perpDist(pts[i], pts[from], pts[to]);
    if (d > worst) {
      worst = d;
      idx = i;
    }
  }
  if (worst > eps) {
    keep[idx] = true;
    dp(pts, from, idx, eps, keep);
    dp(pts, idx, to, eps, keep);
  }
}

/** Douglas-Peucker on a closed ring (first point not repeated at the end). */
export function simplifyRing(ring: readonly Pt[], eps: number): Pt[] {
  if (ring.length <= 4) return [...ring];
  let far = 0;
  let best = -1;
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const keep = new Array<boolean>(ring.length + 1).fill(false);
  keep[0] = keep[far] = true;
  const closed = [...ring, ring[0]];
  keep[ring.length] = true;
  dp(closed, 0, far, eps, keep);
  dp(closed, far, ring.length, eps, keep);
  return ring.filter((_, i) => keep[i]);
}

/** One ring as a path: absolute start, then deltas of the *rounded* positions so rounding never accumulates. */
export function ringPath(ring: readonly Pt[]): string {
  const r = (n: number) => Math.round(n * 10);
  const f = (n: number) => String(n / 10);
  let px = r(ring[0][0]);
  let py = r(ring[0][1]);
  const s = `M${f(px)},${f(py)}l`;
  const deltas: string[] = [];
  for (let i = 1; i < ring.length; i++) {
    const x = r(ring[i][0]);
    const y = r(ring[i][1]);
    if (x === px && y === py) continue;
    deltas.push(`${f(x - px)},${f(y - py)}`);
    px = x;
    py = y;
  }
  return s + deltas.join(" ") + "z";
}

function projectedRings(feature: NeFeature, project: ReturnType<typeof geoNaturalEarth1>): Pt[][] {
  const rings: Pt[][] = [];
  let cur: Pt[] = [];
  geoStream(feature.geometry, project.stream({
    point(x: number, y: number) {
      cur.push([x, y]);
    },
    lineStart() {
      cur = [];
    },
    lineEnd() {
      if (cur.length >= 3) rings.push(cur);
    },
    polygonStart() {},
    polygonEnd() {},
    sphere() {},
  }));
  return rings;
}

/** The land drawn on the map: every Natural Earth feature but Antarctica. */
export const mapLand = (geo: NeCollection): NeFeature[] => geo.features.filter((f) => f.properties.ADM0_A3 !== "ATA");

/** The map's projection: Natural Earth, fitted to the land and nudged 2px in. Shared with `bases.ts` so points land on the outlines. */
export function worldProjection(geo: NeCollection) {
  const projection = geoNaturalEarth1().fitWidth(MAP_WIDTH - 4, { type: "FeatureCollection", features: mapLand(geo) } as GeoPermissibleObjects);
  const [tx, ty] = projection.translate();
  projection.translate([tx + 2, ty + 2]);
  return projection;
}

export function buildWorldMap(geo: NeCollection, recipients: readonly AidRecipient[]): WorldMap {
  const land = mapLand(geo);
  const projection = worldProjection(geo);
  let height = 0;

  const byKey = new Map<string, { name: string; rings: Pt[][]; area: number; centroid: Pt | null; largest: Pt[] }>();
  for (const f of land) {
    const key = featureKey(f.properties);
    if (byKey.has(key)) throw new Error(`world map: two Natural Earth features share the key ${key}`);
    const rings = projectedRings(f, projection).filter((r) => ringArea(r) > 0);
    if (!rings.length) continue;
    rings.sort((a, b) => ringArea(b) - ringArea(a));
    for (const r of rings) for (const p of r) height = Math.max(height, p[1]);
    const largest = rings[0];
    const kept = rings.filter((r, i) => i === 0 || ringArea(r) >= MIN_RING_AREA_PX2);
    const area = kept.reduce((a, r) => a + ringArea(r), 0);
    const cg = geoCentroid(f.geometry);
    const c = projection(cg);
    byKey.set(key, { name: String(f.properties.NAME ?? f.properties.ADMIN ?? key), rings: kept, area, centroid: c ? [c[0], c[1]] : null, largest });
  }

  const outRecipients: MapRecipient[] = [];
  const undrawn: string[] = [];
  const wanted = new Set<string>();
  for (const r of [...recipients].sort((a, b) => a.name.localeCompare(b.name))) {
    const keys = RECIPIENT_PATHS[r.name] ?? (r.key ? [r.key] : []);
    const paths = keys.filter((k) => byKey.has(k));
    if (!paths.length) {
      undrawn.push(r.name);
      continue;
    }
    paths.forEach((k) => wanted.add(k));
    const area = paths.reduce((a, k) => a + byKey.get(k)!.area, 0);
    let marker: MapRecipient["marker"] = null;
    if (area < MARKER_AREA_PX2) {
      const first = byKey.get(paths[0])!;
      const c = first.centroid ?? first.largest[0];
      marker = { x: Math.round(c[0] * 10) / 10, y: Math.round(c[1] * 10) / 10 };
    }
    outRecipients.push({ name: r.name, paths, marker });
  }

  const features: MapFeature[] = [];
  for (const [key, v] of [...byKey].sort((a, b) => a[0].localeCompare(b[0]))) {
    // Land with no aid and nothing visible at 1000px is not worth its bytes.
    if (!wanted.has(key) && v.area < MIN_RING_AREA_PX2 * 2) continue;
    const d = v.rings.map((r) => ringPath(simplifyRing(r, SIMPLIFY_PX))).join("");
    features.push({ key, name: v.name, d });
  }

  return {
    source: "Natural Earth 1:50m admin-0 countries (public domain), Natural Earth projection",
    width: MAP_WIDTH,
    height: Math.ceil(height + 2),
    features,
    recipients: outRecipients,
    undrawn,
  };
}
