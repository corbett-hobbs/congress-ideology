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
  CommitteeId,
  IdCrosswalkEntry,
  Legislator,
  Term,
  IdeologyScore,
  Committee,
  CommitteeRole,
  CommitteeMembership,
  FinancialDisclosure,
  DisclosureLineItem,
} from "./entities";

import type { BioguideId } from "./entities";

/** Congress number, e.g. `119`. The canonical time axis (not calendar year). */
export type CongressNumber = number;

// ---------------------------------------------------------------------------
// Planned — schema documented, no data source integrated yet. Do not emit.
// ---------------------------------------------------------------------------

// FinancialDisclosure is built — see `financialDisclosure` in `lib/entities.ts`
// (re-exported above), `lib/wealth-bands.ts` for the range/midpoint policy,
// and `lib/wealth-data.ts` for the per-member payload derived from it.
// Item-level assets/liabilities are also now built — see `disclosureLineItem`
// in `lib/entities.ts` (re-exported above) and
// `pipeline/financial_disclosures/build_line_items.py` (Session 5).

// Committee / CommitteeMembership are built — see `committee` / `committeeMembership`
// in `lib/entities.ts` (re-exported above). Current Congress only; subcommittees
// and a per-committee bills/votes record are the follow-ups. A committee's
// blended ideology position is derived at build time in `lib/committee-data.ts`,
// not stored (DATA_CONVENTIONS §2).

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
