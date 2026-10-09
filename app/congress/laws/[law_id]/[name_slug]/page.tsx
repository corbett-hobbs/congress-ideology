import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { LawPageView } from "@/components/laws/detail/LawPageView";
import { getLawPage, getLawRef, getLawRefs } from "@/lib/law-details-data";
import { lawPath, lawSlug } from "@/lib/law-url";
import { ordinal } from "@/lib/laws-entities";

interface RouteParams {
  law_id: string;
  name_slug: string;
}

/**
 * Pre-built: the two most recent Congresses' laws and every Mayhew major law. The other ~11k laws render on first request
 * and are then cached (`dynamicParams`), the way the member and justice pages handle a stale or unlisted URL.
 */
export function generateStaticParams(): RouteParams[] {
  const refs = getLawRefs();
  const newest = new Set([...new Set(refs.map((r) => r.congress))].sort((a, b) => b - a).slice(0, 2));
  return refs.filter((r) => newest.has(r.congress) || r.major === true).map((r) => ({ law_id: r.lawId, name_slug: lawSlug(r.title) }));
}

// A valid id with a stale slug is not pre-built: keep dynamicParams on so the request reaches the page, which redirects to
// the canonical URL (a real HTTP redirect, so no loading.tsx here).
export const dynamicParams = true;

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { law_id } = await params;
  const law = getLawPage(law_id);
  if (!law) return { title: "Law not found" };
  const title = `${law.title} (${law.publicLaw})`;
  const description = (law.summary?.[0] ?? `${law.publicLaw}, ${ordinal(law.congress)} Congress, ${law.billLabel}.`).slice(0, 200);
  const url = lawPath(law.lawId, law.title);
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, type: "article" }, twitter: { card: "summary_large_image", title, description } };
}

export default async function LawPage({ params }: { params: Promise<RouteParams> }) {
  const { law_id, name_slug } = await params;
  const ref = getLawRef(law_id);
  if (!ref) notFound();
  if (name_slug !== lawSlug(ref.title)) permanentRedirect(lawPath(ref.lawId, ref.title));
  const law = getLawPage(law_id);
  if (!law) notFound();
  return <LawPageView law={law} />;
}
