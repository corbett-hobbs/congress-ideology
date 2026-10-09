import { getCurrentMemberIndex } from "@/lib/congress-data";
import { getMemberLaws } from "@/lib/member-laws-data";

/**
 * `/data/members/[bioguide_id]/laws` — the laws one member sponsored or cosponsored, as the Laws list's compact tuples with their
 * role (see `MemberLaws`), prerendered to static JSON for every current member. The member page's laws table fetches it on mount.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return [...getCurrentMemberIndex().keys()].map((id) => ({ bioguide_id: id }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ bioguide_id: string }> }) {
  const { bioguide_id } = await params;
  if (!getCurrentMemberIndex().has(bioguide_id)) return new Response("Not found", { status: 404 });
  return Response.json(getMemberLaws(bioguide_id), { headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } });
}
