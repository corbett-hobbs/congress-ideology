import { z } from "zod";

/**
 * Placeholder schemas for the raw source shapes.
 *
 * Deliberately minimal for now — enough to prove the pattern (fetched data is
 * schema-checked before any transform reads it, and a bad row fails loudly with
 * a specific error). Session 2 tightens these as the transforms take shape.
 */

const BIOGUIDE = /^[A-Z]\d{6}$/;

/** CSV cells are always strings; "" means absent for a numeric column. */
const numericCell = z
  .string()
  .transform((s) => (s.trim() === "" ? undefined : Number(s)))
  .pipe(z.number().finite().optional());

/** One row of Voteview `HSall_members.csv`. */
export const voteviewMemberRow = z.looseObject({
  congress: z.coerce.number().int().positive(),
  chamber: z.enum(["House", "Senate", "President"]),
  icpsr: z.coerce.number().int().positive(),
  state_abbrev: z.string().min(2).max(3),
  bioname: z.string().min(1),
  bioguide_id: z.union([z.string().regex(BIOGUIDE), z.literal("")]),
  nominate_dim1: numericCell,
  nominate_dim2: numericCell,
  nokken_poole_dim1: numericCell,
  nokken_poole_dim2: numericCell,
});
export type VoteviewMemberRow = z.infer<typeof voteviewMemberRow>;

/** One row of Voteview `HSall_parties.csv`. */
export const voteviewPartyRow = z.looseObject({
  congress: z.coerce.number().int().positive(),
  chamber: z.enum(["House", "Senate", "President"]),
  party_code: z.string().min(1),
  party_name: z.string().min(1),
  n_members: z.coerce.number().int().nonnegative(),
});
export type VoteviewPartyRow = z.infer<typeof voteviewPartyRow>;

/** One entry of `legislators-current.yaml` / `legislators-historical.yaml`. */
export const legislator = z.looseObject({
  id: z.looseObject({
    bioguide: z.string().regex(BIOGUIDE),
    // Usually a single integer; occasionally a list in the historical file.
    icpsr: z.union([z.number().int(), z.array(z.number().int())]).optional(),
  }),
  name: z.looseObject({
    first: z.string().min(1),
    last: z.string().min(1),
    official_full: z.string().optional(),
  }),
});
export type Legislator = z.infer<typeof legislator>;
