import type { Metadata } from "next";
import { getSenateDataset } from "@/lib/senate-data";
import { SenateExplorer } from "@/components/senate/SenateExplorer";

export const metadata: Metadata = {
  title: "The Ideology Space · U.S. Senate",
  description:
    "Every U.S. senator's roll-call votes reduced to two DW-NOMINATE coordinates, 1st–119th Congress.",
};

export default function Home() {
  const data = getSenateDataset();
  return <SenateExplorer data={data} />;
}
