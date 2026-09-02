import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import {
  getChamberCurrent,
  getCurrentMembers,
  getMemberProfile,
} from "@/lib/congress-data";
import { memberPath, memberSlug } from "@/lib/member-url";
import { partyAbbr } from "@/components/senate/format";
import { MemberProfileView } from "@/components/profile/MemberProfileView";

interface RouteParams {
  bioguide_id: string;
  name_slug: string;
}

/** One static page per current senator, at the canonical slug. */
export function generateStaticParams(): RouteParams[] {
  return getCurrentMembers("senate").map((s) => ({
    bioguide_id: s.bioguideId,
    name_slug: memberSlug(s),
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
  const profile = getMemberProfile("senate", bioguide_id);
  if (!profile) return { title: "Senator not found" };

  const abbr = partyAbbr(profile.party);
  const congresses =
    profile.chamberCongressCount === 1
      ? "their first Congress"
      : `${profile.chamberCongressCount} Congresses`;
  const title = `${profile.name} (${abbr}-${profile.state})`;
  const description = `${profile.name}, ${profile.party} senator from ${profile.stateName} — DW-NOMINATE ideology score and how it has moved across ${congresses}.`;
  const url = memberPath(profile);

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

  const profile = getMemberProfile("senate", bioguide_id);
  if (!profile) notFound(); // unknown id, or not a senator in the latest Congress

  const canonical = memberSlug(profile);
  if (name_slug !== canonical) {
    permanentRedirect(memberPath(profile));
  }

  const current = getChamberCurrent("senate");
  return (
    <MemberProfileView
      profile={profile}
      compassMembers={current.plottable}
      delegationMembers={current.all}
      trend={current.trend}
    />
  );
}
