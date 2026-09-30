import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The explorer moved from "/" to "/congress" and wealth from "/wealth" to
  // "/congress/wealth". A bare "/" is the hub and must not redirect, so the
  // explorer is matched on the query params it reads/writes (chamber, state,
  // show — see lib/use-chamber.ts). Next carries the query string through.
  async redirects() {
    return [
      { source: "/wealth", destination: "/congress/wealth", permanent: true },
      ...["chamber", "state", "show"].map((key) => ({
        source: "/",
        has: [{ type: "query" as const, key }],
        destination: "/congress",
        permanent: true,
      })),
    ];
  },

  // Several routes render as serverless functions (stale-slug redirects on the
  // profile pages; the OG images, which now render on demand) and read
  // pipeline/output/*.json via fs — a computed path Next's tracer doesn't
  // follow on its own, so include it explicitly.
  outputFileTracingIncludes: {
    "/congress/senators/[bioguide_id]/[name_slug]": ["./pipeline/output/*.json"],
    "/congress/senators/[bioguide_id]/[name_slug]/opengraph-image": [
      "./pipeline/output/*.json",
    ],
    "/congress/house/[bioguide_id]/[name_slug]": ["./pipeline/output/*.json"],
    "/congress/house/[bioguide_id]/[name_slug]/opengraph-image": [
      "./pipeline/output/*.json",
    ],
    "/congress/committees/[committee_id]/[name_slug]": ["./pipeline/output/*.json"],
    "/congress/committees/[committee_id]/[name_slug]/opengraph-image": [
      "./pipeline/output/*.json",
    ],
    "/sitemap.xml": ["./pipeline/output/*.json"],
    // The Court pages and the hub card read pipeline/output/court/ via
    // lib/justice-data.ts.
    "/supreme-court": ["./pipeline/output/court/*.json"],
    "/supreme-court/justices/[justice_id]/[name_slug]": ["./pipeline/output/court/*.json"],
    "/": ["./pipeline/output/court/*.json"],
  },
};

export default nextConfig;
