import { z } from "zod";

/**
 * Schemas for the raw source files, matching their actual shape (verified
 * against the committed snapshots in pipeline/raw/).
 *
 * `looseObject` keeps unknown columns rather than erroring — Voteview and
 * congress-legislators both add fields over time and that should not break the
 * pipeline. The fields we name are the ones the transform depends on.
 */

const BIOGUIDE = /^[A-Z]\d{6}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A CSV cell holding a DW-NOMINATE coordinate: "" (absent) or a float in [-1, 1]. */
const nominateCell = z.string().transform((raw, ctx): number | null => {
  const s = raw.trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) {
    ctx.addIssue({ code: "custom", message: `not a number: ${JSON.stringify(raw)}` });
    return z.NEVER;
  }
  if (n < -1 || n > 1) {
    ctx.addIssue({
      code: "custom",
      message: `DW-NOMINATE coordinate outside [-1, 1]: ${n}`,
    });
    return z.NEVER;
  }
  return n;
});

/** A CSV cell holding an optional finite number ("" -> null). */
const numberCell = z.string().transform((raw, ctx): number | null => {
  const s = raw.trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) {
    ctx.addIssue({ code: "custom", message: `not a number: ${JSON.stringify(raw)}` });
    return z.NEVER;
  }
  return n;
});

/** A CSV cell holding a year, sometimes formatted "1958.0" ("" -> null). */
const yearCell = z.string().transform((raw, ctx): number | null => {
  const s = raw.trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isInteger(n) && !Number.isInteger(Math.round(n))) {
    ctx.addIssue({ code: "custom", message: `not a year: ${JSON.stringify(raw)}` });
    return z.NEVER;
  }
  return Math.round(n);
});

export const CHAMBERS = ["House", "Senate", "President"] as const;

/** One row of Voteview `HSall_members.csv`. */
export const voteviewMemberRow = z.looseObject({
  congress: z.coerce.number().int().positive(),
  chamber: z.enum(CHAMBERS),
  icpsr: z.coerce.number().int().positive(),
  district_code: z.coerce.number().int().nonnegative(),
  state_abbrev: z.string().min(2).max(3),
  party_code: z.coerce.number().int(),
  bioname: z.string().min(1),
  bioguide_id: z.union([z.string().regex(BIOGUIDE), z.literal("")]),
  born: yearCell,
  died: yearCell,
  nominate_dim1: nominateCell,
  nominate_dim2: nominateCell,
  nokken_poole_dim1: nominateCell,
  nokken_poole_dim2: nominateCell,
  nominate_number_of_votes: numberCell,
});
export type VoteviewMemberRow = z.infer<typeof voteviewMemberRow>;

/** One row of Voteview `HSall_parties.csv`. */
export const voteviewPartyRow = z.looseObject({
  congress: z.coerce.number().int().positive(),
  chamber: z.enum(CHAMBERS),
  party_code: z.coerce.number().int(),
  party_name: z.string().min(1),
  n_members: z.coerce.number().int().nonnegative(),
});
export type VoteviewPartyRow = z.infer<typeof voteviewPartyRow>;

const isoDate = z.string().regex(ISO_DATE, "expected an ISO date (YYYY-MM-DD)");

/** A mid-term party change, from a term's `party_affiliations` array. */
const partyAffiliation = z.looseObject({
  start: isoDate,
  end: isoDate,
  party: z.string().min(1),
  caucus: z.string().min(1).optional(),
});

/** One `terms[]` entry of a legislator. */
export const legislatorTerm = z.looseObject({
  type: z.enum(["rep", "sen"]),
  start: isoDate,
  end: isoDate,
  state: z.string().min(2),
  // House terms only. congress-legislators uses -1 and 0 both for at-large;
  // 1..53 for a numbered district.
  district: z.coerce.number().int().gte(-1).optional(),
  // Senate class (1, 2, or 3), present for Senate terms.
  class: z.coerce.number().int().gte(1).lte(3).optional(),
  party: z.string().min(1).optional(),
  caucus: z.string().min(1).optional(),
  party_affiliations: z.array(partyAffiliation).min(1).optional(),
});
export type LegislatorTerm = z.infer<typeof legislatorTerm>;

/** One entry of `legislators-current.yaml` / `legislators-historical.yaml`. */
export const legislator = z.looseObject({
  id: z.looseObject({
    bioguide: z.string().regex(BIOGUIDE),
    // Single integer in practice; array tolerated per DATA_CONVENTIONS §1.
    icpsr: z.union([z.number().int(), z.array(z.number().int()).min(1)]).optional(),
  }),
  name: z.looseObject({
    first: z.string().min(1),
    last: z.string().min(1),
    middle: z.string().optional(),
    nickname: z.string().optional(),
    suffix: z.string().optional(),
    official_full: z.string().optional(),
  }),
  bio: z.looseObject({
    birthday: isoDate.optional(),
    gender: z.enum(["M", "F"]),
  }),
  terms: z.array(legislatorTerm).min(1),
});
export type Legislator = z.infer<typeof legislator>;
