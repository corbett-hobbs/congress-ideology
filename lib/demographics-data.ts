import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { legislator, term } from "./entities";
import { administration } from "./executive-orders-entities";
import { buildDemographics } from "./demographics-derive";
import type { DemographicsPayload } from "./demographics-types";
import { HISTORICAL_ADMINISTRATIONS } from "./troops-presidents";

/**
 * Build-time reader for /congress/demographics: parses `legislators.json`, `terms.json` and `administrations.json` at the
 * boundary (a bad file fails the build), then hands the page a small payload (47 Congresses x 3 chamber views). Shaping is
 * the pure, unit-tested `lib/demographics-derive.ts`; nothing pre-joined is stored.
 */
const OUT = join(process.cwd(), "pipeline", "output");
const read = (file: string): unknown[] => JSON.parse(readFileSync(join(OUT, file), "utf8"));

let cache: DemographicsPayload | null = null;

export function getDemographicsPayload(): DemographicsPayload {
  if (cache) return cache;
  const admins = (read("administrations.json") as unknown[]).map((r) => administration.parse(r));
  const all = [...HISTORICAL_ADMINISTRATIONS, ...admins].filter((a, i, l) => l.findIndex((b) => b.term_id === a.term_id) === i);
  cache = buildDemographics(
    read("legislators.json").map((r) => legislator.parse(r)),
    read("terms.json").map((r) => term.parse(r)),
    all,
  );
  return cache;
}
