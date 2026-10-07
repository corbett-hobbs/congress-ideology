import { getDecisionCases } from "@/lib/decisions-data";

/**
 * `/data/decisions/cases` — every argued case in the Decisions data, newest first, as compact arrays (see
 * `DecisionCase`), prerendered to static JSON. The case list under the charts fetches it once, on demand.
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json(getDecisionCases(), { headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } });
}
