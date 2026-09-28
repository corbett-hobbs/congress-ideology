import type { Metadata } from "next";
import { getWealthData } from "@/lib/wealth-data";
import { WealthPageClient } from "@/components/wealth/WealthPageClient";
import { site } from "@/lib/site";

/**
 * /wealth — the net worth vertical's landing page (plan's "/congress/wealth"
 * renamed: the site already has a "wealth" top-level vertical wired up at
 * /wealth — nav entry, active-state matching in lib/verticals.ts, and this
 * exact route as a placeholder — so this session builds in place rather than
 * introduce a second, competing route. Reported in the Session 2 summary.)
 */
export const metadata: Metadata = {
  title: "Congressional net worth",
  description:
    "Estimated from annual House Clerk and Senate eFD financial disclosures — every current member of Congress's net worth over time.",
  alternates: { canonical: "/wealth" },
  openGraph: {
    title: `Congressional net worth · ${site.name}`,
    description:
      "Estimated from annual House Clerk and Senate eFD financial disclosures.",
    url: "/wealth",
  },
};

export default function WealthPage() {
  const members = getWealthData();
  return <WealthPageClient members={members} />;
}
