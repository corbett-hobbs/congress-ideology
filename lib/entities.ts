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
