import { z } from "zod";

/**
 * The executive-orders track's entities (`pipeline/output/executive_orders.json`,
 * `administrations.json`, and the committed classification cache
 * `pipeline/classification/eo_topics.json`). A separate data track from
 * Congress — nothing here joins to `bioguide_id`. See `docs/DATA_CONVENTIONS.md`
 * ("Executive orders track").
 *
 *   executive_orders.json  one row per executive order   eo_number
 *   administrations.json   one row per uninterrupted tenure   term_id
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date");

/**
 * The Federal Register's executive order number (`executive_order_number`).
 * A natural key for this track — NOT a `bioguide_id`, and not a person key.
 */
export const eoNumber = z.number().int().gte(12000).lte(99999);
/** A reference to any EO, including pre-1994 ones outside the data (an amended order from 1960 is fine). */
export const eoRef = z.number().int().positive().lte(99999);

/**
 * Primary topic, in the fixed order the stacked chart draws them (bottom to
 * top). One primary topic per EO so the stacks sum to the true total.
 */
export const EO_TOPICS = [
  "government_operations",
  "economy_labor",
  "trade",
  "energy_environment",
  "health_education",
  "immigration_justice",
  "foreign_policy",
  "national_security",
  "civil_rights_civic",
] as const;
export const eoTopic = z.enum(EO_TOPICS);
export type EoTopic = z.infer<typeof eoTopic>;

export const EO_TOPIC_LABELS: Record<EoTopic, string> = {
  government_operations: "Government operations",
  economy_labor: "Economy, labor & technology",
  trade: "Trade & tariffs",
  energy_environment: "Energy & environment",
  health_education: "Health & education",
  immigration_justice: "Immigration & justice",
  foreign_policy: "Foreign policy",
  national_security: "National security & defense",
  civil_rights_civic: "Civil rights & civic life",
};

export const eoTopicMethod = z.enum(["parent-inherit", "model", "manual"]);
export type EoTopicMethod = z.infer<typeof eoTopicMethod>;

/** One uninterrupted tenure. `term_id` is the inauguration date. */
export const administration = z.strictObject({
  term_id: isoDate,
  president: z.string().min(1),
  /** The Federal Register's `president.identifier`, used to cross-check every EO. */
  president_slug: z.string().min(1),
  party: z.enum(["Democratic", "Republican"]),
  start: isoDate,
  /** Last day in office (the day before the next inauguration); null while in office. */
  end: isoDate.nullable(),
});
export type Administration = z.infer<typeof administration>;

export const executiveOrder = z.strictObject({
  eo_number: eoNumber,
  document_number: z.string().min(1),
  title: z.string().min(1),
  abstract: z.string().nullable(),
  /** Calendar year of the chart is taken from this, never from publication_date. */
  signing_date: isoDate,
  publication_date: isoDate,
  term_id: isoDate,
  agencies: z.array(z.string()),
  /** EOs this order amends (or revokes/supersedes in part). Parsed from the Federal Register notes. */
  amends: z.array(eoRef),
  /** EOs this order revokes or supersedes in full. */
  revokes: z.array(eoRef),
  topic: eoTopic,
  topic_method: eoTopicMethod,
  needs_review: z.boolean(),
});
export type ExecutiveOrder = z.infer<typeof executiveOrder>;

/** One entry of `pipeline/classification/eo_topics.json`, keyed by `eo_number`. */
export const eoTopicCacheEntry = z.strictObject({
  eo_number: eoNumber,
  topic: eoTopic,
  topic_method: eoTopicMethod,
  /** For `parent-inherit`: the EO whose topic was inherited. */
  parent: eoNumber.optional(),
  needs_review: z.boolean(),
});
export type EoTopicCacheEntry = z.infer<typeof eoTopicCacheEntry>;

/** The Federal Register API row, as requested by `pipeline/fetch/executive-orders.ts`. */
export const rawExecutiveOrder = z.object({
  executive_order_number: z.string().regex(/^\d+$/).nullable(),
  document_number: z.string().min(1),
  title: z.string().min(1),
  abstract: z.string().nullable(),
  signing_date: isoDate,
  publication_date: isoDate,
  president: z.object({ identifier: z.string().min(1), name: z.string().min(1) }),
  agencies: z.array(z.object({ name: z.string().nullable().optional(), raw_name: z.string() }).passthrough()),
  executive_order_notes: z.string().nullable(),
  html_url: z.string().url(),
  pdf_url: z.string().url().nullable(),
  citation: z.string().nullable(),
});
export type RawExecutiveOrder = z.infer<typeof rawExecutiveOrder>;
