"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import type { ImmigrationPageData } from "@/lib/immigration-derive";
import { ImmigrationFilterBar } from "./ImmigrationFilterBar";
import { RemovalsCard } from "./RemovalsCard";

const asOfLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export function ImmigrationPageClient({ data }: { data: ImmigrationPageData }) {
  // One selection ("all" or a term id) drives the chart; no other page state.
  const [selection, setSelection] = useState("all");
  return (
    <>
      <ImmigrationFilterBar terms={data.terms} value={selection} onChange={setSelection} />
      <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 pb-16 pt-7 sm:px-6">
        <PageHeader eyebrow="Presidency · Immigration" title="How Many People Does ICE Remove?">
          <p>
            ICE publishes a fiscal-year count of the people it removes from the United States. Since FY2007 that count
            also includes returns — voluntary returns, voluntary departures and withdrawals under docket control — so it
            runs higher than a tally of formal removals alone. Each bar below is one fiscal year (October to September),
            colored by the administration in office for most of it; pick a president to show only that administration’s
            years. ICE has changed what it counts several times, so numbered markers on the timeline show where one era
            stops being directly comparable to the next; hover or tap a number to see what changed.
          </p>
        </PageHeader>

        <RemovalsCard data={data} selection={selection} />

        <p className="m-0 text-[0.8rem] leading-[1.6] text-ink-muted">
          Source: U.S. Immigration and Customs Enforcement removal statistics, FY{data.firstFy}–FY{data.lastFy} (FY
          {data.lastFy} from the DHS FY2027 ICE budget overview). Data as of {asOfLabel(data.asOf)}. Each fiscal year is
          assigned to the administration in office for most of it; inauguration-year splits are shown on the year’s card.
        </p>
      </main>
    </>
  );
}
