"use client";

import { useMemo, useState } from "react";
import { HowToRead } from "@/components/HowToRead";
import { PageHeader } from "@/components/PageHeader";
import type { ChamberView } from "@/lib/chamber";
import { SLIDER_BOUNDS, windowRows } from "@/lib/demographics-chart";
import type { DemographicsPayload } from "@/lib/demographics-types";
import type { YearRange } from "@/lib/year-range";
import { AgeCard } from "./AgeCard";
import { DemographicsFilterBar } from "./DemographicsFilterBar";
import { StatStrip } from "./StatStrip";
import { TenureCard } from "./TenureCard";
import { WomenCard } from "./WomenCard";

/**
 * /congress/demographics. Page state: the chamber view, the years-shown window, and one pinned Congress that all three
 * charts share (a dashed playhead and the readout above each chart). The charts draw only the Congresses whose first
 * year is in the window.
 */
export function DemographicsPageClient({ data }: { data: DemographicsPayload }) {
  const [view, setView] = useState<ChamberView>("both");
  const [range, setRange] = useState<YearRange>(SLIDER_BOUNDS);
  const [pin, setPin] = useState<number | null>(null);
  const all = data.views[view];
  const rows = useMemo(() => windowRows(all, range), [all, range]);
  // A pin that has left the window is simply not shown (and comes back if the window widens).
  const livePin = rows.some((r) => r.congress === pin) ? pin : null;
  // The stat strip follows the pinned Congress; with none pinned it shows the latest.
  const shown = all.find((r) => r.congress === livePin) ?? all[all.length - 1];

  return (
    <>
      <DemographicsFilterBar view={view} onView={setView} rows={data.views.both} presidents={data.presidents} range={range} onRange={setRange} />
      <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 pb-16 pt-7 sm:px-6">
        <PageHeader eyebrow="Congress · Demographics" title="Who Serves in Congress?">
          <p>
            How old are the people who hold seats in Congress, how many of them are women, and how long have they been there? These charts follow every voting member of each Congress since 1933 and show how those answers have changed over time. Use the chamber switch to compare the House and Senate, and the years slider or the presidential terms under it to zoom in.
          </p>
          <HowToRead>
            <p>
              Each bar or point is one Congress and counts everyone who held a seat at any time in its two years, so mid-term replacements are included. The strip under each chart shows the president in office on the Congress&rsquo;s first day, tinted by party. Click a Congress to pin it across all three charts.
            </p>
          </HowToRead>
        </PageHeader>

        <StatStrip row={shown} />

        <AgeCard rows={rows} presidents={data.presidents} pin={livePin} onPin={setPin} />
        <WomenCard rows={rows} presidents={data.presidents} pin={livePin} onPin={setPin} />
        <TenureCard rows={rows} presidents={data.presidents} pin={livePin} onPin={setPin} />

        <p className="m-0 text-[0.8rem] leading-[1.6] text-ink-muted">
          Source: member biographies and terms from the @unitedstates/congress-legislators project; Congress membership lists from Voteview (Lewis, Poole, Rosenthal, Boche, Rudkin &amp; Sonnet). Voting members only: delegates and resident commissioners are not counted.
        </p>
      </main>
    </>
  );
}
