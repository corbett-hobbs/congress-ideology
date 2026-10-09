import type { Metadata } from "next";
import { Suspense } from "react";
import {
  getBothTrend,
  getChamberCurrent,
  getMemberSearchIndex,
} from "@/lib/congress-data";
import {
  committeesLatestCongress,
  getCommittees,
  getCommitteeSearchIndex,
} from "@/lib/committee-data";
import { site, ogDefaults, twitterDefaults } from "@/lib/site";
import { SenateExplorer } from "@/components/senate/SenateExplorer";

export const metadata: Metadata = {
  title: "Congress ideology explorer",
  description: site.congressIdeologyDescription,
  alternates: { canonical: "/congress/ideology" },
  openGraph: {
    ...ogDefaults,
    title: `Congress ideology explorer · ${site.name}`,
    description: site.congressIdeologyDescription,
    url: "/congress/ideology",
  },
  twitter: twitterDefaults,
};

export default function Home() {
  const senate = getChamberCurrent("senate");
  const house = getChamberCurrent("house");
  const bothTrend = getBothTrend();
  const search = getMemberSearchIndex();
  const committees = getCommittees("both");
  const committeeSearch = getCommitteeSearchIndex();

  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <SenateExplorer
        senate={senate}
        house={house}
        bothTrend={bothTrend}
        search={search}
        committees={committees}
        committeeSearch={committeeSearch}
        committeeCongress={committeesLatestCongress()}
      />
    </Suspense>
  );
}
