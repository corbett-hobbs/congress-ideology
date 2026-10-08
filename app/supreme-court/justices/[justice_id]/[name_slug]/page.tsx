import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getJusticeVotesSource } from "@/lib/decisions-data";
import { getJusticeProfile, getJusticeRefs } from "@/lib/justice-data";
import { getVotedJusticeIds } from "@/lib/justice-votes-data";
import { justicePath, justiceSlug } from "@/lib/justice-url";
import { JusticeProfileView } from "@/components/court/JusticeProfileView";

interface RouteParams {
  justice_id: string;
  name_slug: string;
}

/** One static page per justice in the Martin-Quinn data, at the canonical slug. */
export function generateStaticParams(): RouteParams[] {
  return getJusticeRefs().map((j) => ({
    justice_id: String(j.id),
    name_slug: justiceSlug(j),
  }));
}

// A valid id with a stale slug isn't pre-built. Keep dynamicParams on so the
// request reaches the page, which redirects it to the canonical URL (a real
// HTTP redirect — do not add a loading.tsx here, its Suspense boundary would
// turn the redirect into a client-side meta refresh). Same as the member routes.
export const dynamicParams = true;

/** `justice_id` is digits only; anything else ("abc", "103x", "1e2") is not a justice. */
function parseId(raw: string): number | null {
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { justice_id } = await params;
  const id = parseId(justice_id);
  const profile = id == null ? null : getJusticeProfile(id);
  if (!profile) return { title: "Justice not found" };

  const { justice, identity } = profile;
  const title = `${justice.name} — ${identity.role}`;
  const description = `${justice.name}, appointed by ${identity.appointedBy.president} (${identity.appointedBy.party}) — Martin–Quinn ideology score by term, and how ${profile.last} compares with every justice since 1937.`;
  const url = justicePath(justice);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "profile" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function JusticePage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { justice_id, name_slug } = await params;
  const id = parseId(justice_id);
  const profile = id == null ? null : getJusticeProfile(id);
  if (!profile) notFound(); // unknown id

  if (name_slug !== justiceSlug(profile.justice)) {
    permanentRedirect(justicePath(profile.justice));
  }

  // The court's argued-case record starts in 1946: an earlier justice has no votes to list.
  const votes = getVotedJusticeIds().includes(profile.justice.id) ? getJusticeVotesSource() : null;

  return <JusticeProfileView profile={profile} votes={votes} />;
}
