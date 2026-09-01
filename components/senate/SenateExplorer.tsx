"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SenateDataset, SenateMember } from "@/lib/senate-data";
import { senatorPath } from "@/lib/senator-url";
import { CongressControls } from "./CongressControls";
import { CompassChart } from "./CompassChart";
import { Legend } from "./Legend";
import { ReadingPanel } from "./ReadingPanel";
import { TrendChart } from "./TrendChart";
import {
  buildDelegations,
  DelegationChart,
  type DelegationSort,
} from "./DelegationChart";
import { SenatorSearch } from "./SenatorSearch";
import { SenateTableModal } from "./SenateTableModal";
import { SiteFooter } from "./SiteFooter";
import { ordinal } from "./format";

const PLAY_INTERVAL_MS = 260;

function Panel({
  label,
  action,
  children,
  id,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-6 rounded-[10px] border border-line bg-surface p-[1.1rem_1.25rem_1.25rem]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-faint">
          {label}
        </p>
        {action}
      </div>
      {children}
    </section>
  );
}

export function SenateExplorer({ data }: { data: SenateDataset }) {
  const { congresses, latestCongress, byCongress, allByCongress, trend, search } =
    data;
  const minCongress = congresses[0];

  const router = useRouter();
  const [congress, setCongress] = useState(latestCongress);
  const [hovered, setHovered] = useState<SenateMember | null>(null);
  const [playing, setPlaying] = useState(false);
  const [delegSort, setDelegSort] = useState<DelegationSort>("gap");
  const [tableOpen, setTableOpen] = useState(false);

  const members = useMemo(
    () => byCongress[congress] ?? [],
    [byCongress, congress],
  );
  const allMembers = useMemo(
    () => allByCongress[congress] ?? [],
    [allByCongress, congress],
  );
  const mostLiberal = members[0];
  const mostConservative = members[members.length - 1];

  const goToCongress = useCallback((c: number) => {
    setCongress(c);
    setHovered(null);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => {
      if (congress >= latestCongress) setPlaying(false);
      else goToCongress(congress + 1);
    }, PLAY_INTERVAL_MS);
    return () => clearTimeout(id);
  }, [playing, congress, latestCongress, goToCongress]);

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      if (!p && congress >= latestCongress) goToCongress(minCongress);
      return !p;
    });
  }, [congress, latestCongress, minCongress, goToCongress]);

  const stopAnd = useCallback((fn: () => void) => {
    setPlaying(false);
    fn();
  }, []);

  const readingMember = hovered;
  const congressLabel = `${ordinal(congress)} Congress`;
  const spanYears = (latestCongress - minCongress) * 2 + 2;

  const { summary } = useMemo(
    () => buildDelegations(members),
    [members],
  );

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-7 px-6 pb-16 pt-11">
      <header className="max-w-[52rem]">
        <p className="mb-2 font-mono text-[0.72rem] uppercase tracking-[0.12em] text-accent">
          DW‑NOMINATE · U.S. Senate, {ordinal(minCongress)}–{ordinal(latestCongress)} Congress
        </p>
        <h1 className="mb-[0.6rem] text-balance font-serif text-[clamp(2.1rem,4.2vw,3rem)] font-semibold leading-[1.05] tracking-[-0.01em]">
          The Ideology Space
        </h1>
        <p className="max-w-[42rem] text-pretty text-[1.02rem] leading-[1.55] text-ink-muted">
          Every senator&rsquo;s roll-call votes reduced to two coordinates —
          economic left–right on one axis, a second cross-cutting dimension on
          the other. Scrub through {spanYears} years of Congresses to watch the
          chamber pull apart.
        </p>
      </header>

      <CongressControls
        congress={congress}
        min={minCongress}
        max={latestCongress}
        latest={latestCongress}
        playing={playing}
        onCongressChange={(c) => stopAnd(() => goToCongress(c))}
        onTogglePlay={togglePlay}
        onToday={() => stopAnd(() => goToCongress(latestCongress))}
      >
        <SenatorSearch entries={search} />
      </CongressControls>

      <section className="grid grid-cols-1 items-start gap-5 md:grid-cols-[minmax(0,1fr)_15.5rem]">
        <div className="relative rounded-[10px] border border-line bg-surface p-[1.25rem_1.25rem_0.75rem]">
          <CompassChart
            members={members}
            highlightedId={hovered?.bioguideId ?? null}
            onHover={(m) => {
              if (m) setHovered(m);
            }}
            onSelect={(m) => router.push(senatorPath(m))}
          />
          <div className="flex justify-between px-[0.1rem] pb-[0.9rem] pt-[0.15rem] font-mono text-[0.68rem] text-ink-faint">
            <span>← more liberal</span>
            <span className="font-sans tracking-[0.03em] text-ink-muted">
              Dimension 1 · economic left–right
            </span>
            <span>more conservative →</span>
          </div>
          <Legend members={members} />
        </div>

        <ReadingPanel
          member={readingMember}
          congressLabel={congressLabel}
          seatsShown={members.length}
          mostLiberal={mostLiberal}
          mostConservative={mostConservative}
        />
      </section>

      <Panel label={`Party means, dimension 1 · ${1789}–${1789 + (latestCongress - 1) * 2 + 2}`}>
        <p className="mb-2 mt-1 max-w-[44rem] text-[0.76rem] text-ink-faint">
          Per-Congress means (nokken–poole), so real drift shows. Click to jump.
        </p>
        <TrendChart
          trend={trend}
          minCongress={minCongress}
          maxCongress={latestCongress}
          congress={congress}
          onScrub={(c) => stopAnd(() => goToCongress(c))}
        />
      </Panel>

      <Panel
        id="delegation"
        label="Delegation alignment · each state's two senators, dimension 1"
        action={
          <div className="flex flex-none gap-[0.4rem]" role="group" aria-label="Sort delegations">
            {(
              [
                ["gap", "Most divided first"],
                ["az", "A–Z"],
              ] as const
            ).map(([mode, text]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setDelegSort(mode)}
                aria-pressed={delegSort === mode}
                className={`rounded-md border px-[0.65rem] py-[0.32rem] text-[0.72rem] font-medium transition-colors ${
                  delegSort === mode
                    ? "border-accent bg-accent text-accent-ink"
                    : "border-line-strong bg-surface-raised text-ink-muted hover:border-accent"
                }`}
              >
                {text}
              </button>
            ))}
          </div>
        }
      >
        <p className="mb-[0.85rem] mt-[0.4rem] max-w-[44rem] text-[0.76rem] text-ink-faint">
          {summary.shown} of {summary.totalStates} states show a full two-senator
          pairing in the {ordinal(congress)} Congress
          {summary.omitted > 0
            ? `; ${summary.omitted} ${summary.omitted === 1 ? "state is" : "states are"} omitted (a seat held by no one long enough to score).`
            : "."}{" "}
          Where a mid-term change left three senators, the two with the most
          roll-call votes are shown.
        </p>
        <div className="max-h-[32rem] overflow-y-auto border-t border-line pt-[0.4rem]">
          <DelegationChart members={members} sort={delegSort} />
        </div>
      </Panel>

      <SiteFooter>
        <button
          type="button"
          onClick={() => setTableOpen(true)}
          className="rounded-md border border-line-strong px-[0.85rem] py-[0.5rem] text-[0.8rem] font-medium text-accent hover:border-accent"
        >
          View this Congress as a table
        </button>
      </SiteFooter>

      <SenateTableModal
        open={tableOpen}
        congress={congress}
        members={allMembers}
        onClose={() => setTableOpen(false)}
      />
    </div>
  );
}
