import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { administration } from "./executive-orders-entities";
import { aidMeta, aidRow, worldMapFile, type WorldMapFile } from "./foreign-aid-entities";
import { buildAidPayload } from "./foreign-aid-derive";
import type { AidPayload } from "./foreign-aid-types";

/**
 * Build-time reader for /presidency/foreign-aid: parses the pipeline output at the boundary
 * (a bad file fails the build with a specific error), then hands the page a dense payload.
 * Shaping is in the pure, unit-tested `lib/foreign-aid-derive.ts`.
 */

const OUT = join(process.cwd(), "pipeline", "output");
const read = (file: string): unknown => JSON.parse(readFileSync(join(OUT, file), "utf8"));

let cache: AidPayload | null = null;

export function getAidPayload(): AidPayload {
  if (cache) return cache;
  cache = buildAidPayload(
    (read("foreign_assistance.json") as unknown[]).map((r) => aidRow.parse(r)),
    aidMeta.parse(read("foreign_assistance_meta.json")),
    (read("administrations.json") as unknown[]).map((r) => administration.parse(r)),
  );
  return cache;
}

let mapCache: WorldMapFile | null = null;

/** The simplified world outlines (pipeline/transform/world-map.ts), validated at the boundary. */
export function getWorldMap(): WorldMapFile {
  if (!mapCache) mapCache = worldMapFile.parse(read("world_map.json"));
  return mapCache;
}
