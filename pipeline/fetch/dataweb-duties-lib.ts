import { z } from "zod";

export const DATAWEB_RAW_DIR = "pipeline/raw/dataweb-duties";
export const dataWebRawPath = (year: number) => `${DATAWEB_RAW_DIR}/${year}.json`;

/**
 * One year of one-time USITC DataWeb pulls. `rows` use the same tuple as the
 * Census API raw files, `[time "YYYY-MM", Census code, name, calculated duties,
 * customs value]`, so `buildDuties` consumes both. The code is the Census
 * country code (DataWeb's own country `value`); "-" is the all-countries row.
 * Amounts are whole dollars, as strings.
 */
const dataWebRaw = z.object({
  fetched_at: z.string(),
  year: z.number().int(),
  source: z.literal("usitc_dataweb"),
  source_url: z.string(),
  api: z.string(),
  query: z.object({
    trade_flow: z.string(),
    measures: z.array(z.string()),
    commodities: z.string(),
    timeframe: z.string(),
    country_views: z.array(z.string()),
    scale: z.string(),
  }),
  run_by: z.string(),
  rows: z.array(z.tuple([z.string().regex(/^\d{4}-\d{2}$/), z.string(), z.string(), z.string(), z.string()])),
});
export type DataWebRaw = z.infer<typeof dataWebRaw>;

export function parseDataWebRaw(value: unknown): DataWebRaw {
  return dataWebRaw.parse(value);
}
