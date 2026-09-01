import type { Metadata } from "next";
import { getSenateDataset } from "@/lib/senate-data";
import { site } from "@/lib/site";
import { SenateExplorer } from "@/components/senate/SenateExplorer";

export const metadata: Metadata = {
  title: { absolute: `${site.name} · U.S. Senate ideology, 1789–present` },
  description: site.description,
  alternates: { canonical: "/" },
  openGraph: {
    title: `${site.name} · U.S. Senate ideology`,
    description: site.description,
    url: "/",
  },
};

export default function Home() {
  const data = getSenateDataset();
  return <SenateExplorer data={data} />;
}
