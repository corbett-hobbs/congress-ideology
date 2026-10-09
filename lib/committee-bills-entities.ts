import { z } from "zod";
import { BILL_TYPES, billType, rawCommittee, chamber } from "./laws-entities";

/**
 * The committee-legislation track: every House and Senate bill and joint resolution of the current Congress, as the
 * committees it was referred to (and what each did with it) record it. One shard per committee, keyed by `committee_id`
 * (the THOMAS id, `HSJU`). Not a `bioguide_id` or `law_id` track: the sponsor is a column, the law number a field.
 * Methodology: `docs/COMMITTEE_BILLS_METHODOLOGY.md`; conventions: `docs/DATA_CONVENTIONS.md` section 16.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const int = z.number().int().min(0);

export class CommitteeBillsDataError extends Error {
  constructor(message: string) {
    super(`committee-bills: ${message}`);
    this.name = "CommitteeBillsDataError";
  }
}

// ---- raw: one digest per bill, from GovInfo Bill Status ----------------------------------------------------------

/** An action the stage logic reads: a committee action that says "mark-up" or "ordered to be reported", the calendar, a passage, a veto. */
export const rawBillAction = z.object({
  date: isoDate,
  type: z.string(),
  /** Kept only for committee actions and passages (the vote tally and the "Passed/agreed to in House" wording); else "". */
  text: z.string(),
  /** `systemCode`s (lower case) of the committees the action names. */
  committees: z.array(z.string()),
});
export type RawBillAction = z.infer<typeof rawBillAction>;

export const rawBill = z.object({
  type: billType,
  number: z.string().regex(/^\d+$/),
  title: z.string(),
  introduced: isoDate.nullable(),
  origin_chamber: chamber.nullable(),
  /** Sponsor as the source prints them (`Rep. Bergman, Jack [R-MI-1]`), with the bioguide id. */
  sponsor: z.object({ id: z.string().regex(/^[A-Z]\d{6}$/), name: z.string() }).nullable(),
  /** Current (not withdrawn) cosponsors by the party the source gives each: `[D, R, any other]`. */
  cosponsors: z.tuple([int, int, int]),
  policy_area: z.string().nullable(),
  committees: z.array(rawCommittee),
  actions: z.array(rawBillAction),
  /** Public law numbers (`119-23`) the bill carries. */
  laws: z.array(z.string().regex(/^\d+-\d+$/)),
  /** Committee report citations (`H. Rept. 119-789`). */
  reports: z.array(z.string()),
  cbo_estimates: int,
  latest_action: z.object({ date: isoDate, text: z.string() }).nullable(),
  updated: isoDate.nullable(),
});
export type RawBill = z.infer<typeof rawBill>;

export const rawBillsFile = z.object({
  source: z.literal("govinfo-billstatus"),
  congress: int.min(108),
  fetched: isoDate,
  bills: z.array(rawBill),
});
export type RawBillsFile = z.infer<typeof rawBillsFile>;

// ---- output: one shard per committee -----------------------------------------------------------------------------

/**
 * One bill as one committee holds it. Keys are terse because a committee can hold two thousand rows (gzip does the rest);
 * absent = nothing recorded. Dates are `YYYY-MM-DD`.
 *   b bill type (`hr`, `s`, `hjres`, `sjres`) · n number · t title · i introduced · s index into the shard's `sponsors` (absent = none)
 *   c cosponsors `[D, R, other]` (absent = none) · a index into `areas` (absent = no policy area)
 *   r referred to this committee · h first hearing · m first markup, or "ordered to be reported" · p reported · d discharged
 *   k placed on a calendar (only after p or d) · u indexes into `subs` the bill was referred to or acted on in
 *   x number of other committees it was also referred to · g first passage `[House, Senate]` (bill-level, not the committee's; null = not passed)
 *   l public law (`119-23`) · w the day it became law · v 1 = vetoed · q how the committee ordered it reported: `[yea, nay]`, `voice` or `unanimous` · o CBO estimates on file
 *   e committee report citations · z latest action `[date, text]` (only kept once a bill has moved past referral)
 */
export const committeeBillRow = z.object({
  b: billType,
  n: z.string().regex(/^\d+$/),
  t: z.string(),
  i: isoDate,
  s: int.optional(),
  c: z.tuple([int, int, int]).optional(),
  a: int.optional(),
  r: isoDate,
  h: isoDate.optional(),
  m: isoDate.optional(),
  p: isoDate.optional(),
  d: isoDate.optional(),
  k: isoDate.optional(),
  u: z.array(int).optional(),
  x: int.optional(),
  g: z.tuple([isoDate.nullable(), isoDate.nullable()]).optional(),
  l: z.string().optional(),
  w: isoDate.optional(),
  v: z.literal(1).optional(),
  q: z.union([z.tuple([int, int]), z.enum(["voice", "unanimous"])]).optional(),
  o: int.optional(),
  e: z.array(z.string()).optional(),
  z: z.tuple([isoDate, z.string()]).optional(),
});
export type CommitteeBillRow = z.infer<typeof committeeBillRow>;

/** A sponsor as the shard shows them: id, `Bergman, Jack`, party letter, `MI-1` ("" for a delegate-less place). */
export const billSponsor = z.tuple([z.string(), z.string(), z.string(), z.string()]);
export type BillSponsor = z.infer<typeof billSponsor>;

export const committeeBillsShard = z.object({
  committee_id: z.string().regex(/^[A-Z]{4}$/),
  congress: int.min(108),
  /** `House` / `Senate` / `Joint`: which chamber's passage counts as "passed the chamber". */
  chamber: z.enum(["house", "senate", "joint"]),
  /** Policy areas used, in the order `a` indexes. */
  areas: z.array(z.string()),
  /** Subcommittees used (`id`, short name), in the order `u` indexes. */
  subs: z.array(z.object({ id: z.string(), name: z.string() })),
  sponsors: z.array(billSponsor),
  /** Newest referral first. */
  rows: z.array(committeeBillRow),
});
export type CommitteeBillsShard = z.infer<typeof committeeBillsShard>;

export const committeeBillsMeta = z.object({
  congress: int.min(108),
  /** Latest dated event in the data (a referral, report, passage ...): "through" in the page copy. */
  data_through: isoDate,
  bills: int,
  /** Bill-committee pairs written (a bill referred to three committees counts three times). */
  rows: int,
  /** Rows per committee id; the page shows the card only for a committee listed here. */
  committees: z.record(z.string(), int),
});
export type CommitteeBillsMeta = z.infer<typeof committeeBillsMeta>;

export { BILL_TYPES };
