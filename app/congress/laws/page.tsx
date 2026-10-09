import type { Metadata } from "next";
import { LawsPageClient } from "@/components/laws/LawsPageClient";
import { getLawsPageData } from "@/lib/laws-data";
import { site } from "@/lib/site";

/** /congress/laws — the Congress vertical's Laws section. */
export const metadata: Metadata = {
  title: "What laws does Congress pass?",
  description: "How many public laws Congress enacts each Congress, by policy area, and how broadly they are supported, since 1973.",
  alternates: { canonical: "/congress/laws" },
  openGraph: {
    title: `What laws does Congress pass? · ${site.name}`,
    description: "Public laws per Congress, by policy area and the closest recorded vote on passage, for every Congress since 1973.",
    url: "/congress/laws",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: { images: ["/opengraph-image"] },
};

export default function LawsPage() {
  return <LawsPageClient data={getLawsPageData()} />;
}
