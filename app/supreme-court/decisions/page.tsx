import type { Metadata } from "next";
import { DecisionsPageClient } from "@/components/decisions/DecisionsPageClient";
import { getDecisionsPageData } from "@/lib/decisions-data";
import { site, ogDefaults, twitterDefaults } from "@/lib/site";

/** /supreme-court/decisions — the Supreme Court vertical's Decisions section. */
export const metadata: Metadata = {
  title: "How does the Supreme Court decide?",
  description: "How many argued cases the Supreme Court decides each term and how often it splits, by issue area, since 1946.",
  alternates: { canonical: "/supreme-court/decisions" },
  openGraph: {
    ...ogDefaults,
    title: `How does the Supreme Court decide? · ${site.name}`,
    description: "Cases decided per term, and how many justices dissented, for every Supreme Court term since 1946.",
    url: "/supreme-court/decisions",
  },
  twitter: twitterDefaults,
};

export default function DecisionsPage() {
  return <DecisionsPageClient data={getDecisionsPageData()} />;
}
