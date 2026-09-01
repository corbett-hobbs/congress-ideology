import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The senator route is prerendered for every current senator, but keeps
  // dynamicParams on so a stale name-slug can be 308-redirected to the
  // canonical URL. That on-demand render runs as a serverless function and
  // reads pipeline/output/*.json via fs — a computed path Next's tracer
  // doesn't follow on its own, so include it explicitly.
  outputFileTracingIncludes: {
    "/congress/senators/[bioguide_id]/[name_slug]": ["./pipeline/output/*.json"],
    "/congress/house/[bioguide_id]/[name_slug]": ["./pipeline/output/*.json"],
    "/sitemap.xml": ["./pipeline/output/*.json"],
  },
};

export default nextConfig;
