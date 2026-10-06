import type { Metadata } from "next";
import { EnergyPageClient } from "@/components/energy/EnergyPageClient";
import { getEnergyPayload } from "@/lib/energy-data";
import { site } from "@/lib/site";

/** /presidency/energy — the Presidency vertical's Energy section: the Strategic Petroleum Reserve, the oil balance, electricity by source and LNG exports. */
export const metadata: Metadata = {
  title: "How has U.S. energy changed?",
  description:
    "The Strategic Petroleum Reserve, U.S. oil production, imports and exports, electricity by source and LNG exports since 1991, with presidential terms and policy actions marked. From the U.S. Energy Information Administration.",
  alternates: { canonical: "/presidency/energy" },
  openGraph: {
    title: `How has U.S. energy changed? · ${site.name}`,
    description: "The Strategic Petroleum Reserve, oil, electricity and LNG exports, with presidential terms and policy actions marked. From the U.S. Energy Information Administration.",
    url: "/presidency/energy",
  },
};

export default function EnergyPage() {
  return <EnergyPageClient payload={getEnergyPayload()} />;
}
