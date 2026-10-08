import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { justiceVotesFile, type JusticeVote, type JusticeVotesFile } from "./decisions-entities";

/**
 * Build-time reader for how each justice voted (`pipeline/output/court/justice_votes.json`, built by the Decisions transform from the
 * justice-centered SCDB file). Parsed once at the boundary; a justice's rows are served at `/data/justices/[justice_id]/votes` and
 * joined in the browser to the case list the Decisions page already ships.
 */
let cache: JusticeVotesFile | null = null;

function all(): JusticeVotesFile {
  cache ??= justiceVotesFile.parse(JSON.parse(readFileSync(join(process.cwd(), "pipeline", "output", "court", "justice_votes.json"), "utf8")));
  return cache;
}

/** SCDB justice ids with at least one vote in an argued case (the Court's record starts in 1946). */
export const getVotedJusticeIds = (): number[] => Object.keys(all()).map(Number);

export const getJusticeVotes = (justiceId: number): JusticeVote[] | null => all()[String(justiceId)] ?? null;
