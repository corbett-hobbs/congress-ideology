import type { Metadata } from "next";
import { DemographicsPageClient } from "@/components/demographics/DemographicsPageClient";
import { getDemographicsPayload } from "@/lib/demographics-data";
import { site } from "@/lib/site";

/** /congress/demographics — the Congress vertical's Demographics section. */
export const metadata: Metadata = {
  title: "Who serves in Congress?",
  description: "How old the members of Congress are, how many are women, and how long they have served, for every Congress since 1933.",
  alternates: { canonical: "/congress/demographics" },
  openGraph: {
    title: `Who serves in Congress? · ${site.name}`,
    description: "Age, gender and time in office of the members of every Congress since 1933.",
    url: "/congress/demographics",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: { images: ["/opengraph-image"] },
};

export default function DemographicsPage() {
  return <DemographicsPageClient data={getDemographicsPayload()} />;
}
