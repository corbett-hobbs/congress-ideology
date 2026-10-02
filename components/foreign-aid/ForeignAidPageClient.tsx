"use client";

import { PageHeader } from "@/components/PageHeader";
import type { WorldMapFile } from "@/lib/foreign-aid-entities";
import type { AidPayload } from "@/lib/foreign-aid-types";
import { ForeignAidFilterBar } from "./ForeignAidFilterBar";
import { AidStateProvider } from "./ForeignAidState";
import { FirstPlaceCard } from "./FirstPlaceCard";
import { MapAndRanked } from "./MapAndRanked";
import { SpendingCard } from "./SpendingCard";
import { MethodologyNote } from "@/components/MethodologyNote";

const dateLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export function ForeignAidPageClient({ payload, map }: { payload: AidPayload; map: WorldMapFile }) {
  const first = payload.years[0];
  const last = payload.years[payload.years.length - 1];
  const partial = payload.partialYears.map((y) => `FY${y}`);
  return (
    <AidStateProvider payload={payload}>
      <ForeignAidFilterBar />
      <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-4 pb-16 pt-7 sm:px-6">
        <PageHeader eyebrow="Presidency · Foreign aid" title="Where Does U.S. Foreign Aid Go?">
          <p>
            ForeignAssistance.gov tracks what the U.S. government actually pays out to other countries and to global and regional
            programs. This page follows those disbursements, in nominal dollars, by fiscal year (October 1 to September 30) from FY
            {first} through FY{last}. Pick a year with the slider, or click or drag along the spending chart, and the map, the country
            rankings and the No. 1 strip all move with it. The filters narrow everything to one president’s years, one country or one
            sector.
          </p>
        </PageHeader>

        <SpendingCard />

        <MapAndRanked map={map} />

        <FirstPlaceCard />

        <MethodologyNote className="mt-0">
        <p>
          Source: ForeignAssistance.gov, disbursements in nominal dollars, data through {dateLabel(payload.dataThrough)}. A fiscal year runs October 1 to
          September 30, and each year is colored by the administration in office for most of it.
          {partial.length > 0 &&
            ` ${partial.join(" and ")} ${partial.length > 1 ? "are" : "is"} shown as partial because the source reports with a lag of about 45 days and publishes no per-year completeness flag, so changes from the prior year aren’t shown for ${partial.length > 1 ? "them" : "it"}.`}{" "}
          Negative disbursements are documented source adjustments and are kept as published. Military assistance is recorded almost entirely within
          Peace and Security; it is a split of that sector, not a separate one, and the map’s military share counts every military dollar when Sector is
          All and only Peace and Security’s own when that sector is picked. The map shows only dollars tied to a single country, and global and regional
          programs are listed beneath it. Sudan (former) is drawn on today’s Sudan and South Sudan, and West Bank and Gaza on the Palestine outline.
          Entities with no modern outline, such as Czechoslovakia (former), are counted in totals but not drawn.
        </p>
        </MethodologyNote>
      </main>
    </AidStateProvider>
  );
}
