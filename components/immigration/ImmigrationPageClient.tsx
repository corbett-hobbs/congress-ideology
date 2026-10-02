"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { filterYears, type ImmigrationPageData } from "@/lib/immigration-derive";
import { coverageLabel } from "@/lib/removals-country-derive";
import type { RemovalsCountryPayload } from "@/lib/removals-country-types";
import { ImmigrationFilterBar } from "./ImmigrationFilterBar";
import { RemovalsCard } from "./RemovalsCard";
import { RemovalsCountryCard } from "./RemovalsCountryCard";

const asOfLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export function ImmigrationPageClient({ data, countries, worldMap }: { data: ImmigrationPageData; countries: RemovalsCountryPayload; worldMap: { width: number; height: number; features: { key: string; name: string; d: string }[] } }) {
  // Two pieces of page state: the President selection ("all" or a term id) filters the timeline, and the
  // fiscal year (the pinned slider) picks the year the country list shows and is marked on the timeline.
  const covered = useMemo(() => new Set(countries.years.map((y) => y.fy)), [countries]);
  const windowFor = (sel: string): [number, number] => {
    const fys = filterYears(data.years, sel).map((y) => y.fy);
    return [Math.min(...fys), Math.max(...fys)];
  };
  // The newest year in the window that has a country table, else the window's last year.
  const pickYear = (r: readonly [number, number]) => {
    for (let f = r[1]; f >= r[0]; f--) if (covered.has(f)) return f;
    return r[1];
  };
  const [selection, setSelectionState] = useState("all");
  const [fy, setFy] = useState(() => pickYear(windowFor("all")));
  const fyRange = windowFor(selection);
  const setSelection = (sel: string) => {
    setSelectionState(sel);
    setFy(pickYear(windowFor(sel)));
  };
  return (
    <>
      <ImmigrationFilterBar terms={data.terms} value={selection} onChange={setSelection} fy={fy} fyRange={fyRange} onFy={setFy} />
      <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 pb-16 pt-7 sm:px-6">
        <PageHeader eyebrow="Presidency · Immigration" title="How Many People Does ICE Remove?">
          <p>
            ICE publishes a fiscal-year count of the people it removes from the United States. Since FY2007 that count
            also includes returns — voluntary returns, voluntary departures and withdrawals under docket control — so it
            runs higher than a tally of formal removals alone. Each bar below is one fiscal year (October to September),
            colored by the administration in office for most of it; pick a president to show only that administration’s
            years, and use the fiscal-year slider (or click a bar) to choose the year whose countries are listed below. ICE has changed what it counts several times, so numbered markers on the timeline show where one era
            stops being directly comparable to the next; hover or tap a number to see what changed.
          </p>
        </PageHeader>

        <RemovalsCard data={data} selection={selection} fy={fy} onFy={setFy} />

        <RemovalsCountryCard payload={countries} fy={fy} worldMap={worldMap} />

        <p className="m-0 text-[0.8rem] leading-[1.6] text-ink-muted">
          Source: U.S. Immigration and Customs Enforcement removal statistics, FY{data.firstFy}–FY{data.lastFy} (FY
          {data.lastFy} from the DHS FY2027 ICE budget overview). Data as of {asOfLabel(data.asOf)}. Each fiscal year is
          assigned to the administration in office for most of it; inauguration-year splits are shown on the year’s card.
          The country list uses the removals-by-country-of-citizenship tables in ICE’s annual reports ({coverageLabel(countries)}); each year’s
          countries add up to that year’s ICE total. Countries are countries of citizenship, not destinations. One agency, one definition: ICE
          only, never combined with Border Patrol or DHS-wide counts.
        </p>
      </main>
    </>
  );
}
