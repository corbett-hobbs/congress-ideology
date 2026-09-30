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

/** Stable identity only — nothing that varies by term. */
export const justice = z.strictObject({
  justice_id: justiceId,
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
  appointing_party: z.enum(["Democratic", "Republican"]),
  nomination_date: isoDate.nullable(),
  confirmation_date: isoDate.nullable(),
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
