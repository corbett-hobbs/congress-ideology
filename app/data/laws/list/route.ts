import { getLawsList } from "@/lib/laws-data";

/**
 * `/data/laws/list` — every public law since 1973, newest first, as compact tuples (see `LawListRow`) with the sponsor and
 * signer tables they index, prerendered to static JSON. The list under the charts fetches it once, on demand.
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json(getLawsList(), { headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } });
}
