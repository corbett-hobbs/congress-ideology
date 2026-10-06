"use client";

import { HowToRead } from "@/components/HowToRead";
import { PageHeader } from "@/components/PageHeader";
import type { WorldMapFile } from "@/lib/foreign-aid-entities";
import type { TroopsPayload } from "@/lib/troops-types";
import { MapCard } from "./MapCard";
import { TroopsChartCard } from "./TroopsChartCard";
import { TroopsFilterBar } from "./TroopsFilterBar";
import { TroopsStateProvider } from "./TroopsState";

const dateLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export function TroopsPageClient({ payload, map }: { payload: TroopsPayload; map: WorldMapFile }) {
  const first = payload.periods[0];
  const last = payload.periods[payload.periods.length - 1];
  return (
    <TroopsStateProvider payload={payload}>
      <TroopsFilterBar />
      <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-4 pb-16 pt-7 sm:px-6">
        <PageHeader eyebrow="Presidency · National security" title="Where Are U.S. Troops Stationed Abroad?">
          <p>
            The Defense Department publishes where its active-duty personnel are assigned to duty, country by country. This page follows those counts from {first.label} through {last.label}: how many are
            stationed abroad, in which regions, and which countries host the most. Pick a quarter with the slider, or click or drag along the chart, and the map and the host rankings move with it. The filters
            narrow everything to one president’s years, one country or one military branch.
          </p>
          <HowToRead>
            <p>
              <b className="font-semibold text-ink">The series changes meaning in December 2017.</b> Through September 2017 the counts include personnel deployed in support of contingency operations; from December 2017
              they count only personnel permanently assigned to a location. A drop across that line is a change in what is counted, not a withdrawal, so no change is shown across it.
            </p>
            <p>
              <b className="font-semibold text-ink">“Not reported” is not zero.</b> From December 2017 to September 2021 the table prints Afghanistan, Iraq and Syria blank; those hosts are shown as not reported and add
              nothing to the totals. The Army did not report in December 2022, March 2023 or June 2023, so those quarters have no all-branch or Army figure. Counts below 10 are real but tiny; the table keeps every host.
            </p>
            <p>
              <b className="font-semibold text-ink">Abroad</b> means active-duty personnel at a foreign host plus the “afloat and unassigned” rows, and leaves out U.S. territories (Guam, Puerto Rico, American Samoa, the Northern
              Mariana Islands and the U.S. Virgin Islands), which DMDC lists among overseas locations. Regions are fixed groupings of countries; Turkey and Greenland count as Europe, Egypt as the Middle East, and North Africa
              and Djibouti as Africa.
            </p>
          </HowToRead>
        </PageHeader>

        <TroopsChartCard />

        <MapCard map={map} />

        <p className="m-0 text-[0.8rem] leading-[1.6] text-ink-muted">
          Source: U.S. Department of Defense, Defense Manpower Data Center (DMDC), active-duty personnel by duty location and service, quarterly from September 2008 (annual through 2012), data through {dateLabel(payload.dataThrough)}. Public
          domain. Space Force is counted with the Air Force (“Air &amp; Space Force”) so the branch is comparable across September 2023, when DMDC started reporting it separately. Coast Guard personnel are included in
          “All branches”. Each quarter is colored by the administration in office on its last day.
        </p>
      </main>
    </TroopsStateProvider>
  );
}
