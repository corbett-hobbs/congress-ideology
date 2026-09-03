import type { VoteviewMemberRow } from "../validate/schemas";
import type { IdeologyScore } from "../../lib/entities";
import { resolveBioguide, type Crosswalk } from "./crosswalk";

/**
 * icpsrs that resolve to no bioguide anywhere and are known/expected to.
 * A NEW unresolvable icpsr is a pipeline error; these are allowlisted with a
 * reason so the check stays meaningful. See docs/DATA_CONVENTIONS.md §1.
 */
export const KNOWN_UNRESOLVABLE: Record<number, string> = {
  99999: "Voteview placeholder icpsr (\"POE, Washington\", 29th Congress)",
  10509: "George O. Chambers, 87th Congress — no bioguide in either source",
  15067:
    "John L. \"Jack\" Swigert, 98th Congress — elected Nov 1982, died before being sworn in",
};

const chamberOf = (c: "House" | "Senate"): IdeologyScore["chamber"] =>
  c === "Senate" ? "senate" : "house";

export interface ScoresResult {
  scores: IdeologyScore[];
  /** Rows dropped because no bioguide could be resolved. */
  unresolvable: { icpsr: number; bioname: string; congress: number }[];
  /** Crosswalk vs Voteview `bioguide_id` disagreements (fatal upstream). */
  mismatches: { icpsr: number; bioname: string; crosswalk: string; voteview: string }[];
  /** How each emitted row's bioguide was resolved. */
  resolution: Record<"agree" | "crosswalk" | "voteview", number>;
}

/**
 * One `ideology_scores.json` row per (bioguide_id, congress_number, chamber)
 * from Voteview, President rows excluded. Grain includes chamber because a
 * member who served both chambers in one Congress has a distinct per-Congress
 * (nokken_poole) score for each.
 */
export function buildIdeologyScores(
  memberRows: readonly VoteviewMemberRow[],
  crosswalk: Crosswalk,
): ScoresResult {
  const scores: IdeologyScore[] = [];
  const unresolvable: ScoresResult["unresolvable"] = [];
  const mismatches: ScoresResult["mismatches"] = [];
  const resolution = { agree: 0, crosswalk: 0, voteview: 0 };

  for (const row of memberRows) {
    if (row.chamber === "President") continue;

    const res = resolveBioguide(row.icpsr, row.bioguide_id || undefined, crosswalk);
    if (!res.ok) {
      if (res.reason === "mismatch") {
        mismatches.push({
          icpsr: row.icpsr,
          bioname: row.bioname,
          crosswalk: res.crosswalk ?? "",
          voteview: res.voteview ?? "",
        });
      } else {
        unresolvable.push({
          icpsr: row.icpsr,
          bioname: row.bioname,
          congress: row.congress,
        });
      }
      continue;
    }

    resolution[res.source] += 1;
    scores.push({
      bioguide_id: res.bioguide,
      congress_number: row.congress,
      chamber: chamberOf(row.chamber),
      nominate_dim1: row.nominate_dim1,
      nominate_dim2: row.nominate_dim2,
      nokken_poole_dim1: row.nokken_poole_dim1,
      nokken_poole_dim2: row.nokken_poole_dim2,
      n_votes:
        row.nominate_number_of_votes == null
          ? null
          : Math.round(row.nominate_number_of_votes),
      // Some raw rows carry "100.0" etc. — coerced to a number upstream, round
      // to be safe before the int schema.
      party_code: Math.round(row.party_code),
    });
  }

  scores.sort(
    (a, b) =>
      a.bioguide_id.localeCompare(b.bioguide_id) ||
      a.congress_number - b.congress_number ||
      a.chamber.localeCompare(b.chamber),
  );
  return { scores, unresolvable, mismatches, resolution };
}
