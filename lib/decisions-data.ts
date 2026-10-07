import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { buildDecisionsPayload } from "./decisions-derive";
import { decisionCaseRow, decisionCountRow, decisionsMeta } from "./decisions-entities";
import type { DecisionCase, DecisionsPayload } from "./decisions-types";

/**
 * Build-time reader for /supreme-court/decisions: parses `decisions_counts.json` and `decisions_meta.json` at the boundary
 * (a bad file fails the build), then hands the page one dense payload (80 terms x 14 issue areas x 5 dissent buckets, a few
 * tens of KB). Shaping is the pure, unit-tested `lib/decisions-derive.ts`; nothing pre-joined is stored.
 */
const OUT = join(process.cwd(), "pipeline", "output");
const read = (file: string): unknown => JSON.parse(readFileSync(join(OUT, file), "utf8"));

let cache: DecisionsPayload | null = null;

export function getDecisionsPageData(): DecisionsPayload {
  if (cache) return cache;
  const counts = z.array(decisionCountRow).parse(read("decisions_counts.json"));
  const meta = decisionsMeta.parse(read("decisions_meta.json"));
  cache = buildDecisionsPayload(counts, meta);
  return cache;
}

let casesCache: DecisionCase[] | null = null;

/** Every case in scope, newest first, as the compact arrays the list card fetches from `/data/decisions/cases`. */
export function getDecisionCases(): DecisionCase[] {
  if (casesCache) return casesCache;
  const meta = decisionsMeta.parse(read("decisions_meta.json"));
  const index = new Map(meta.issue_areas.map((a, i) => [a.id, i]));
  const rows = z.array(decisionCaseRow).parse(read("decisions_cases.json"));
  casesCache = rows
    .map((r): DecisionCase => [r.term, r.date, r.name, r.cite, r.issue_area_id === null ? -1 : (index.get(r.issue_area_id) ?? -1), r.band, r.maj, r.min])
    .reverse();
  return casesCache;
}
