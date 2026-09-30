import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  CourtMedianProbability,
  CourtTermRow,
  Justice,
  JusticeBio,
  MqScore,
} from "./court-entities";
import { buildCourtPayload } from "./court-derive";
import { buildJusticeProfiles } from "./justice-derive";

/** The real Court outputs, for tests (no `server-only`). */
const read = <T>(n: string) =>
  JSON.parse(
    readFileSync(join(process.cwd(), "pipeline", "output", "court", n), "utf8"),
  ) as T[];

const inputs = () => ({
  justices: read<Justice>("justices.json"),
  scores: read<MqScore>("mq_scores.json"),
  terms: read<CourtTermRow>("court_terms.json"),
  probabilities: read<CourtMedianProbability>("court_median_probabilities.json"),
});

export function loadRealCourt() {
  return buildCourtPayload(inputs());
}

/** Every real justice profile, with the committed bios. */
export function loadRealProfiles() {
  const bios = new Map(
    read<JusticeBio>("justice_bios.json").map((b) => [
      b.justice_id,
      { extract: b.extract, url: b.url, photoPath: b.photo?.path ?? null },
    ]),
  );
  return buildJusticeProfiles({ ...inputs(), bios });
}
