import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { administration } from "./executive-orders-entities";
import { buildLawsPayload } from "./laws-derive";
import { lawCountRow, lawRow, lawsMeta } from "./laws-entities";
import type { LawsPayload } from "./laws-types";
import { HISTORICAL_ADMINISTRATIONS } from "./troops-presidents";

/**
 * Build-time reader for the Congress Laws page: parses `laws_counts.json`, `laws.json` and `laws_meta.json` at the boundary
 * (a bad file fails the build) and hands the page one dense payload. Shaping is the pure, unit-tested `lib/laws-derive.ts`.
 * The case-grain list (`laws.json`) is served to the browser separately in Session 5.
 */
const OUT = join(process.cwd(), "pipeline", "output");
const read = (file: string): unknown => JSON.parse(readFileSync(join(OUT, file), "utf8"));

let cache: LawsPayload | null = null;

export function getLawsPageData(): LawsPayload {
  if (cache) return cache;
  const counts = z.array(lawCountRow).parse(read("laws_counts.json"));
  const laws = z.array(lawRow).parse(read("laws.json"));
  const meta = lawsMeta.parse(read("laws_meta.json"));
  const admins = [...HISTORICAL_ADMINISTRATIONS, ...z.array(administration).parse(read("administrations.json"))];
  cache = buildLawsPayload(counts, laws, meta, admins);
  return cache;
}
