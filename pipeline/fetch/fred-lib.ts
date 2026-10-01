import { rawFredSeries, type RawFredSeries } from "../../lib/indicator-entities";
import { RAW_DIR } from "./lib";

/** Raw FRED snapshots: side-effect-free helpers shared by the fetch, diff and transform stages. */
export const FRED_DIR = `${RAW_DIR}/fred`;
export const rawPath = (id: string) => `${FRED_DIR}/${id}.json`;

/** One observation per line, so a refresh diffs as added/changed lines. */
export function serializeRaw(raw: RawFredSeries): string {
  const head = JSON.stringify({ fetched_at: raw.fetched_at, series: raw.series });
  const body = raw.observations.map((o) => `    ${JSON.stringify(o)}`).join(",\n");
  return `{\n  "head": ${head},\n  "observations": [\n${body}\n  ]\n}\n`;
}

/** Parse a committed snapshot (inverse of `serializeRaw`); null if it is unreadable. */
export function parseRawText(text: string): RawFredSeries | null {
  try {
    const j = JSON.parse(text) as { head: unknown; observations: unknown };
    return rawFredSeries.parse({ ...(j.head as object), observations: j.observations });
  } catch {
    return null;
  }
}
