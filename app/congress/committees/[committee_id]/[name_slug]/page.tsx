import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import {
  getAllCommittees,
  getCommitteeCompassBackdrop,
  getCommitteeCompassPool,
  getCommitteeProfile,
} from "@/lib/committee-data";
import { committeePath, committeeSlug } from "@/lib/committee-url";
import { CommitteeProfileView } from "@/components/committee/CommitteeProfileView";

interface RouteParams {
  committee_id: string;
  name_slug: string;
}

/** One static page per committee, at the canonical slug. */
export function generateStaticParams(): RouteParams[] {
  return getAllCommittees().map((c) => ({
    committee_id: c.committeeId,
    name_slug: committeeSlug(c),
  }));
}

// Keep dynamicParams on so a stale name-slug 308-redirects to the canonical URL
// (same rule as the member routes). No loading.tsx — its Suspense boundary would
// downgrade the redirect to a client-side meta refresh.
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { committee_id } = await params;
  const committee = getCommitteeProfile(committee_id);
  if (!committee) return { title: "Committee not found" };

  const title = committee.name;
  const description = `${committee.name} — where it sits on the DW-NOMINATE ideology map, how far apart its members are, and its nearest committees in the ${committee.latestCongress}th Congress.`;
  const url = committeePath(committee);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function CommitteePage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { committee_id, name_slug } = await params;

  const committee = getCommitteeProfile(committee_id);
  if (!committee) notFound();

  const canonical = committeeSlug(committee);
  if (name_slug !== canonical) {
    permanentRedirect(committeePath(committee));
  }

  return (
    <CommitteeProfileView
      committee={committee}
      compassPool={getCommitteeCompassPool(committee)}
      compassBackdrop={getCommitteeCompassBackdrop(committee)}
    />
  );
}
