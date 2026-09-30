import { z } from "zod";

/**
 * The Supreme Court track's normalized entities (`pipeline/output/court/`).
 * A separate data track from Congress — nothing here joins to `bioguide_id`
 * entities. Field names are the serialized `snake_case` form. See
 * `docs/DATA_CONVENTIONS.md` ("Supreme Court track").
 *
 *   justices.json                  one row per person            justice_id
 *   mq_scores.json                 (justice x term)              justice_id + term
 *   court_terms.json               (term[, segment])             term + segment
 *   court_median_probabilities.json (term[, segment] x justice)  term + segment + justice_id
 */

/**
 * SCDB's numeric `justice` identifier (e.g. 108 = Clarence Thomas). One person
 * = one id: a justice who changed roles (Stone, Rehnquist) keeps a single id.
 * A deliberate exception to "no second person-id convention" — justices have no
 * bioguide id. See DATA_CONVENTIONS "Supreme Court track".
 */
export const justiceId = z.number().int().positive();
export type JusticeId = z.infer<typeof justiceId>;

/** October Term start year: 2024 = OT2024 (Oct 2024 - Jun 2025). */
export const courtTerm = z.number().int().gte(1937).lte(2200);
/** `a`/`b` mark the separate records MQ publishes for some mid-term-turnover terms; null otherwise. */
export const termSegment = z.enum(["a", "b"]).nullable();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date");
const score = z.number().finite();

const partyEnum = z.enum(["Democratic", "Republican"]);

/** The appointment (or elevation) to Chief Justice. */
export const chiefJusticeAppointment = z.strictObject({
  president: z.string().min(1),
  party: partyEnum,
  nomination_date: isoDate.nullable(),
  confirmation_date: isoDate.nullable(),
  /** Date the justice began serving as Chief Justice. */
  start_date: isoDate,
});
export type ChiefJusticeAppointment = z.infer<typeof chiefJusticeAppointment>;

export const senateVote = z.strictObject({
  ayes: z.number().int().gte(0),
  nays: z.number().int().gte(0),
});
export type SenateVote = z.infer<typeof senateVote>;

/** Stable identity only — nothing that varies by term. */
export const justice = z.strictObject({
  justice_id: justiceId,
  /** Federal Judicial Center judge id (`nid`) — the bio-source key; `justice_id` stays the page key. */
  fjc_nid: z.number().int().positive(),
  name: z.strictObject({
    first: z.string().min(1),
    middle: z.string().min(1).optional(),
    last: z.string().min(1),
    suffix: z.string().min(1).optional(),
    full: z.string().min(1),
  }),
  birth_year: z.number().int().gte(1700).lte(2100),
  death_year: z.number().int().gte(1700).lte(2200).nullable(),
  /** Appointment in effect at the justice's first scored term (Stone: Coolidge, not FDR's Chief appointment). */
  appointing_president: z.string().min(1),
  appointing_party: partyEnum,
  nomination_date: isoDate.nullable(),
  confirmation_date: isoDate.nullable(),
  /** Roll-call Senate vote on that same appointment; null = voice vote or none recorded. */
  senate_vote: senateVote.nullable(),
  /** Day that appointment's service began (earliest of recess and commission date). */
  appointment_start: isoDate,
  /**
   * Set for every justice who served as Chief Justice (Hughes, Stone, Vinson,
   * Warren, Burger, Rehnquist, Roberts), else null. For those appointed
   * straight to Chief it repeats the appointing_* fields; for Stone and
   * Rehnquist it is the later elevation by a different president.
   */
  chief_justice_appointment: chiefJusticeAppointment.nullable(),
  /** First day on the Court across all appointments (earliest recess/commission). */
  service_start: isoDate,
  /** Last day of active service (senior status or termination); null = still serving. */
  service_end: isoDate.nullable(),
});
export type Justice = z.infer<typeof justice>;

/** Martin-Quinn posterior summaries. One-dimensional; NOT on the DW-NOMINATE scale. Negative = liberal. */
export const mqScore = z
  .strictObject({
    justice_id: justiceId,
    term: courtTerm,
    mq_score: score,
    mq_sd: score.positive(),
    mq_median: score,
    mq_lo95: score,
    mq_hi95: score,
  })
  .refine((r) => r.mq_lo95 <= r.mq_score && r.mq_score <= r.mq_hi95, {
    message: "mq_lo95 <= mq_score <= mq_hi95 violated",
  });
export type MqScore = z.infer<typeof mqScore>;

export const courtTermRow = z
  .strictObject({
    term: courtTerm,
    segment: termSegment,
    median_score: score,
    median_sd: score.positive(),
    min_score: score,
    max_score: score,
    median_justice_id: justiceId,
    median_justice_probability: z.number().gte(0).lte(1),
  })
  .refine((r) => r.min_score <= r.median_score && r.median_score <= r.max_score, {
    message: "min_score <= median_score <= max_score violated",
  });
export type CourtTermRow = z.infer<typeof courtTermRow>;

export const courtMedianProbability = z.strictObject({
  term: courtTerm,
  segment: termSegment,
  justice_id: justiceId,
  probability: z.number().gte(0).lte(1),
});
export type CourtMedianProbability = z.infer<typeof courtMedianProbability>;

/** Hand-reviewed table joining an MQ/SCDB justice to an FJC bio record. */
export const justiceCrosswalkEntry = z.strictObject({
  justice_id: justiceId,
  scdb_name: z.string().min(1),
  last_name: z.string().min(1),
  fjc_nid: z.number().int().positive(),
});
export type JusticeCrosswalkEntry = z.infer<typeof justiceCrosswalkEntry>;

/**
 * A justice's Wikipedia lead and (when its license allows) portrait. Written by
 * `pipeline/fetch/justice-bios.ts` — not by the transform — to
 * `pipeline/output/court/justice_bios.json`, one row per matched justice. A
 * justice with no safe match has NO row (the page omits the bio block).
 */
export const justiceBio = z.strictObject({
  justice_id: justiceId,
  title: z.string().min(1),
  extract: z.string().min(1),
  url: z.string().regex(/^https:\/\/en\.wikipedia\.org\/wiki\/\S+$/),
  revision: z.string().regex(/^\d+$/),
  fetched_at: isoDate,
  needs_review: z.boolean(),
  /** Portrait, present only when Commons license metadata says public domain / CC0. */
  photo: z
    .strictObject({
      /** Path under `public/`, e.g. `/images/justices/103.jpg`. */
      path: z.string().regex(/^\/images\/justices\/\d+\.(jpg|png)$/),
      source_url: z.string().url(),
      license: z.string().min(1),
    })
    .nullable(),
});
export type JusticeBio = z.infer<typeof justiceBio>;
