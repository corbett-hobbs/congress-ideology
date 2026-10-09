import type { Metadata } from "next";
import { DemographicsPageClient } from "@/components/demographics/DemographicsPageClient";
import { getDemographicsPayload } from "@/lib/demographics-data";
import { site, ogDefaults, twitterDefaults } from "@/lib/site";

/** /congress/demographics — the Congress vertical's Demographics section. */
export const metadata: Metadata = {
  title: "Who serves in Congress?",
  description: "How old the members of Congress are, how many are women, and how long they have served, for every Congress since 1933.",
  alternates: { canonical: "/congress/demographics" },
  openGraph: {
    ...ogDefaults,
    title: `Who serves in Congress? · ${site.name}`,
    description: "Age, gender and time in office of the members of every Congress since 1933.",
    url: "/congress/demographics",
  },
  twitter: twitterDefaults,
};

export default function DemographicsPage() {
  return <DemographicsPageClient data={getDemographicsPayload()} />;
}
