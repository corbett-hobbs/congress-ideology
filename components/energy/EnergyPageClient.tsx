"use client";

import { useMemo } from "react";
import { HowToRead } from "@/components/HowToRead";
import { PageHeader } from "@/components/PageHeader";
import { EIA_ATTRIBUTION } from "@/lib/energy-entities";
import { dateText, termAtDay } from "@/lib/energy-derive";
import type { EnergyPayload } from "@/lib/energy-types";
import { dateOfDay, dayOf, MONTH_NAMES } from "@/lib/indicator-time";
import { termLabel } from "@/lib/trade-chart";
import { ElectricityCard } from "./ElectricityCard";
import { EnergyFilterBar } from "./EnergyFilterBar";
import { activeDay, EnergyStateProvider, useEnergyActions, useEnergyValues } from "./EnergyState";
import { LngCard } from "./LngCard";
import { OilCard } from "./OilCard";
import { SprCard } from "./SprCard";

export function EnergyPageClient({ payload }: { payload: EnergyPayload }) {
  return (
    <EnergyStateProvider>
      <EnergyPage payload={payload} />
    </EnergyStateProvider>
  );
}

const longDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

function EnergyPage({ payload }: { payload: EnergyPayload }) {
  const v = useEnergyValues();
  const { setRange, clearPin } = useEnergyActions();
  const firstYear = dateOfDay(0).year;
  const lastYear = dateOfDay(payload.span - 1).year;
  const range = useMemo<[number, number]>(() => v.range ?? [firstYear, lastYear], [v.range, firstYear, lastYear]);
  const view = useMemo<[number, number]>(() => [dayOf(range[0], 0, 1), Math.min(payload.span, dayOf(range[1] + 1, 0, 1))], [range, payload.span]);

  const pinDay = activeDay({ hover: null, pin: v.pin });
  const announcement = (() => {
    if (pinDay === null) return "";
    const { year, month } = dateOfDay(pinDay);
    const t = termAtDay(payload.terms, pinDay);
    return `Pinned ${MONTH_NAMES[month]} ${year}${t ? `, ${termLabel(t)}` : ""}.`;
  })();

  return (
    <>
      <EnergyFilterBar terms={payload.terms} range={range} firstYear={firstYear} lastYear={lastYear} onRange={setRange} canClear={v.pin !== null} onClear={clearPin} />
      <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 pb-16 pt-7 sm:px-6">
        <div aria-live="polite" className="sr-only">
          {announcement}
        </div>
        <PageHeader title="How Has U.S. Energy Changed?">
          <p>
            The Strategic Petroleum Reserve, where oil comes from and where it goes, where electricity comes from, and liquefied natural gas exports, since 1991. The colored bar under each
            chart shows who was president, the gray columns mark recessions, and the marked dates are executive, congressional and agency actions. These are conditions during each term, not a score of what any one official caused.
          </p>
          <HowToRead>
            <p>
              The cards are not equally tied to Washington. The reserve’s level is the closest to a presidential decision, and even it is shared: presidents authorize emergency releases and exchanges, while
              Congress mandates sales, cancels them and funds refills, so each mark says who acted and whether oil was sold, lent or bought back. Oil production, imports, exports and liquefied natural gas
              exports are shaped by policy but mostly move with markets and technology, and the rules that enabled them often came years before the trade did; a mark on those charts reads “enabled, not caused.” Products supplied
              (a stand-in for consumption) and the electricity mix are context: prices, weather, demand and decades-long build cycles set them.
            </p>
            <p>
              Monthly figures are not seasonally adjusted. The hatched stretch at the right of a chart is preliminary and may be revised. Figures are as of {longDate(payload.fetchedAt)}; each chart ends at its newest published month.
              The marked actions were last reviewed on {dateText(payload.flagsReviewed)}.
            </p>
          </HowToRead>
        </PageHeader>

        <SprCard payload={payload} view={view} />
        <OilCard payload={payload} view={view} />
        <ElectricityCard payload={payload} view={view} />
        <LngCard payload={payload} view={view} />

        <p className="m-0 text-[0.8rem] leading-[1.6] text-ink-muted">
          {EIA_ATTRIBUTION}, Monthly Energy Review, Petroleum Supply Monthly, Electric Power Monthly and Natural Gas Monthly, retrieved {longDate(payload.fetchedAt)}. Policy actions are hand-curated from Department of
          Energy, Federal Register and govinfo.gov pages. Presidential terms and recession dates match the Economy page.
        </p>
      </main>
    </>
  );
}
