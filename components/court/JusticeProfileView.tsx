"use client";

import { useState } from "react";
import { SetBackLink } from "@/components/BackLinkContext";
import type { JusticeProfile } from "@/lib/justice-types";
import { AboutScoresCard } from "./AboutScoresCard";
import { JusticeHeader } from "./JusticeHeader";
import { ChartLegend, JusticeOverTimeChart, STACKED_CHART_HEIGHT } from "./JusticeOverTimeChart";
import { JusticeRosterCard } from "./JusticeRosterCard";
import type { JusticeMode } from "./justice-mode";

/**
 * A justice's profile page: identity row, then two cards side by side (the
 * chart over time, and the swarm + roster), then the "About these scores" note.
 *
 * Equal card heights without blank space (the known-hard part): the grid is
 * `md:items-stretch`. The RIGHT card has a fixed content height (same swarm in
 * both modes, a four-row roster viewport), so it sets the row. The LEFT card's
 * chart lives in a `flex-1` wrapper and is absolutely filled, so its own size
 * never drives the row — it fills what the right card leaves. Below md the cards
 * stack and the chart is a fixed height. `scripts/check-justice-layout.mjs`
 * asserts this in a real browser at 1280 / 1024 / 768 / 390.
 */
export function JusticeProfileView({ profile }: { profile: JusticeProfile }) {
  const [mode, setMode] = useState<JusticeMode>("alongside");
  const { chart } = profile;

  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-7 px-4 pb-16 pt-9 sm:px-6 sm:pt-11">
      <SetBackLink href="/supreme-court" />

      <JusticeHeader profile={profile} />

      <section
        aria-label="Ideology"
        className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:items-stretch"
      >
        <section
          aria-label="Ideology over time"
          data-testid="chart-card"
          className="flex min-w-0 flex-col rounded-[10px] border border-line bg-surface p-[1.1rem_1.25rem_1.1rem]"
        >
          <h2 className="font-serif text-[1.05rem] font-medium">Ideology over time</h2>
          <p className="mb-3 mt-1 text-[0.82rem] leading-[1.5] text-ink-muted">
            {chart.subtitle}
          </p>
          <div
            className="relative md:h-auto md:min-h-[300px] md:flex-1"
            style={{ height: STACKED_CHART_HEIGHT }}
          >
            <JusticeOverTimeChart profile={profile} mode={mode} />
          </div>
          <ChartLegend profile={profile} />
        </section>

        <div data-testid="roster-card" className="flex min-w-0 flex-col [&>section]:flex-1">
          <JusticeRosterCard profile={profile} mode={mode} onMode={setMode} />
        </div>
      </section>

      <AboutScoresCard />

      <footer className="border-t border-line pt-6 text-[0.76rem] leading-[1.6] text-ink-faint">
        <p className="m-0 max-w-[46rem]">
          Scores: Martin&ndash;Quinn. Appointment data: Federal Judicial Center
          biographical directory. Biographies: Wikipedia, text abridged, under
          CC BY-SA 4.0. Portraits: public-domain images via Wikimedia Commons.
        </p>
      </footer>
    </main>
  );
}
