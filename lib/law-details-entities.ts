import { z } from "zod";
import { LAWS_FIRST_CONGRESS } from "./laws-entities";

/**
 * The per-law detail shards behind the individual law pages (`/congress/laws/[law_id]/[name_slug]`):
 * `pipeline/output/law_details/<congress>.json`, one file per Congress, keyed by `law_id`. A shard carries only what
 * `laws.json`, `laws_cosponsors.json` and `laws_committees.json` do not already hold: the CRS summary and the action
 * list. The sponsor, cosponsors, committees, passage votes and the signing president are joined from those files (and
 * the signer derived from the date) when the page is built. Methodology: `docs/LAWS_METHODOLOGY.md`; conventions:
 * `docs/DATA_CONVENTIONS.md` section 15.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const int = z.number().int();

/** Raw action types in the order their code is stored: `LAW_ACTION_TYPES[code]`. */
export const LAW_ACTION_TYPES = ["Floor", "ResolvingDifferences", "President", "BecameLaw", "Veto", "NotUsed"] as const;
export type LawActionType = (typeof LAW_ACTION_TYPES)[number];

/** A roll call attached to an action: `[chamber (0 House, 1 Senate), roll number, session or null]`. */
export const lawActionVote = z.tuple([z.union([z.literal(0), z.literal(1)]), int, int.nullable()]);
export type LawActionVote = z.infer<typeof lawActionVote>;

/** `[date, type code, text, roll calls?]`, oldest first. */
export const lawAction = z.union([
  z.tuple([isoDate, int.min(0).max(LAW_ACTION_TYPES.length - 1), z.string().min(1)]),
  z.tuple([isoDate, int.min(0).max(LAW_ACTION_TYPES.length - 1), z.string().min(1), z.array(lawActionVote).min(1)]),
]);
export type LawAction = z.infer<typeof lawAction>;

export const lawDetail = z.object({
  /** The CRS summary as plain paragraphs (HTML stripped); null when the law has none. */
  summary: z.array(z.string().min(1)).nullable(),
  /** True when the raw summary hit the fetchers' length cap, so the paragraphs stop short of the full text. */
  cut: z.literal(true).optional(),
  actions: z.array(lawAction),
});
export type LawDetail = z.infer<typeof lawDetail>;

export const lawDetailsShard = z.object({
  congress: int.min(LAWS_FIRST_CONGRESS),
  laws: z.record(z.string().regex(/^\d+-pub-\d+$/), lawDetail),
});
export type LawDetailsShard = z.infer<typeof lawDetailsShard>;
