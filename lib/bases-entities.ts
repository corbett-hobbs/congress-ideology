import { z } from "zod";

/** Where the list comes from and how far it goes. The source is one undated snapshot, documented as "through 2018". */
export const BASES_SOURCE = "troopdata basedata (Vine)";
export const BASES_DATA_THROUGH = 2018;

export const SITE_TYPES = ["base", "lilypad", "funded_site"] as const;
export type SiteType = (typeof SITE_TYPES)[number];

/** `pipeline/output/bases.json`: one row per known overseas installation, keyed on `base_id` (not `bioguide_id`). */
export const baseRow = z
  .object({
    base_id: z.string().min(1),
    name: z.string().min(1),
    country: z.string().min(1),
    iso3: z.string().regex(/^[A-Z]{3}$/),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    site_type: z.enum(SITE_TYPES),
    /** Build-time projection into `world_map.json`'s 1000-wide space. */
    x: z.number(),
    y: z.number(),
    source: z.string().min(1),
    /** The coordinates were checked against the place and look wrong or imprecise: listed, not drawn. */
    needs_review: z.boolean(),
    review_note: z.string().nullable(),
  })
  .strict();
export type BaseRow = z.infer<typeof baseRow>;
