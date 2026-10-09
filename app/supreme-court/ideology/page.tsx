import type { Metadata } from "next";
import { getCourtPayload } from "@/lib/justice-data";
import { site, ogDefaults, twitterDefaults } from "@/lib/site";
import { CourtExplorer } from "@/components/court/CourtExplorer";

// PLACEHOLDER COPY — title/description awaiting Corby's edit.
export const metadata: Metadata = {
  title: "Supreme Court ideology explorer",
  description:
    "Where each Supreme Court justice sits on the liberal–conservative scale, term by term, from Martin–Quinn scores.",
  alternates: { canonical: "/supreme-court/ideology" },
  openGraph: {
    ...ogDefaults,
    title: `How does the Supreme Court lean? · ${site.name}`,
    description:
      "Where each Supreme Court justice sits on the liberal–conservative scale, term by term, from Martin–Quinn scores.",
    url: "/supreme-court/ideology",
  },
  twitter: twitterDefaults,
};

export default function SupremeCourtPage() {
  return <CourtExplorer data={getCourtPayload()} />;
}
