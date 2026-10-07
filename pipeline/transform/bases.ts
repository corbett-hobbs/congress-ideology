import { geoBounds, type GeoPermissibleObjects } from "d3-geo";
import { BASES_DATA_THROUGH, BASES_SOURCE, type BaseRow, type SiteType } from "../../lib/bases-entities";
import { featureKey, worldProjection, type NeCollection } from "./world-map";

/**
 * Overseas installations: troopdata's `basedata.csv` (David Vine's lists of U.S. bases abroad) -> one row per site,
 * projected with the same projection as `world_map.json`. Pure: CSV text in, rows + a report out. The source is a
 * single undated snapshot (documented "through 2018"): no per-year presence, no headcounts.
 */

/** The columns the transform reads, by header text. */
export const BASE_COLUMNS = ["countryname", "ccode", "iso3c", "basename", "lat", "lon", "base", "lilypad", "fundedsite"] as const;

/** Source country label -> the ISO3 the troop series and the map use. The source codes dependencies under their sovereign. */
export const COUNTRY_ISO: Readonly<Record<string, string>> = {
  "Hong Kong": "HKG",
  "Congo, Democratic Republic": "COD",
  "Ascension Island": "SHN",
  "BR Indian Ocean Territory": "IOT",
  Aruba: "ABW",
  "Netherlands Antilles": "CUW",
  Greenland: "GRL",
  Kosovo: "XKX",
  "Puerto Rico": "PRI",
  Guam: "GUM",
  "American Samoa": "ASM",
  "Northern Mariana Islands": "MNP",
  "Virgin Islands": "VIR",
  "Johnston Atoll": "UMI",
  "Wake Island": "UMI",
};
/** Source label -> display name (typos, the "Georigia" row, and the source's official-style names). */
export const COUNTRY_NAME: Readonly<Record<string, string>> = {
  Georigia: "Georgia",
  NIger: "Niger",
  "BR Indian Ocean Territory": "British Indian Ocean Territory",
  "Congo, Democratic Republic": "Democratic Republic of the Congo",
  "Korea, South": "South Korea",
  "Bahamas, The": "The Bahamas",
  "Virgin Islands": "U.S. Virgin Islands",
};
/** ISO3 codes the trade `countries.json` does not carry: U.S. territories, documented here and in the report. */
export const ISO_EXCEPTIONS: Readonly<Record<string, string>> = {
  PRI: "U.S. territory (not a trade partner)",
  GUM: "U.S. territory",
  ASM: "U.S. territory",
  MNP: "U.S. territory",
  VIR: "U.S. territory",
  UMI: "U.S. Minor Outlying Islands (Johnston Atoll, Wake Island)",
};
/** Source countries with no outline on the map. */
export const NOT_DRAWN_COUNTRY: Readonly<Record<string, string>> = { Antarctica: "Antarctica is not drawn on the map" };
/** Rows whose coordinates were checked against the place and found wrong or imprecise (iso3|source name). */
export const REVIEW: Readonly<Record<string, string>> = {
  "KOR|Camp Humphreys (Richmond), Taejon": "Plotted at Daejeon, about 100 km from Camp Humphreys",
  "JPN|Yokota AB, Tokyo": "Plotted in central Tokyo, about 35 km from Yokota Air Base",
};
/** Trailing country words the source glues on after a tab. */
const TAB_TAILS = new Set(["Cuba", "Kenya", "South Korea"]);

export const cleanName = (raw: string): string => {
  const parts = raw.split("\t").map((s) => s.trim());
  if (parts.length > 1 && TAB_TAILS.has(parts[parts.length - 1])) parts.pop();
  return parts.join(" ").replace(/\s+/g, " ").trim();
};
const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** RFC-4180-ish parser: quoted fields, doubled quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

export interface Excluded {
  name: string;
  country: string;
  reason: string;
}
export interface BasesReport {
  source: string;
  data_through: number;
  source_rows: number;
  rows: number;
  needs_review: number;
  by_country: Record<string, number>;
  by_site_type: Record<SiteType, number>;
  both_flags_rows: string[];
  excluded: Excluded[];
  /** Source ISO3 that were replaced by a country-label override. */
  iso_overrides: { country: string; source_iso3: string; iso3: string }[];
  iso_exceptions: Record<string, string>;
  unmapped_iso3: string[];
  /** Countries with troops in the latest DMDC table but no base here, and the reverse. */
  troops_without_bases: string[];
  bases_without_troops: string[];
  review: { base_id: string; reason: string }[];
  bytes: number;
}

export interface BasesInput {
  csv: string;
  geo: NeCollection;
  /** `country_code` of every non-aggregate row of countries.json. */
  countryCodes: ReadonlySet<string>;
  /** ISO3 of hosts with troops in the latest DMDC table. */
  troopHostIso3: ReadonlySet<string>;
  /** `world_map.json` width and height. */
  mapSize: { width: number; height: number };
}

const num = (s: string) => (s.trim() === "" || s.trim() === "NA" ? NaN : Number(s));

export function buildBases(input: BasesInput): { rows: BaseRow[]; report: BasesReport; failures: string[] } {
  const failures: string[] = [];
  const table = parseCsv(input.csv);
  const head = table[0].map((h) => h.trim());
  for (const c of BASE_COLUMNS) if (!head.includes(c)) failures.push(`missing column ${c}`);
  const col = Object.fromEntries(BASE_COLUMNS.map((c) => [c, head.indexOf(c)]));
  const projection = worldProjection(input.geo);

  // Country bounding boxes (lon/lat), to flag a point far from its own country.
  const boxes = new Map<string, [[number, number], [number, number]]>();
  for (const f of input.geo.features) {
    const k = featureKey(f.properties);
    const b = geoBounds(f.geometry as GeoPermissibleObjects);
    if (b[0][0] <= b[1][0]) boxes.set(k, b); // skip features that wrap the antimeridian
  }

  const rows: BaseRow[] = [];
  const excluded: Excluded[] = [];
  const overrides = new Map<string, { country: string; source_iso3: string; iso3: string }>();
  const bothFlags: string[] = [];
  const seen = new Map<string, number>();
  const exact = new Set<string>();
  const ids = new Set<string>();

  for (const line of table.slice(1)) {
    const g = (c: (typeof BASE_COLUMNS)[number]) => (line[col[c]] ?? "").trim();
    const label = g("countryname");
    const name = cleanName(line[col.basename] ?? "");
    const srcIso = g("iso3c");
    if (NOT_DRAWN_COUNTRY[label]) {
      excluded.push({ name, country: label, reason: NOT_DRAWN_COUNTRY[label] });
      continue;
    }
    const lat = num(g("lat"));
    const lon = num(g("lon"));
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      excluded.push({ name, country: label, reason: "no coordinates in the source" });
      continue;
    }
    const iso3 = COUNTRY_ISO[label] ?? srcIso;
    if (iso3 !== srcIso) overrides.set(`${label}|${srcIso}|${iso3}`, { country: label, source_iso3: srcIso, iso3 });
    const country = COUNTRY_NAME[label] ?? label;
    const flags = { base: g("base") === "1", lilypad: g("lilypad") === "1", funded: g("fundedsite") === "1" };
    const site_type: SiteType = flags.base ? "base" : flags.lilypad ? "lilypad" : flags.funded ? "funded_site" : (null as never);
    if (!site_type) {
      failures.push(`${label}: ${name} has no site-type flag`);
      continue;
    }
    if (Number(flags.base) + Number(flags.lilypad) + Number(flags.funded) > 1) bothFlags.push(`${country}: ${name}`);

    const dupKey = `${iso3}|${name}|${lat}|${lon}`;
    if (exact.has(dupKey)) {
      excluded.push({ name, country, reason: "exact duplicate row (same country, name and coordinates)" });
      continue;
    }
    exact.add(dupKey);

    let base_id = `${iso3.toLowerCase()}-${slug(name)}`;
    const n = (seen.get(base_id) ?? 0) + 1;
    seen.set(base_id, n);
    if (n > 1) base_id += `-${n}`;
    if (ids.has(base_id)) failures.push(`duplicate base_id ${base_id}`);
    ids.add(base_id);

    if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) failures.push(`${base_id}: coordinates out of range (${lat}, ${lon})`);
    if (!input.countryCodes.has(iso3) && !ISO_EXCEPTIONS[iso3]) failures.push(`${base_id}: iso3 ${iso3} is not in countries.json or the exception table`);

    const pt = projection([lon, lat]);
    if (!pt) {
      failures.push(`${base_id}: does not project`);
      continue;
    }
    const x = Math.round(pt[0] * 10) / 10;
    const y = Math.round(pt[1] * 10) / 10;
    if (!(x >= 0 && x <= input.mapSize.width && y >= 0 && y <= input.mapSize.height)) failures.push(`${base_id}: projects outside the map (${x}, ${y})`);

    let review = REVIEW[`${iso3}|${cleanName(line[col.basename] ?? "")}`] ?? null;
    const box = boxes.get(iso3);
    if (!review && box) {
      const pad = 3;
      if (lon < box[0][0] - pad || lon > box[1][0] + pad || lat < box[0][1] - pad || lat > box[1][1] + pad) review = "Coordinates fall outside the country’s bounds";
    }
    rows.push({ base_id, name, country, iso3, lat, lon, site_type, x, y, source: BASES_SOURCE, needs_review: review !== null, review_note: review });
  }

  rows.sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name) || a.base_id.localeCompare(b.base_id));
  const byCountry: Record<string, number> = {};
  const bySite: Record<SiteType, number> = { base: 0, lilypad: 0, funded_site: 0 };
  for (const r of rows) {
    byCountry[r.country] = (byCountry[r.country] ?? 0) + 1;
    bySite[r.site_type]++;
  }
  const baseIso = new Set(rows.map((r) => r.iso3));
  const report: BasesReport = {
    source: BASES_SOURCE,
    data_through: BASES_DATA_THROUGH,
    source_rows: table.length - 1,
    rows: rows.length,
    needs_review: rows.filter((r) => r.needs_review).length,
    by_country: Object.fromEntries(Object.entries(byCountry).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    by_site_type: bySite,
    both_flags_rows: bothFlags,
    excluded,
    iso_overrides: [...overrides.values()].sort((a, b) => a.country.localeCompare(b.country)),
    iso_exceptions: { ...ISO_EXCEPTIONS },
    unmapped_iso3: [...baseIso].filter((c) => !input.countryCodes.has(c) && !ISO_EXCEPTIONS[c]).sort(),
    troops_without_bases: [...input.troopHostIso3].filter((c) => !baseIso.has(c)).sort(),
    bases_without_troops: [...baseIso].filter((c) => !input.troopHostIso3.has(c)).sort(),
    review: rows.filter((r) => r.needs_review).map((r) => ({ base_id: r.base_id, reason: r.review_note! })),
    bytes: 0,
  };
  return { rows, report, failures };
}
