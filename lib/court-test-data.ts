import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  CourtMedianProbability,
  CourtTermRow,
  Justice,
  MqScore,
} from "./court-entities";
import { buildCourtPayload } from "./court-derive";

/** The real Court outputs, for tests (no `server-only`). */
export function loadRealCourt() {
  const read = <T>(n: string) =>
    JSON.parse(
      readFileSync(join(process.cwd(), "pipeline", "output", "court", n), "utf8"),
    ) as T[];
  return buildCourtPayload({
    justices: read<Justice>("justices.json"),
    scores: read<MqScore>("mq_scores.json"),
    terms: read<CourtTermRow>("court_terms.json"),
    probabilities: read<CourtMedianProbability>("court_median_probabilities.json"),
  });
}
