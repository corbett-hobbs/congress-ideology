import { committeeBillsIds, getCommitteeBillsPayload } from "@/lib/committee-bills-data";

/**
 * `/data/committees/<committee_id>/bills` — every bill and joint resolution referred to one committee this Congress (the
 * `CommitteeBillsPayload`: compact rows plus the sponsor, policy-area and subcommittee tables they index), prerendered to
 * static JSON for each committee that has any. The legislation card on the committee page fetches it once, on mount.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return committeeBillsIds().map((committee_id) => ({ committee_id }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ committee_id: string }> }) {
  const { committee_id } = await params;
  const payload = getCommitteeBillsPayload(committee_id);
  if (!payload) return new Response("Not found", { status: 404 });
  return Response.json(payload, { headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } });
}
