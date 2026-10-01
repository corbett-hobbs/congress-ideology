import { z } from "zod";

/**
 * Schemas for the trade track (U.S. Census Bureau): national series, per-country
 * series, calculated duties. See docs/TRADE_METHODOLOGY.md. Not a `bioguide_id`
 * track: the join key is `country_code` (see `countries.json`).
 */

/** First period every series on the page must cover (the Presidency page's window). */
export const TRADE_START_YEAR = 1991;
/** The international trade API has no duties data before this month. */
export const DUTIES_START_PERIOD = "2010-01";

const year = z.number().int().min(1985).max(2100);
const period = z.string().regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/);
/** $ millions, one decimal (Census publishes goods monthly to 0.1M). */
const millions = z.number().finite();

/**
 * What a Census partner code is.
 * - `country`: a partner with an ISO 3166-1 code (includes dependencies and special areas)
 * - `former`: a code that stopped being used (USSR, Czechoslovakia, Netherlands Antilles, ...)
 * - `unallocated`: Census residual partners that DO belong in a country sum
 * - `region` / `group` / `world` / `product`: aggregates, never summed with countries
 */
export const COUNTRY_KINDS = ["country", "former", "unallocated", "region", "group", "world", "product"] as const;

export const countryRow = z
  .object({
    /** Canonical join key: ISO 3166-1 alpha-3 where one exists; see docs/TRADE_METHODOLOGY.md for the rest. */
    country_code: z.string().regex(/^[A-Z][A-Z0-9_]{2,15}$/),
    /** Census's own 4-character code (the source id). Several Census codes may share one `country_code`. */
    census_code: z.string().regex(/^[0-9A-Z-]{1,4}$/),
    name: z.string().min(1),
    iso2: z.string().length(2).nullable(),
    kind: z.enum(COUNTRY_KINDS),
    /** True for regions, groups, World and product totals. Filter these out before summing countries. */
    is_aggregate: z.boolean(),
    /** First / last year this code carries trade in the goods file (1985-). Null if it only appears in duties. */
    first_year: year.nullable(),
    last_year: year.nullable(),
    note: z.string().nullable(),
  })
  .strict();
export type CountryRow = z.infer<typeof countryRow>;

export const tradeNationalRow = z
  .object({
    period,
    frequency: z.enum(["annual", "monthly"]),
    /** `bop` = balance-of-payments basis (goods and services); `census` = Census basis (goods only). They differ by design. */
    basis: z.enum(["bop", "census"]),
    scope: z.enum(["goods_services", "goods", "services"]),
    adjustment: z.enum(["nsa", "sa"]),
    exports: millions,
    imports: millions,
    balance: millions,
  })
  .strict();
export type TradeNationalRow = z.infer<typeof tradeNationalRow>;

const twelve = <T extends z.ZodType>(t: T) => z.array(t.nullable()).length(12);

/**
 * One (country, year) of goods trade, Census basis, $ millions. `null` month = not yet published.
 * When Census moved a partner to a new code, the old and new codes' months are summed here
 * (distinct Census codes are exclusive partners, so the sum cannot double count; the changeover month can carry both), so a country is one continuous series.
 */
export const tradeByCountryRow = z
  .object({
    country_code: z.string(),
    year,
    exports: twelve(millions),
    imports: twelve(millions),
    exports_year: millions,
    imports_year: millions,
    balance_year: millions,
  })
  .strict();
export type TradeByCountryRow = z.infer<typeof tradeByCountryRow>;

const dollars = z.number().int().nonnegative();
const rate = z.number().finite().nonnegative();

/** One (country, year) of calculated duties, whole dollars. Rate = duties / imports for consumption. */
export const dutiesByCountryRow = z
  .object({
    country_code: z.string(),
    year,
    duties: twelve(dollars),
    import_value: twelve(dollars),
    rate: twelve(rate),
    duties_year: dollars,
    import_value_year: dollars,
    rate_year: rate.nullable(),
  })
  .strict();
export type DutiesByCountryRow = z.infer<typeof dutiesByCountryRow>;

/** National (all-countries) duties by month, from the API's own total row. */
export const dutiesNationalRow = z
  .object({
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    duties: dollars,
    import_value: dollars,
    rate: rate.nullable(),
  })
  .strict();
export type DutiesNationalRow = z.infer<typeof dutiesNationalRow>;

export class TradeDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TradeDataError";
  }
}
