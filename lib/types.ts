/**
 * The planned entity model for `pipeline/output/`.
 *
 * These types describe the on-disk (serialized JSON) shape, so field names are
 * `snake_case` to match the data, not the usual TS `camelCase`. The source
 * layer is normalized — one fact in one place; page-shaped data is joined from
 * these at build time. See `docs/DATA_CONVENTIONS.md`.
 *
 * Nothing here is produced yet. Session 2 builds the transforms that emit and
 * validate these; treat this file as the schema skeleton, and keep it in sync
 * with DATA_CONVENTIONS.md §2.
 */

/** Bioguide identifier, e.g. `"R000575"`. The sole canonical join key. */
export type BioguideId = string;

/** Congress number, e.g. `119`. The canonical time axis (not calendar year). */
export type CongressNumber = number;

export type Chamber = "house" | "senate";

export type Party = "Democrat" | "Republican" | "Independent" | string;

/** Stable identity. Nothing that varies by Congress. */
export interface Legislator {
  bioguide_id: BioguideId;
  name: {
    first: string;
    last: string;
    /** Voteview's `bioname` ("LAST, First"), kept for display parity. */
    official_full?: string;
  };
  birth_year?: number;
  death_year?: number;
  gender?: "M" | "F";
}

/** One row per legislator × Congress — "who served when." */
export interface Term {
  bioguide_id: BioguideId;
  congress: CongressNumber;
  chamber: Chamber;
  state: string;
  party: Party;
  /** House only. */
  district?: number;
  /** Senate only. */
  senate_class?: 1 | 2 | 3;
}

/** One row per legislator × year. */
export interface FinancialDisclosure {
  bioguide_id: BioguideId;
  year: number;
}

export interface Committee {
  committee_id: string;
  name: string;
  chamber: Chamber | "joint";
  /** Set for subcommittees. */
  parent_committee_id?: string;
}

export type CommitteeRole = "chair" | "ranking_member" | "member";

/** One row per legislator × committee × Congress. */
export interface CommitteeMembership {
  bioguide_id: BioguideId;
  committee_id: string;
  congress: CongressNumber;
  role: CommitteeRole;
}

/**
 * One row per legislator × Congress × metric. DW-NOMINATE dimensions today;
 * interest-group scores later. `metric` values come from `lib/nominate.ts`
 * (`NominateMetric.column`) or a future scores module.
 */
export interface IssueScore {
  bioguide_id: BioguideId;
  congress: CongressNumber;
  metric: string;
  value: number;
}
