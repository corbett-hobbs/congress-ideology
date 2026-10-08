import { ROLE_CONCURRED, ROLE_CONCURRENCE, ROLE_DISSENT, ROLE_MAJORITY, ROLE_NONE, VOTE_DISSENT, VOTE_DIVIDED, VOTE_MAJORITY, VOTE_NONE, type JusticeVote } from "./decisions-entities";
import type { DecisionCase } from "./decisions-types";

/**
 * Pure shaping for a justice's case table: the justice's `[case_id, vote, role]` rows joined to the case list the Decisions page
 * ships (newest first), the filter pills and the summary numbers. No file I/O, so it runs in the browser and in tests.
 */

/** One case the justice has a row for, with how they voted. */
export interface VotedCase {
  c: DecisionCase;
  vote: number;
  role: number;
}

/** Index of the SCDB case id in a `DecisionCase`. */
export const CASE_ID = 14;

/** The cases in `cases` order (newest first) the justice has a row for; a row whose case is not in the list is dropped. */
export function joinVotes(votes: readonly JusticeVote[], cases: readonly DecisionCase[]): VotedCase[] {
  const by = new Map(votes.map((v) => [v[0], v] as const));
  const out: VotedCase[] = [];
  for (const c of cases) {
    const v = by.get(c[CASE_ID]);
    if (v) out.push({ c, vote: v[1], role: v[2] });
  }
  return out;
}

export type VoteFilter = "all" | "majority" | "dissent" | "wrote";

export const VOTE_FILTERS: { value: VoteFilter; label: string }[] = [
  { value: "all", label: "All votes" },
  { value: "majority", label: "Majority" },
  { value: "dissent", label: "Dissent" },
  { value: "wrote", label: "Wrote an opinion" },
];

/** Wrote the majority opinion, a concurrence or a dissent (not merely joined one). */
export const wroteOpinion = (v: Pick<VotedCase, "role">): boolean => v.role === ROLE_MAJORITY || v.role === ROLE_CONCURRENCE || v.role === ROLE_DISSENT;

export function matchesVote(v: VotedCase, f: VoteFilter): boolean {
  if (f === "all") return true;
  if (f === "majority") return v.vote === VOTE_MAJORITY;
  if (f === "dissent") return v.vote === VOTE_DISSENT;
  return wroteOpinion(v);
}

/** The qualifier pill's words. */
export const VOTE_LABEL: Record<number, string> = {
  [VOTE_NONE]: "Did not take part",
  [VOTE_MAJORITY]: "Majority",
  [VOTE_DISSENT]: "Dissent",
  [VOTE_DIVIDED]: "Equally divided",
};

/** The small line under the pill; null when there is nothing to add. */
export const ROLE_LABEL: Record<number, string | null> = {
  [ROLE_NONE]: null,
  [ROLE_MAJORITY]: "Wrote the opinion",
  [ROLE_CONCURRENCE]: "Wrote a concurrence",
  [ROLE_DISSENT]: "Wrote a dissent",
  [ROLE_CONCURRED]: "Concurred",
};

export interface VoteStats {
  /** Cases the justice voted in (a side was taken). */
  took: number;
  majority: number;
  dissent: number;
  /** Cases decided 5–4 (or 4–4), and how many of those the justice was in the majority for. */
  close: number;
  closeMajority: number;
}

export function voteStats(rows: readonly VotedCase[]): VoteStats {
  const s: VoteStats = { took: 0, majority: 0, dissent: 0, close: 0, closeMajority: 0 };
  for (const r of rows) {
    if (r.vote !== VOTE_MAJORITY && r.vote !== VOTE_DISSENT) continue;
    s.took += 1;
    if (r.vote === VOTE_MAJORITY) s.majority += 1;
    else s.dissent += 1;
    if (r.c[5] === 4) {
      s.close += 1;
      if (r.vote === VOTE_MAJORITY) s.closeMajority += 1;
    }
  }
  return s;
}

/** A whole-number percentage, or null with nothing to divide. */
export const pct = (n: number, of: number): number | null => (of === 0 ? null : Math.round((n / of) * 100));
