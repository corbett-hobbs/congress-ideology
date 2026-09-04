import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  },
};

export default nextConfig;
