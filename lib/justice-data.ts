import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  CourtMedianProbability,
  CourtTermRow,
  Justice,
  MqScore,
} from "./court-entities";
import { buildCourtPayload } from "./court-derive";
import type { CourtHubSummary, CourtPayload } from "./court-types";

/**
 * Build-time Supreme Court dataset: reads the four normalized outputs in
 * `pipeline/output/court/` and ships one compact payload to `/supreme-court`
 * and a tiny summary to the hub card. Mirrors `lib/committee-data.ts`; the
 * shaping rules live in `lib/court-derive.ts`.
 */

export type { CourtHubSummary, CourtPayload } from "./court-types";

function readCourt<T>(name: string): T[] {
  const path = join(process.cwd(), "pipeline", "output", "court", name);
  return JSON.parse(readFileSync(path, "utf8")) as T[];
}

let cached: CourtPayload | null = null;

export function getCourtPayload(): CourtPayload {
  cached ??= buildCourtPayload({
    justices: readCourt<Justice>("justices.json"),
    scores: readCourt<MqScore>("mq_scores.json"),
    terms: readCourt<CourtTermRow>("court_terms.json"),
    probabilities: readCourt<CourtMedianProbability>(
      "court_median_probabilities.json",
    ),
  });
  return cached;
}

/** What the hub card needs: the latest term's median justice and the median series. */
export function getCourtHubSummary(): CourtHubSummary {
  const { terms, justices, lastTerm, domain } = getCourtPayload();
  const latest = terms[terms.length - 1];
  const median = justices.find((j) => j.id === latest.medianJusticeId);
  if (!median) throw new Error("court: median justice missing from payload");
  return {
    lastTerm,
    medianJusticeName: median.name,
    medianSeries: terms.map((t) => ({ term: t.term, median: t.median })),
    domain,
  };
}
