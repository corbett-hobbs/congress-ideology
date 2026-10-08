"use client";

import { useRef, useState } from "react";
import { SetBackLink } from "@/components/BackLinkContext";
import type { JusticeProfile } from "@/lib/justice-types";
import { JusticeVotesCard, type JusticeVotesSource } from "./JusticeVotesCard";
import { JusticeHeader } from "./JusticeHeader";
import { ChartLegend, JusticeOverTimeChart, STACKED_CHART_HEIGHT } from "./JusticeOverTimeChart";
import { JusticeRosterCard } from "./JusticeRosterCard";
import type { JusticeMode } from "./justice-mode";

/**
 * A justice's profile page: identity row, then two cards side by side (the
 * chart over time, and the swarm + roster); the score note is the chart card's
 * collapsed "How to read this"; then, for a justice with argued-case votes, the
 * table of how they voted.
 *
 * Equal card heights without blank space (the known-hard part): the grid is
 * `md:items-stretch`. The RIGHT card has a fixed content height (same swarm in
 * both modes, a four-row roster viewport), so it sets the row. The LEFT card's
 * chart lives in a `flex-1` wrapper and is absolutely filled, so its own size
 * never drives the row — it fills what the right card leaves. Below md the cards
 * stack and the chart is a fixed height. `scripts/check-justice-layout.mjs`
 * asserts this in a real browser at 1280 / 1024 / 768 / 390.
 */
export function JusticeProfileView({ profile, votes }: { profile: JusticeProfile; votes: JusticeVotesSource | null }) {
  const [mode, setMode] = useState<JusticeMode>("alongside");
  const { chart } = profile;
  const chartBox = useRef<HTMLDivElement>(null);
  /**
   * The chart's height when "How to read this" was opened. The chart box is `flex-1`, so without this it would shrink to make room
   * for the paragraph and the card would stay the same height; holding it makes the card, and with it the roster card beside it,
   * grow by the paragraph.
   */
  const [heldHeight, setHeldHeight] = useState<number | null>(null);

  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-7 px-4 pb-16 pt-9 sm:px-6 sm:pt-11">
      <SetBackLink href="/supreme-court/ideology" />

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
            ref={chartBox}
            className="relative md:h-auto md:min-h-[300px] md:flex-1"
            style={{ height: STACKED_CHART_HEIGHT, minHeight: heldHeight ?? undefined }}
          >
            <JusticeOverTimeChart profile={profile} mode={mode} />
          </div>
          <ChartLegend profile={profile} />
          <details className="mt-3 text-[0.78rem] leading-relaxed text-ink-muted">
            <summary
              className="cursor-pointer font-medium text-ink"
              onClick={(e) => {
                const opening = !(e.currentTarget.parentElement as HTMLDetailsElement).open;
                setHeldHeight(opening ? (chartBox.current?.offsetHeight ?? null) : null);
              }}
            >
              How to read this
            </summary>
            <p className="m-0 mt-2">
              Martin&ndash;Quinn scores place each justice on a single
              liberal&ndash;conservative dimension, estimated from their votes
              across terms, with scores allowed to shift from one term to the
              next. Higher is more conservative. The shaded band is the credible
              interval: wider when the record is thin, especially in a
              justice&rsquo;s first terms, and narrower as votes accumulate.
            </p>
          </details>
        </section>

        <div data-testid="roster-card" className="flex min-w-0 flex-col [&>section]:flex-1">
          <JusticeRosterCard profile={profile} mode={mode} onMode={setMode} />
        </div>
      </section>

      {votes && <JusticeVotesCard justiceId={profile.justice.id} last={profile.last} source={votes} />}

      <footer>
        <p className="m-0 text-[0.8rem] leading-[1.6] text-ink-muted">
          Scores: Martin, Andrew D. and Kevin M. Quinn. 2002. &ldquo;Dynamic
          Ideal Point Estimation via Markov Chain Monte Carlo for the U.S.
          Supreme Court, 1953&ndash;1999.&rdquo; Political Analysis
          10:134&ndash;153, from{" "}
          <a
            href="https://mqscores.wustl.edu/"
            rel="noopener"
            className="text-accent underline underline-offset-2"
          >
            mqscores.wustl.edu
          </a>
          . Appointment data: Federal Judicial Center
          biographical directory. Biographies: Wikipedia, text abridged, under
          CC BY-SA 4.0. Portraits: public-domain images via Wikimedia Commons.
        </p>
      </footer>
    </main>
  );
}
