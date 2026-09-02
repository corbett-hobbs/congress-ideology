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

/** One static page per current representative, at the canonical slug. */
export function generateStaticParams(): RouteParams[] {
  return getCurrentMembers("house").map((m) => ({
    bioguide_id: m.bioguideId,
    name_slug: memberSlug(m),
  }));
}

// Keep dynamicParams on so a stale name-slug 308-redirects to the canonical
// URL. Do not add a loading.tsx here — its Suspense boundary would downgrade
// the redirect to a client-side meta refresh.
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { bioguide_id } = await params;
  const profile = getMemberProfile("house", bioguide_id);
  if (!profile) return { title: "Representative not found" };

  const abbr = partyAbbr(profile.party);
  const seat =
    profile.district != null
      ? `${profile.state}-${profile.district}`
      : `${profile.state} at-large`;
  const congresses =
    profile.chamberCongressCount === 1
      ? "their first Congress"
      : `${profile.chamberCongressCount} Congresses`;
  const title = `${profile.name} (${abbr}-${seat})`;
  const description = `${profile.name}, ${profile.party} representative for ${seat} — DW-NOMINATE ideology score and how it has moved across ${congresses}.`;
  const url = memberPath(profile);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "profile" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function RepresentativePage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { bioguide_id, name_slug } = await params;

  const profile = getMemberProfile("house", bioguide_id);
  if (!profile) notFound();

  const canonical = memberSlug(profile);
  if (name_slug !== canonical) {
    permanentRedirect(memberPath(profile));
  }

  const current = getChamberCurrent("house");
  return (
    <MemberProfileView
      profile={profile}
      compassMembers={current.plottable}
      delegationMembers={current.all}
      trend={current.trend}
    />
  );
}
