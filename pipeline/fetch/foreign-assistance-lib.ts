import { z } from "zod";

export const FA_RAW_DIR = "pipeline/raw/foreign-assistance";
export const faRawYearPath = (year: number) => `${FA_RAW_DIR}/${year}.json`;
export const FA_RAW_META_PATH = `${FA_RAW_DIR}/meta.json`;

/** ForeignAssistance.gov transaction types we keep. Appropriated/Planned and the President's Budget Request are not spending. */
export const TX_OBLIGATIONS = 2;
export const TX_DISBURSEMENTS = 3;

/** Source `assistance_category_id` for military assistance (`Economic` = 1). Verified: reproduces Pew's FY2025 Ukraine split to the dollar. */
export const MILITARY_ASSISTANCE_CATEGORY_ID = 2;

const amount = z.number().int().finite();

/**
 * One row of an API response, kept at the source's own sector grain:
 * `[country_code | null, country_name, usg_category_id, usg_sector_id, transaction_type_id, current_amount]`.
 * `current_amount` is nominal whole dollars; the API's `constant_amount` is deliberately not kept.
 */
export const rawRow = z.tuple([
  z.string().nullable(),
  z.string().min(1),
  z.number().int(),
  z.number().int(),
  z.union([z.literal(TX_OBLIGATIONS), z.literal(TX_DISBURSEMENTS)]),
  amount,
]);
export type RawRow = z.infer<typeof rawRow>;

/**
 * One fiscal year. `sector_rows` come from `/data-api/by-usg-sector.json` unchanged.
 * `military_rows` come from `/data-api/complete-data.json?assistance_category_id=2`, whose
 * ~77k transaction lines are summed to the same grain here (the full transaction file is 1.7M
 * lines and cannot be committed).
 */
export const rawYear = z
  .object({
    fiscal_year: z.number().int().min(1946).max(2100),
    sector_rows: z.array(rawRow),
    military_rows: z.array(rawRow),
  })
  .strict();
export type RawYear = z.infer<typeof rawYear>;

export const rawMeta = z
  .object({
    fetched_at: z.string(),
    /** ISO date of the site's "Data last updated on" banner. Not an API field; see the fetch script. */
    data_through: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** `total_records` the API reported per endpoint, so a truncated fetch is detectable offline. */
    expected_records: z.object({ sector: z.record(z.string(), z.number().int()), military: z.record(z.string(), z.number().int()) }).strict(),
    categories: z.array(z.object({ id: z.number().int(), name: z.string().min(1) }).strict()),
    sectors: z.array(z.object({ id: z.number().int(), category_id: z.number().int(), name: z.string().min(1) }).strict()),
  })
  .strict();
export type RawMeta = z.infer<typeof rawMeta>;

export const parseRawYear = (v: unknown): RawYear => rawYear.parse(v);
export const parseRawMeta = (v: unknown): RawMeta => rawMeta.parse(v);
