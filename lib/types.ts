/**
 * Entity model for `pipeline/output/`.
 *
 * The entities that are actually built and emitted live in `lib/entities.ts` as
 * Zod schemas (the output contract); their types are re-exported here for
 * convenience. This file additionally holds the *planned* entities that have no
 * data source integrated yet — documented so later sessions stay consistent
 * with DATA_CONVENTIONS.md §2, but not produced.
 */

export type {
  BioguideId,
  Chamber,
  IdCrosswalkEntry,
  Legislator,
  Term,
  IdeologyScore,
} from "./entities";

import type { BioguideId } from "./entities";

/** Congress number, e.g. `119`. The canonical time axis (not calendar year). */
export type CongressNumber = number;

// ---------------------------------------------------------------------------
// Planned — schema documented, no data source integrated yet. Do not emit.
// ---------------------------------------------------------------------------

/** One row per legislator × year. Source undecided (OpenSecrets, House Clerk). */
export interface FinancialDisclosure {
  bioguide_id: BioguideId;
  year: number;
}

export interface Committee {
  committee_id: string;
  name: string;
  chamber: "house" | "senate" | "joint";
  /** Set for subcommittees. */
  parent_committee_id?: string;
}

export type CommitteeRole = "chair" | "ranking_member" | "member";

/** One row per legislator × committee × Congress. */
export interface CommitteeMembership {
  bioguide_id: BioguideId;
  committee_id: string;
  congress_number: CongressNumber;
  role: CommitteeRole;
}

/**
 * One row per legislator × Congress × metric — the melted format reserved for
 * future interest-group / issue scores. DW-NOMINATE is emitted wide in
 * `ideology_scores.json` instead; this is not that.
 */
export interface IssueScore {
  bioguide_id: BioguideId;
  congress_number: CongressNumber;
  metric: string;
  value: number;
}
