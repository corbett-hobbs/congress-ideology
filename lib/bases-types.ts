import type { SiteType } from "./bases-entities";

/**
 * Client-safe shapes for the "known installations" layer on /presidency/national-security. One undated snapshot
 * (BASES_DATA_THROUGH), no headcounts: a dot says a site existed, nothing about how many people were there.
 */

export const SITE_ORDER: readonly SiteType[] = ["base", "lilypad", "funded_site"];
export const SITE_LABEL: Record<SiteType, string> = {
  base: "Major base",
  lilypad: "Small site (“lilypad”)",
  funded_site: "Host-nation base, U.S.-funded",
};

/** Shorter wording for the map tooltip; the legend and table keep the full SITE_LABEL. */
export const SITE_TIP_LABEL: Record<SiteType, string> = { ...SITE_LABEL, lilypad: "Small site" };

export interface BaseSite {
  name: string;
  /** Index into `countries`. */
  c: number;
  /** Index into `SITE_ORDER`. */
  t: number;
  /** `world_map.json` coordinates. */
  x: number;
  y: number;
  /** Set when the coordinates look wrong: listed in the table, not drawn. */
  review: string | null;
}

export interface BasesPayload {
  /** The source's last year (documented, not in the file). */
  through: number;
  countries: { name: string; iso3: string }[];
  sites: BaseSite[];
}

/** A dot or a merged group of dots at the current zoom. */
export interface BaseCluster {
  x: number;
  y: number;
  iso3: string;
  members: number[];
}
