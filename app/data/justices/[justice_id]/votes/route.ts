import { getJusticeVotes, getVotedJusticeIds } from "@/lib/justice-votes-data";

/**
 * `/data/justices/[justice_id]/votes` — how one justice voted in each argued case, as `[case_id, vote, role]` arrays (see
 * `JusticeVote`), prerendered to static JSON. The justice page's case table fetches it on mount.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return getVotedJusticeIds().map((id) => ({ justice_id: String(id) }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ justice_id: string }> }) {
  const { justice_id } = await params;
  const votes = /^\d+$/.test(justice_id) ? getJusticeVotes(Number(justice_id)) : null;
  if (!votes) return new Response("Not found", { status: 404 });
  return Response.json(votes, { headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } });
}
