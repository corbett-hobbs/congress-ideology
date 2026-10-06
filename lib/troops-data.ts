import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { administration } from "./executive-orders-entities";
import { worldMapFile, type WorldMapFile } from "./foreign-aid-entities";
import { buildTroopsPayload } from "./troops-derive";
import { historyMeta, historyRow, troopsMeta, troopsRow } from "./troops-entities";
import type { TroopsPayload } from "./troops-types";

/**
 * Build-time reader for /presidency/national-security: parses the pipeline output at the boundary (a bad file fails
 * the build with a specific error), then hands the page a dense payload. Shaping is the pure, unit-tested
 * `lib/troops-derive.ts`.
 */
const OUT = join(process.cwd(), "pipeline", "output");
const read = (file: string): unknown => JSON.parse(readFileSync(join(OUT, file), "utf8"));

let cache: TroopsPayload | null = null;

export function getTroopsPayload(): TroopsPayload {
  if (cache) return cache;
  cache = buildTroopsPayload(
    (read("troops_location.json") as unknown[]).map((r) => troopsRow.parse(r)),
    troopsMeta.parse(read("troops_location_meta.json")),
    (read("administrations.json") as unknown[]).map((r) => administration.parse(r)),
    { rows: (read("troops_history.json") as unknown[]).map((r) => historyRow.parse(r)), meta: historyMeta.parse(read("troops_history_meta.json")) },
  );
  return cache;
}

let mapCache: WorldMapFile | null = null;

/** The simplified world outlines (pipeline/transform/world-map.ts), validated at the boundary. */
export function getTroopsWorldMap(): WorldMapFile {
  if (!mapCache) mapCache = worldMapFile.parse(read("world_map.json"));
  return mapCache;
}
