import { z } from "zod";

/**
 * Schemas for the foreign-assistance track (ForeignAssistance.gov). See docs/FOREIGN_AID_METHODOLOGY.md.
 * The join key to the trade track is `country_key` = `countries.json`'s `country_code`.
 */

/** First fiscal year the source's sector-level data covers (the by-country file reaches 1946 for obligations only). */
export const AID_FIRST_FISCAL_YEAR = 2001;

export const RECIPIENT_TYPES = ["country", "regional", "global"] as const;

const usd = z.number().int().finite();

/** One row per (recipient, fiscal_year, sector_category). Nominal (current-year) dollars. */
export const aidRow = z
  .object({
    /** `regional` = a multi-country region ("Sub-Saharan Africa Region"); `global` = the source's "World" bucket. Both are kept: they are ~a third of FY2025 aid. */
    recipient_type: z.enum(RECIPIENT_TYPES),
    /** Trade pipeline's `country_code` (ISO 3166-1 alpha-3, plus its XKX/XWB/XGZ and former-state codes). Null for regional/global, and for recipients with no single trade counterpart. */
    country_key: z.string().regex(/^[A-Z][A-Z0-9_]{2,15}$/).nullable(),
    /** The source's own name, for auditability. Unique per recipient_type. */
    recipient_name: z.string().min(1),
    /** Federal fiscal year (Oct 1 – Sep 30), labeled by the year it ends. */
    fiscal_year: z.number().int().min(AID_FIRST_FISCAL_YEAR).max(2100),
    /** The source's top-level U.S. sector category, verbatim. */
    sector_category: z.string().min(1),
    /** Cash paid out. The headline measure. 0 when the source reports obligations but no disbursements at this grain. Can be negative (source documents recoveries/adjustments). */
    disbursements_usd: usd,
    /** Null when the source has no obligation record at this grain. */
    obligations_usd: usd.nullable(),
    /** The part of `disbursements_usd` the source classifies as Military assistance (`assistance_category`), which is NOT the same as the Peace and Security category. */
    military_disbursements_usd: usd,
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.recipient_type !== "country" && r.country_key !== null) ctx.addIssue({ code: "custom", message: `${r.recipient_type} row ${r.recipient_name} must have a null country_key` });
  });
export type AidRow = z.infer<typeof aidRow>;

/** Freshness metadata the page needs (mark partial years, show "data through"). */
export const aidMeta = z
  .object({
    source: z.literal("ForeignAssistance.gov"),
    measure: z.literal("disbursements"),
    dollars: z.literal("nominal"),
    /** ISO date of the site's "Data last updated on" banner. */
    data_through: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    first_fiscal_year: z.number().int(),
    latest_fiscal_year: z.number().int(),
    /** The source exposes no per-year completeness flag; this is our documented calendar rule, not the source's word. */
    partial_basis: z.literal("calendar_rule"),
    partial_rule: z.string(),
    years: z.array(z.object({ fiscal_year: z.number().int(), is_partial: z.boolean() }).strict()),
    sector_categories: z.array(z.string().min(1)),
  })
  .strict();
export type AidMeta = z.infer<typeof aidMeta>;

export class AidDataError extends Error {}

/** `pipeline/output/world_map.json` (pipeline/transform/world-map.ts): simplified Natural Earth outlines keyed by `country_key`. */
export const worldMapFile = z
  .object({
    source: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    features: z.array(z.object({ key: z.string().min(1), name: z.string(), d: z.string().min(1) }).strict()).min(1),
    recipients: z.array(
      z
        .object({
          name: z.string().min(1),
          paths: z.array(z.string()).min(1),
          marker: z.object({ x: z.number(), y: z.number() }).strict().nullable(),
        })
        .strict(),
    ),
    undrawn: z.array(z.string()),
  })
  .strict();
export type WorldMapFile = z.infer<typeof worldMapFile>;
