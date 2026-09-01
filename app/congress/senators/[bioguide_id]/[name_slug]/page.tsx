import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import {
  getCurrentSenators,
  getSenateDataset,
  getSenatorProfile,
} from "@/lib/senate-data";
import { senatorSlug } from "@/lib/senator-url";
import { SenatorProfileView } from "@/components/senate/SenatorProfileView";

interface RouteParams {
  bioguide_id: string;
  name_slug: string;
}

/** One static page per current senator, at the canonical slug. */
export function generateStaticParams(): RouteParams[] {
  return getCurrentSenators().map((s) => ({
    bioguide_id: s.bioguideId,
    name_slug: senatorSlug(s),
  }));
}

// A request with a valid id but a stale slug isn't pre-built — let it through
// so the page can 308-redirect it to the canonical URL.
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { bioguide_id } = await params;
  const profile = getSenatorProfile(bioguide_id);
  if (!profile) return {};

  const congresses =
    profile.senateCongressCount === 1
      ? "1 Congress"
      : `${profile.senateCongressCount} Congresses`;

  return {
    title: `${profile.name} · U.S. Senate`,
    description: `${profile.name} of ${profile.stateName} — DW-NOMINATE ideology score and trajectory across ${congresses}.`,
    alternates: {
      canonical: `/congress/senators/${bioguide_id}/${senatorSlug(profile)}`,
    },
  };
}

export default async function SenatorPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { bioguide_id, name_slug } = await params;

  const profile = getSenatorProfile(bioguide_id);
  if (!profile) notFound(); // unknown id, or not a senator in the latest Congress

  const canonical = senatorSlug(profile);
  if (name_slug !== canonical) {
    permanentRedirect(`/congress/senators/${bioguide_id}/${canonical}`);
  }

  const ds = getSenateDataset();
  return (
    <SenatorProfileView
      profile={profile}
      compassMembers={ds.byCongress[ds.latestCongress] ?? []}
      delegationMembers={ds.allByCongress[ds.latestCongress] ?? []}
      trend={ds.trend}
    />
  );
}
