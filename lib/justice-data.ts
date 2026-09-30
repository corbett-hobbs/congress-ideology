import "server-only";
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
import type { CourtHubSummary, CourtPayload } from "./court-types";
import type { JusticeProfile, JusticeRef } from "./justice-types";

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

function readInputs() {
  return {
    justices: readCourt<Justice>("justices.json"),
    scores: readCourt<MqScore>("mq_scores.json"),
    terms: readCourt<CourtTermRow>("court_terms.json"),
    probabilities: readCourt<CourtMedianProbability>(
      "court_median_probabilities.json",
    ),
  };
}

let cached: CourtPayload | null = null;

export function getCourtPayload(): CourtPayload {
  cached ??= buildCourtPayload(readInputs());
  return cached;
}

let profiles: Map<number, JusticeProfile> | null = null;

/**
 * Every justice's profile page data, joined once per build. Bios come from
 * `justice_bios.json` (`pipeline/fetch/justice-bios.ts`); a justice with no row
 * simply has no bio/photo — the page omits those blocks, never a placeholder.
 */
function loadProfiles(): Map<number, JusticeProfile> {
  if (!profiles) {
    const bios = new Map<number, { extract: string; url: string; photoPath: string | null }>();
    try {
      for (const b of readCourt<JusticeBio>("justice_bios.json")) {
        bios.set(b.justice_id, {
          extract: b.extract,
          url: b.url,
          photoPath: b.photo?.path ?? null,
        });
      }
    } catch {
      // graceful before `pnpm fetch:justice-bios` has been run
    }
    const built = buildJusticeProfiles({ ...readInputs(), bios });
    profiles = new Map(built.profiles.map((p) => [p.justice.id, p]));
  }
  return profiles;
}

export function getJusticeProfile(id: number): JusticeProfile | null {
  return loadProfiles().get(id) ?? null;
}

/** One ref per justice with a profile page, oldest first — for static params and the sitemap. */
export function getJusticeRefs(): JusticeRef[] {
  return [...loadProfiles().values()].map((p) => ({
    id: p.justice.id,
    name: p.justice.name,
  }));
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
