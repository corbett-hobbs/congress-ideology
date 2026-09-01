import { getChamberHistory } from "@/lib/congress-data";
import { isChamber } from "@/lib/chamber";

/**
 * `/data/house` and `/data/senate` — the full scrub-through-time payload for
 * one chamber, prerendered to a static JSON asset at build. The homepage ships
 * only the current Congress inline and fetches this once, on demand.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return [{ chamber: "senate" }, { chamber: "house" }];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ chamber: string }> },
) {
  const { chamber } = await params;
  if (!isChamber(chamber)) {
    return new Response("Not found", { status: 404 });
  }
  return Response.json(getChamberHistory(chamber), {
    headers: { "cache-control": "public, max-age=3600, s-maxage=86400" },
  });
}
