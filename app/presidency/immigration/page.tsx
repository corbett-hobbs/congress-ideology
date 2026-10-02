import type { Metadata } from "next";
import { ImmigrationPageClient } from "@/components/immigration/ImmigrationPageClient";
import { getImmigrationPageData } from "@/lib/immigration-data";
import { site } from "@/lib/site";

/** /presidency/immigration — ICE removals by fiscal year, by administration, with the definition changes marked. */
export const metadata: Metadata = {
  title: "How many people does ICE remove?",
  description:
    "ICE removals by fiscal year since 2003, colored by the administration in office, with the changes in what ICE counts marked on the timeline. From ICE's own statistics.",
  alternates: { canonical: "/presidency/immigration" },
  openGraph: {
    title: `How many people does ICE remove? · ${site.name}`,
    description: "ICE removals by fiscal year and administration, with the changes in what is counted marked. From ICE's own statistics.",
    url: "/presidency/immigration",
  },
};

export default function ImmigrationPage() {
  return <ImmigrationPageClient data={getImmigrationPageData()} />;
}
