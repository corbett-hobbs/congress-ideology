/**
 * Site-wide constants and the canonical base URL.
 *
 * On Vercel `VERCEL_PROJECT_PRODUCTION_URL` is the stable production domain and
 * is set at build time. `NEXT_PUBLIC_SITE_URL` overrides it (set that once
 * there's a custom domain). Falls back to localhost for `pnpm dev`.
 */
export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000")
).replace(/\/$/, "");

export const site = {
  name: "InsideGov",
  /** Slug form — kept in sync with package.json `name`, not the display name. */
  shortName: "congress-ideology",
  tagline: "The U.S. government, by the numbers",
  /** Homepage / whole-site blurb; `description` below is Congress-specific. */
  hubDescription:
    "Explore ideology, net worth, and more across all three branches of the U.S. government. Start with Congress and the Supreme Court, with the presidency on the way.",
  description:
    "Every member of Congress's votes reduced to a two-dimensional ideology score (DW-NOMINATE, 1st–119th Congress). Scrub through 236 years of the House and Senate, filter a state's delegation, and read any current member's trajectory.",
} as const;

export function absoluteUrl(path: string): string {
  return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
