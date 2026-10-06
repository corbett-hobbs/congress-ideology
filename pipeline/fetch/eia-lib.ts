import { rawEnergySeries, type EnergyCatalogEntry, type RawEnergySeries } from "../../lib/energy-entities";
import { RAW_DIR } from "./lib";

/** Raw EIA snapshots: side-effect-free helpers shared by the fetch, diff and transform stages. */
export const EIA_DIR = `${RAW_DIR}/eia`;
export const rawPath = (id: string) => `${EIA_DIR}/${id}.json`;
export const EIA_API = "https://api.eia.gov/v2";

/** The query for a catalog entry, WITHOUT the key (this string is committed in the raw file). */
export function queryFor(entry: EnergyCatalogEntry, offset: number, length: number): string {
  const s = entry.source;
  const q = new URLSearchParams();
  q.set("frequency", s.frequency);
  q.set("data[0]", "valueField" in s ? s.valueField : "value");
  for (const [k, v] of Object.entries(s.facets)) q.append(`facets[${k}][]`, v);
  q.set("sort[0][column]", "period");
  q.set("sort[0][direction]", "asc");
  q.set("offset", String(offset));
  q.set("length", String(length));
  return q.toString();
}

/** One observation per line, so a refresh diffs as added/changed lines. */
export function serializeRaw(raw: RawEnergySeries): string {
  const head = JSON.stringify({ fetched_at: raw.fetched_at, series: raw.series });
  const body = raw.observations.map((o) => `    ${JSON.stringify(o)}`).join(",\n");
  return `{\n  "head": ${head},\n  "observations": [\n${body}\n  ]\n}\n`;
}

/** Parse a committed snapshot (inverse of `serializeRaw`); null if it is unreadable. */
export function parseRawText(text: string): RawEnergySeries | null {
  try {
    const j = JSON.parse(text) as { head: unknown; observations: unknown };
    return rawEnergySeries.parse({ ...(j.head as object), observations: j.observations });
  } catch {
    return null;
  }
}
