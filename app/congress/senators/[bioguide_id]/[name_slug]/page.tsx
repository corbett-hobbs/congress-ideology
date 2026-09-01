import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import {
  getCurrentSenators,
  getSenateDataset,
  getSenatorProfile,
} from "@/lib/senate-data";
import { senatorPath, senatorSlug } from "@/lib/senator-url";
import { partyAbbr } from "@/components/senate/format";
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

// A valid id with a stale slug isn't pre-built. Keep dynamicParams on so the
// request reaches the page, which 308-redirects it to the canonical URL (a
// real HTTP redirect — do not add a loading.tsx here, its Suspense boundary
// would turn the redirect into a client-side meta refresh).
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { bioguide_id } = await params;
  const profile = getSenatorProfile(bioguide_id);
  if (!profile) return { title: "Senator not found" };

  const abbr = partyAbbr(profile.party);
  const congresses =
    profile.senateCongressCount === 1
      ? "their first Congress"
      : `${profile.senateCongressCount} Congresses`;
  const title = `${profile.name} (${abbr}-${profile.state})`;
  const description = `${profile.name}, ${profile.party} senator from ${profile.stateName} — DW-NOMINATE ideology score and how it has moved across ${congresses}.`;
  const url = senatorPath(profile);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "profile" },
    twitter: { card: "summary_large_image", title, description },
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
