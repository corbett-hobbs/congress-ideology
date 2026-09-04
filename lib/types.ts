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
} from "./entities";

import type { BioguideId } from "./entities";

/** Congress number, e.g. `119`. The canonical time axis (not calendar year). */
export type CongressNumber = number;

// ---------------------------------------------------------------------------
// Planned — schema documented, no data source integrated yet. Do not emit.
// ---------------------------------------------------------------------------

/**
 * One row per legislator × filing year. Source: House Clerk electronic
 * Financial Disclosure PDFs (`disclosures-clerk.house.gov`), parsed by the
 * `pipeline/financial/` Python sidecar. Emitted to
 * `pipeline/output/financial_disclosures.json` in **validation form** — a small
 * sample of current House members, not the full roster (see
 * `docs/HOUSE_DISCLOSURE_EXTRACTOR_EVAL.md`). Not yet wired into `pnpm
 * transform` / `lib/entities.ts`; that happens in the scale-up session.
 *
 * Net worth = Σ(asset-band midpoints) − Σ(liability-band midpoints). Bands with
 * no upper bound ("Over $50,000,000") are never given a fabricated midpoint:
 * they carry `open_ended: true` and a `low` only, are excluded from
 * `net_worth_estimate.midpoint`, and set `needs_review`.
 */
export interface FinancialDisclosure {
  bioguide_id: BioguideId;
  year: number;
  filing_type:
    | "annual"
    | "amendment"
    | "new_filer"
    | "candidate"
    | "termination"
    | "extension"
    | "other";
  doc_id: string;
  source_url: string;
  filer_name: string | null;
  state_district: string | null;
  /** null when the filing is scanned/paper or Schedule A did not parse. */
  net_worth_estimate: {
    low: number;
    high: number;
    /** Σ midpoints; a lower bound when `midpoint_is_lower_bound`. */
    midpoint: number;
    midpoint_is_lower_bound: boolean;
  } | null;
  totals: {
    asset_midpoint_sum: number;
    liability_midpoint_sum: number;
    n_assets: number;
    n_assets_valued: number;
    n_liabilities: number;
  };
  assets: DisclosureLineItem[];
  liabilities: DisclosureLineItem[];
  section_status: Record<string, string>;
  parse_confidence: "high" | "low" | "none";
  needs_review: boolean;
  review_notes: string[];
  parser_warnings: string[];
  source_pages: number;
}

export interface DisclosureValueBand {
  low: number | null;
  high: number | null;
  open_ended: boolean;
  /** null for open-ended or unrecognised bands — never fabricated. */
  midpoint: number | null;
  recognized: boolean;
  raw: string;
}

export interface DisclosureLineItem {
  name: string;
  owner: "JT" | "SP" | "DC" | null;
  type_code: string | null;
  value: DisclosureValueBand | null;
  value_raw: string;
  extra?: Record<string, string>;
  notes?: string[];
}

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
