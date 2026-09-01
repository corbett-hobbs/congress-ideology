import type { Metadata } from "next";
import { Suspense } from "react";
import {
  getChamberCurrent,
  getMemberSearchIndex,
} from "@/lib/congress-data";
import { site } from "@/lib/site";
import { SenateExplorer } from "@/components/senate/SenateExplorer";

export const metadata: Metadata = {
  title: { absolute: `${site.name} · Congress ideology, 1789–present` },
  description: site.description,
  alternates: { canonical: "/" },
  openGraph: {
    title: `${site.name} · Congress ideology`,
    description: site.description,
    url: "/",
  },
};

export default function Home() {
  const senate = getChamberCurrent("senate");
  const house = getChamberCurrent("house");
  const search = getMemberSearchIndex();

  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <SenateExplorer senate={senate} house={house} search={search} />
    </Suspense>
  );
}
