import { z } from "zod";

export const CENSUS_RAW_DIR = "pipeline/raw/census-trade";

/** The international trade API has no duties data before January 2010 (verified: 2009-12 returns 204). */
export const DUTIES_FIRST_YEAR = 2010;

export const dutiesRawPath = (year: number) => `${CENSUS_RAW_DIR}/duties/${year}.json`;

/**
 * One API response for a year. Each row is
 * `[time "YYYY-MM", CTY_CODE, CTY_NAME, CAL_DUT_MO, CON_VAL_MO]`, every cell the
 * API's own string. Amounts are whole dollars.
 */
const rawDuties = z.object({
  fetched_at: z.string(),
  year: z.number().int(),
  rows: z.array(z.tuple([z.string().regex(/^\d{4}-\d{2}$/), z.string(), z.string(), z.string(), z.string()])),
});
export type RawDuties = z.infer<typeof rawDuties>;

export function parseRawDuties(value: unknown): RawDuties {
  return rawDuties.parse(value);
}
