import { z } from "zod";

/**
 * The normalized entities emitted to `pipeline/output/`, as Zod schemas.
 *
 * These are the source of truth for the output contract: the transform
 * validates every row against them before writing, and the app can import them
 * (or just the inferred types) to read the files. Field names are the
 * serialized `snake_case` form. See `docs/DATA_CONVENTIONS.md`.
 *
 * Grain and keys:
 *   id_crosswalk.json   one row per icpsr
 *   legislators.json    one row per bioguide_id
 *   terms.json          one row per (bioguide_id, congress_number, chamber)
 *   ideology_scores.json one row per (bioguide_id, congress_number, chamber)
 */

export const bioguideId = z.string().regex(/^[A-Z]\d{6}$/, "bioguide id");
/** Bioguide identifier, e.g. `"R000575"`. The sole canonical join key. */
export type BioguideId = z.infer<typeof bioguideId>;
export const congressNumber = z.number().int().gte(1).lte(200);
export const chamber = z.enum(["house", "senate"]);
export type Chamber = z.infer<typeof chamber>;

/**
 * A committee's own identifier — the THOMAS id from
 * `@unitedstates/congress-legislators` (`HSJU`, `SSFI`, `JSEC`). This is a
 * *committee* key, not a person key, so it doesn't touch the "`bioguide_id` is
 * the only person identifier" rule in DATA_CONVENTIONS §1 — the field is named
 * `committee_id` rather than `thomas_id` to keep that language clean.
 */
export const committeeId = z.string().regex(/^[A-Z0-9]{4}$/, "committee id");
export type CommitteeId = z.infer<typeof committeeId>;

const nominateCoord = z.number().gte(-1).lte(1).nullable();

/** icpsr -> bioguide_id. `source` records which dataset supplied the link. */
export const idCrosswalkEntry = z.strictObject({
  icpsr: z.number().int().positive(),
  bioguide_id: bioguideId,
  source: z.enum(["congress-legislators", "voteview"]),
});
export type IdCrosswalkEntry = z.infer<typeof idCrosswalkEntry>;

/** Stable identity — nothing that varies by Congress or year. */
export const legislator = z.strictObject({
  bioguide_id: bioguideId,
  name: z.strictObject({
    first: z.string().min(1),
    last: z.string().min(1),
    middle: z.string().min(1).optional(),
    nickname: z.string().min(1).optional(),
    suffix: z.string().min(1).optional(),
    official_full: z.string().min(1).optional(),
  }),
  birth_year: z.number().int().gte(1700).lte(2100).optional(),
  /** Full date of birth (`YYYY-MM-DD`) where the source has one; `birth_year` is its year. */
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  gender: z.enum(["M", "F"]),
});
export type Legislator = z.infer<typeof legislator>;

/** A mid-Congress party change carried through from congress-legislators. */
const partyAffiliation = z.strictObject({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  party: z.string().min(1),
  caucus: z.string().min(1).optional(),
});

/**
 * One row per (legislator, Congress, chamber) served. `party` is the member's
 * registration (e.g. "Independent"); `caucus` is which conference they sit with
 * (e.g. "Democrat") and defaults to `party`. Group/color features should use
 * `caucus`; features that treat Independent as its own category read `party`.
 */
export const term = z.strictObject({
  bioguide_id: bioguideId,
  congress_number: congressNumber,
  chamber,
  state: z.string().min(2).max(2),
  /** House only; `null` for at-large seats and all Senate terms. */
  district: z.number().int().positive().nullable(),
  /** `null` only for a handful of pre-1820 terms with no recorded party. */
  party: z.string().min(1).nullable(),
  caucus: z.string().min(1).nullable(),
  /** Present only when the member changed affiliation during the Congress. */
  party_affiliations: z.array(partyAffiliation).min(2).optional(),
});
export type Term = z.infer<typeof term>;

/**
 * One row per (legislator, Congress, chamber) from Voteview.
 * `nominate_*` is the static career score (identical across a member's
 * Congresses); `nokken_poole_*` is recomputed per Congress. Never conflate the
 * two — see DATA_CONVENTIONS.md §3. `null` where Voteview has no estimate.
 */
export const ideologyScore = z.strictObject({
  bioguide_id: bioguideId,
  congress_number: congressNumber,
  chamber,
  nominate_dim1: nominateCoord,
  nominate_dim2: nominateCoord,
  nokken_poole_dim1: nominateCoord,
  nokken_poole_dim2: nominateCoord,
  /**
   * Roll-call votes cast that Congress+chamber (Voteview
   * `nominate_number_of_votes`). Disambiguates "who actually represented a
   * seat" when a Congress has >2 senators for a state (mid-term appointments).
   */
  n_votes: z.number().int().nonnegative().nullable(),
  /**
   * Voteview `party_code` for this member-Congress — its own party attribution,
   * kept so historical third parties (Federalist, Whig, Democrat-Republican, …)
   * can be coloured distinctly on the main-page charts. See lib/party-palette.ts.
   */
  party_code: z.number().int(),
});
export type IdeologyScore = z.infer<typeof ideologyScore>;

/**
 * One row per standing committee (House, Senate, or joint) of the current
 * Congress. Subcommittees are deliberately not emitted (see the committees
 * session notes / ARCHITECTURE_MAP.md). Source: `committees-current.yaml`.
 *
 * `short_name` is the marquee form used on charts and in the URL slug
 * ("Judiciary", "Ways and Means", "Joint Economic") — derived from `name`, kept
 * here because it's a stable fact about the committee, not a join.
 */
export const committee = z.strictObject({
  committee_id: committeeId,
  name: z.string().min(1),
  short_name: z.string().min(1),
  chamber: z.enum(["house", "senate", "joint"]),
});
export type Committee = z.infer<typeof committee>;

export const committeeRole = z.enum(["chair", "ranking_member", "member"]);
export type CommitteeRole = z.infer<typeof committeeRole>;

/**
 * One row per (legislator, committee) for the current Congress — the source
 * file is committee→members, inverted here to member-keyed so a member's
 * committees are a plain filter (DATA_CONVENTIONS §1: everything in `output/`
 * is `bioguide_id`-keyed). No `congress_number` column: this file only ever
 * describes the current Congress. Source: `committee-membership-current.yaml`.
 */
export const committeeMembership = z.strictObject({
  bioguide_id: bioguideId,
  committee_id: committeeId,
  /** Majority / minority side of the committee, from the source file. */
  party: z.enum(["majority", "minority"]),
  /** Normalised from the source `title`; `member` covers vice-chairs, ex
   *  officio, and untitled seats. */
  role: committeeRole,
  /** Seat order within the member's party on the committee (source `rank`). */
  rank: z.number().int().positive(),
});
export type CommitteeMembership = z.infer<typeof committeeMembership>;

/**
 * A subcommittee's own identifier — the parent's 4-char THOMAS id plus the
 * subcommittee's own 2-digit THOMAS id from `committees-current.yaml`
 * (`HSAG15`, `SSAF13`). Unique globally, not just within its parent.
 */
export const subcommitteeId = z.string().regex(/^[A-Z0-9]{4}\d{2}$/, "subcommittee id");
export type SubcommitteeId = z.infer<typeof subcommitteeId>;

/**
 * One row per subcommittee of the current Congress. Mirrors `committee`
 * (same `chamber` values, inherited from the parent) with a `parent_committee_id`
 * join back to it. No `short_name`: unlike a top-level committee's name, a
 * subcommittee's raw `name` carries no "Committee on..." boilerplate to strip.
 * Deliberately no blended-position field — see the committees session notes:
 * most subcommittees are too small for a mean to be a meaningful signal.
 * Source: `committees-current.yaml`'s `subcommittees[]`.
 */
export const subcommittee = z.strictObject({
  subcommittee_id: subcommitteeId,
  parent_committee_id: committeeId,
  name: z.string().min(1),
  chamber: z.enum(["house", "senate", "joint"]),
});
export type Subcommittee = z.infer<typeof subcommittee>;

/**
 * One row per (legislator, subcommittee) for the current Congress — the
 * subcommittee-grain analogue of `committeeMembership`, same shape and same
 * inversion-to-member-keyed rationale (DATA_CONVENTIONS §1). Source:
 * `committee-membership-current.yaml`, rows keyed `<parent><digits>`.
 */
export const subcommitteeMembership = z.strictObject({
  bioguide_id: bioguideId,
  subcommittee_id: subcommitteeId,
  party: z.enum(["majority", "minority"]),
  role: committeeRole,
  rank: z.number().int().positive(),
});
export type SubcommitteeMembership = z.infer<typeof subcommitteeMembership>;

/**
 * One row per (legislator, reporting year) — House Clerk (`house_clerk`) and
 * Senate eFD (`senate_efd`) annual financial disclosures. Produced by the
 * Python sidecar in `pipeline/financial_disclosures/` (its own dependency-free
 * structural check is `pipeline/financial_disclosures/schema.py`; this is the
 * Zod-side validation at the app's read boundary — DATA_CONVENTIONS §4).
 *
 * `year` is the year the report COVERS, already converted from filing year —
 * never derive a display year from `filing_date`. `assets_total`,
 * `liabilities_total` and `net_worth` are sums of EIGA band midpoints (the
 * open-ended top band contributes its floor as a point estimate — see
 * `pipeline/financial_disclosures/bands.py`). `asset_band_counts` /
 * `liability_band_counts` are counts of filed band *labels*, not individual
 * line-item values — there are no item names or per-item dollar amounts in
 * this file (that's Session 5's line-item output). See
 * `docs/NET_WORTH_METHODOLOGY.md` for how `lib/wealth-data.ts` turns this into
 * a range (`lib/wealth-bands.ts`) and a "usable row" filter.
 */
export const financialDisclosure = z.strictObject({
  bioguide_id: bioguideId,
  year: z.number().int().gte(2000).lte(2100),
  chamber,
  assets_total: z.number().nullable(),
  liabilities_total: z.number().nullable(),
  net_worth: z.number().nullable(),
  has_open_ended_asset: z.boolean().nullable(),
  asset_line_count: z.number().int().nullable(),
  liability_line_count: z.number().int().nullable(),
  asset_band_counts: z.record(z.string(), z.number().int()),
  liability_band_counts: z.record(z.string(), z.number().int()),
  source_system: z.enum(["house_clerk", "senate_efd"]),
  source_doc_id: z.string().nullable(),
  filing_type: z.string().nullable(),
  filing_date: z.string().nullable(),
  extraction_method: z.enum([
    "digital_text",
    "ocr",
    "manual",
    "checkbox_grid",
  ]),
  parse_confidence: z
    .enum([
      "high",
      "low",
      "unparseable_scanned",
      "no_filing_found",
      "download_failed",
      "ocr_low_confidence",
      "ocr_skipped_oversized",
      "no_schedule_content_found",
    ])
    .nullable(),
  needs_review: z.boolean(),
  extra_note: z.string().optional(),
});
export type FinancialDisclosure = z.infer<typeof financialDisclosure>;

/**
 * One row per (legislator, reporting year) that reconciled at item grain —
 * the Session 5 sibling to `financialDisclosure`, keyed the same way
 * (`bioguide_id` + `year`) but holding the verbatim per-asset/per-liability
 * lines instead of just band counts. Produced by
 * `pipeline/financial_disclosures/build_line_items.py`, sharded to
 * `pipeline/output/line-items/<year>.json` (its own dependency-free
 * structural check is `pipeline/financial_disclosures/line_item_schema.py`).
 *
 * Only emitted for a filing whose freshly re-extracted item band multiset
 * *exactly* reproduces that same filing's already-trusted
 * `asset_band_counts`/`liability_band_counts` in `financial_disclosures.json`
 * — a filing that doesn't reconcile has no row here at all (excluded, not
 * partially emitted; see the run's own `_report.json` for exclusion counts).
 * Only high-confidence, non-scanned, digital-text filings are considered —
 * scanned/paper filings are out of scope for this extraction.
 *
 * `lo`/`hi` are the item's own EIGA band range (`hi: null` for an
 * open-ended top band, mirroring `lib/wealth-bands.ts`'s policy restated in
 * `pipeline/financial_disclosures/line_item_bands.py`) — not a sum or
 * midpoint. `owner`/`form_type` are `null` when the source form has no such
 * column (House Schedule A has no per-item type column; Senate's HTML table
 * always does). `description` is the verbatim, whitespace-normalized text
 * from the form — it can include an account/institution name, which is not
 * itself a personal identifier but is exactly what the source document
 * reports.
 */
export const disclosureLineItem = z.strictObject({
  bioguide_id: bioguideId,
  year: z.number().int().gte(2000).lte(2100),
  chamber,
  source_system: z.enum(["house_clerk", "senate_efd"]),
  source_doc_id: z.string().nullable(),
  items: z.array(
    z.strictObject({
      kind: z.enum(["asset", "liability"]),
      description: z.string(),
      band_label: z.string(),
      lo: z.number().nullable(),
      hi: z.number().nullable(),
      owner: z.string().nullable(),
      form_type: z.string().nullable(),
    }),
  ),
});
export type DisclosureLineItem = z.infer<typeof disclosureLineItem>;
