import type { Metadata } from "next";
import { getWealthData } from "@/lib/wealth-data";
import { WealthPageClient } from "@/components/wealth/WealthPageClient";
import { site, ogDefaults, twitterDefaults } from "@/lib/site";

/** /congress/wealth — the Congress vertical's Wealth section. */
export const metadata: Metadata = {
  title: "Congressional net worth",
  description:
    "Estimated from annual House Clerk and Senate eFD financial disclosures — every current member of Congress's net worth over time.",
  alternates: { canonical: "/congress/wealth" },
  openGraph: {
    ...ogDefaults,
    title: `Congressional net worth · ${site.name}`,
    description:
      "Estimated from annual House Clerk and Senate eFD financial disclosures.",
    url: "/congress/wealth",
  },
  twitter: twitterDefaults,
};

export default function WealthPage() {
  const members = getWealthData();
  return <WealthPageClient members={members} />;
}
