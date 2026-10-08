import "server-only";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { buildDecisionsPayload, countCaseRows } from "./decisions-derive";
import { caseArticleRow, caseSummaryRow, decisionCaseRow, decisionCountRow, decisionsMeta, landmarkRow } from "./decisions-entities";
import type { DecisionCase, DecisionsPayload } from "./decisions-types";

/**
 * Build-time reader for /supreme-court/decisions: parses `decisions_counts.json` and `decisions_meta.json` at the boundary
 * (a bad file fails the build), then hands the page one dense payload (80 terms x 14 issue areas x 5 dissent buckets, a few
 * tens of KB). Shaping is the pure, unit-tested `lib/decisions-derive.ts`; nothing pre-joined is stored.
 */
const OUT = join(process.cwd(), "pipeline", "output");
const read = (file: string): unknown => JSON.parse(readFileSync(join(OUT, file), "utf8"));

let cache: DecisionsPayload | null = null;

/** A short hash of the case list, for the fetch URL. */
const casesVersion = (): string => createHash("sha1").update(JSON.stringify(getDecisionCases())).digest("hex").slice(0, 10);

export function getDecisionsPageData(): DecisionsPayload {
  if (cache) return cache;
  const counts = z.array(decisionCountRow).parse(read("decisions_counts.json"));
  const meta = decisionsMeta.parse(read("decisions_meta.json"));
  const landmarkIds = new Set(z.array(landmarkRow).parse(read("decisions_landmarks.json")).map((r) => r.case_id));
  const caseRows = z.array(decisionCaseRow).parse(read("decisions_cases.json"));
  const articles = z.array(caseArticleRow).parse(read("decisions_articles.json")).filter((r) => r.title !== null);
  const fetched = z.object({ fetched: z.string() }).parse(JSON.parse(readFileSync(join(process.cwd(), "pipeline", "raw", "wikipedia-cases", "manifest.json"), "utf8"))).fetched;
  const summaries = z.array(caseSummaryRow).parse(read("decisions_summaries.json"));
  const summaryFetched = z.object({ fetched: z.string() }).parse(JSON.parse(readFileSync(join(process.cwd(), "pipeline", "raw", "wikipedia-cases", "leads-manifest.json"), "utf8"))).fetched;
  cache = { ...buildDecisionsPayload(counts, meta, countCaseRows(caseRows.filter((r) => landmarkIds.has(r.case_id)))), casesVersion: casesVersion(), articleSource: { count: articles.length, fetched }, summarySource: { count: summaries.length, claude: summaries.filter((r) => r.via === "claude").length, fetched: summaryFetched } };
  return cache;
}

let casesCache: DecisionCase[] | null = null;

/** "Fourth Amendment rights", the deepest heading of each list section a landmark sits under, joined. */
const topicText = (topics: readonly string[]): string => [...new Set(topics.map((t) => t.split(" \u203a ").pop()!))].slice(0, 2).join(" \u00b7 ");

/** Every case in scope, newest first, as the compact arrays the list card fetches from `/data/decisions/cases`. */
export function getDecisionCases(): DecisionCase[] {
  if (casesCache) return casesCache;
  const meta = decisionsMeta.parse(read("decisions_meta.json"));
  const index = new Map(meta.issue_areas.map((a, i) => [a.id, i]));
  const landmarks = new Map(z.array(landmarkRow).parse(read("decisions_landmarks.json")).map((r) => [r.case_id, r]));
  const articles = new Map(z.array(caseArticleRow).parse(read("decisions_articles.json")).map((r) => [r.case_id, r.title] as const));
  const summaries = new Map(z.array(caseSummaryRow).parse(read("decisions_summaries.json")).map((r) => [r.case_id, r] as const));
  const rows = z.array(decisionCaseRow).parse(read("decisions_cases.json"));
  casesCache = rows
    .map((r): DecisionCase => {
      const lm = landmarks.get(r.case_id);
      return [r.term, r.date, r.name, r.cite, r.issue_area_id === null ? -1 : (index.get(r.issue_area_id) ?? -1), r.band, r.maj, r.min, lm?.title ?? "", lm ? topicText(lm.topics) : "", lm ? lm.title : articles.has(r.case_id) ? articles.get(r.case_id) ?? null : "", summaries.get(r.case_id)?.summary ?? "", summaries.get(r.case_id)?.via === "claude" ? 1 : 0];
    })
    .reverse();
  return casesCache;
}
