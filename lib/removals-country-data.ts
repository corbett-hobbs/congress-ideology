import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { iceCatalog } from "./enforcement-entities";
import { buildRemovalsCountryPayload } from "./removals-country-derive";
import { removalsCountryReport, removalsCountryRow } from "./removals-country-entities";
import type { RemovalsCountryPayload } from "./removals-country-types";

/**
 * Build-time reader for the "Who gets removed" card: parses the pipeline output and the ICE source
 * catalog at the boundary (a bad file fails the build), then hands the page a dense payload.
 * Shaping is in the pure, unit-tested `lib/removals-country-derive.ts`.
 */

const read = (...parts: string[]): unknown => JSON.parse(readFileSync(join(process.cwd(), ...parts), "utf8"));

let cache: RemovalsCountryPayload | null = null;

export function getRemovalsCountryPayload(): RemovalsCountryPayload {
  if (cache) return cache;
  cache = buildRemovalsCountryPayload(
    (read("pipeline", "output", "removals_by_country.json") as unknown[]).map((r) => removalsCountryRow.parse(r)),
    removalsCountryReport.parse(read("pipeline", "output", "removals_by_country_report.json")),
    iceCatalog.parse(read("pipeline", "reference", "ice-removals-catalog.json")).sources,
  );
  return cache;
}
