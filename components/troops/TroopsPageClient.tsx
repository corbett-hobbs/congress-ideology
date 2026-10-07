"use client";

import { HowToRead } from "@/components/HowToRead";
import { PageHeader } from "@/components/PageHeader";
import type { BasesPayload } from "@/lib/bases-types";
import type { WorldMapFile } from "@/lib/foreign-aid-entities";
import type { TroopsPayload } from "@/lib/troops-types";
import { MapCard } from "./MapCard";
import { TroopsFirstPlaceCard } from "./TroopsFirstPlaceCard";
import { TroopsChartCard } from "./TroopsChartCard";
import { TroopsFilterBar } from "./TroopsFilterBar";
import { TroopsStateProvider } from "./TroopsState";

const dateLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export function TroopsPageClient({ payload, map, bases }: { payload: TroopsPayload; map: WorldMapFile; bases: BasesPayload }) {
  const first = payload.years[0];
  const last = payload.years[payload.years.length - 1];
  return (
    <TroopsStateProvider payload={payload}>
      <TroopsFilterBar />
      <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-4 pb-16 pt-7 sm:px-6">
        <PageHeader eyebrow="Presidency · National security" title="Where Are U.S. Troops Stationed Abroad?">
          <p>
            The Defense Department publishes where its active-duty personnel are assigned to duty, country by country. This page follows those counts year by year from {first.fy} through {last.fy}: how many are stationed abroad,
            in which regions, and which countries host the most. Drag the slider’s handles to choose which years the chart shows, then pick a year from the map’s menu, or click or drag along the chart, and the map and the host rankings move with it. The filters narrow everything to one president’s
            years, one country or one military branch.
          </p>
          <HowToRead>
            <p>
              <b className="font-semibold text-ink">Each bar is one year’s table</b>: the September 30 report (June 30 for 1953–56). The figures come from three sources that count a little differently: DMDC’s location tables from 2008, DMDC’s
              own country tables for 1996 and 1998–2005, and a research compilation of DMDC reports for the rest of 1953–2007. Only the DMDC tables include personnel afloat or unassigned, so a jump where the source changes is not a change
              in troops, and no percent change is shown across one. September 2006 and 2007 are estimates, shown in lighter bars.
            </p>
            <p>
              <b className="font-semibold text-ink">The series changes meaning after 2017.</b> Through the September 2017 table the counts include personnel deployed in support of contingency operations; from the December 2017
              table they count only personnel permanently assigned to a location. A drop across that line is a change in what is counted, not a withdrawal, so no change is shown across it.
            </p>
            <p>
              <b className="font-semibold text-ink">“Not reported” is not zero.</b> In 2003–2005 DMDC’s country tables leave out Iraq, Kuwait and Afghanistan (a separate table covers forces in and around Iraq, drawn as dashed boxes above those
              bars, on a different basis and not in any total). From 2018 to 2021 the tables print Afghanistan, Iraq and Syria blank. Those hosts are shown as not reported and add nothing to the totals. (The Army did not report in
              three quarters of 2022–23, none of them a September, so no year is missing.) The latest year is partial, hatched: the newest quarter published so far.
            </p>
            <p>
              <b className="font-semibold text-ink">Abroad</b> means active-duty personnel at a foreign host plus the “afloat and unassigned” rows where the source has them, and leaves out U.S. territories (Guam, Puerto Rico, American Samoa, the Northern
              Mariana Islands and the U.S. Virgin Islands). Regions are fixed groupings of today’s countries; Turkey and Greenland count as Europe, Egypt as the Middle East, and North Africa and Djibouti as Africa. South Vietnam is shown
              as Vietnam.
            </p>
          </HowToRead>
        </PageHeader>

        <TroopsChartCard />

        <MapCard map={map} bases={bases} />

        <TroopsFirstPlaceCard />

        <p className="m-0 text-[0.8rem] leading-[1.6] text-ink-muted">
          Source: U.S. Department of Defense, Defense Manpower Data Center (DMDC): location tables (September 30 tables from 2008, data through {dateLabel(payload.dataThrough)}) and 309A country tables (1996 and 1998–2005), public domain. 1953–2007
          otherwise from the troopdata compilation (Allen, Flynn and Martinez Machain 2022, <i>Conflict Management and Peace Science</i> 39(3); Kane 2005, Heritage Foundation), GPL-3.0. Space Force is counted with the Air Force (“Air &amp; Space Force”)
          so the branch is comparable across September 2023. Known installations (optional map layer): David Vine’s lists of U.S. bases abroad as compiled in the troopdata package (Flynn), GPL-3.0, one snapshot through {bases.through}. Each year is colored by the president in office on its snapshot date.
        </p>
      </main>
    </TroopsStateProvider>
  );
}
