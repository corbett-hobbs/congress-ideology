import type { Metadata } from "next";
import { getCourtPayload } from "@/lib/justice-data";
import { CourtExplorer } from "@/components/court/CourtExplorer";

// PLACEHOLDER COPY — title/description awaiting Corby's edit.
export const metadata: Metadata = {
  title: "Supreme Court ideology explorer",
  description:
    "Where each Supreme Court justice sits on the liberal–conservative scale, term by term, from Martin–Quinn scores.",
  alternates: { canonical: "/supreme-court" },
  openGraph: {
    title: "How Does the Supreme Court Lean?",
    url: "/supreme-court",
  },
};

export default function SupremeCourtPage() {
  return <CourtExplorer data={getCourtPayload()} />;
}
