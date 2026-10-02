import { z } from "zod";
import { fiscalYear } from "./enforcement-entities";

/**
 * ICE removals by country of citizenship (`pipeline/output/removals_by_country.json`, one row per
 * fiscal year and country; `removals_by_country_report.json`). Country of CITIZENSHIP, not destination.
 * Same agency and definition as `enforcement_series.json` (ICE-only, headline totals), and every year's
 * rows sum to that series' value. See `docs/IMMIGRATION_ENFORCEMENT_METHODOLOGY.md` ("By country").
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date");

export const removalsCountryRow = z.strictObject({
  fiscal_year: fiscalYear,
  /** The trade pipeline's `country_code` (ISO 3166-1 alpha-3), or a documented user-assigned code. */
  country_key: z.string().regex(/^[A-Z]{3}$/),
  country_name: z.string().min(1),
  /** The name as ICE printed it in `source_doc`. */
  ice_name: z.string().min(1),
  /** Always positive: a country ICE lists with zero removals that year has no row. */
  removals: z.number().int().positive(),
  /** Catalog source id of the ICE document the row was read from. */
  source_doc: z.string().min(1),
  /** The data run date ICE prints for that fiscal year (the document's own "as of"). */
  as_of: isoDate,
  /** "review" = the name wrapped across two printed lines or two ICE names were merged. */
  parse_confidence: z.enum(["high", "review"]),
  needs_review: z.boolean(),
});
export type RemovalsCountryRow = z.infer<typeof removalsCountryRow>;

export const removalsCountryReport = z.strictObject({
  first_fiscal_year: fiscalYear,
  last_fiscal_year: fiscalYear,
  fiscal_years: z.array(
    z.strictObject({
      fiscal_year: fiscalYear,
      source_doc: z.string(),
      as_of: isoDate,
      rows: z.number().int(),
      zero_rows_dropped: z.number().int(),
      sum: z.number().int(),
      /** The "Total" ICE prints in the same table. */
      printed_total: z.number().int(),
      /** `enforcement_series.json`'s value for the year. */
      national_total: z.number().int(),
      other_documents: z.array(z.string()),
      needs_review_rows: z.number().int(),
    }),
  ),
  /** Years with a national total but no country table, and why. */
  uncovered_fiscal_years: z.array(z.strictObject({ fiscal_year: fiscalYear, reason: z.string() })),
});
export type RemovalsCountryReport = z.infer<typeof removalsCountryReport>;
