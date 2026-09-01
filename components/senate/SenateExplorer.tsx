"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ChamberCurrent, MemberSearchEntry } from "@/lib/congress-types";
import { plottableSorted } from "@/lib/congress-types";
import { chamberFullName, chamberLabel, memberNoun } from "@/lib/chamber";
import { memberPath } from "@/lib/member-url";
import { stateName } from "@/lib/states";
import { useChamberHistory, useExplorerUrl } from "@/lib/use-chamber";
import { CongressControls } from "./CongressControls";
import { CompassChart } from "./CompassChart";
import { BeeswarmChart } from "./BeeswarmChart";
import { Legend } from "./Legend";
import { ReadingPanel } from "./ReadingPanel";
import { TrendChart, type TrendMode } from "./TrendChart";
import { buildDelegations, DelegationChart, type DelegationSort } from "./DelegationChart";
import { SenatorSearch } from "./SenatorSearch";
import { StateFilter } from "./StateFilter";
import { SenateTableModal } from "./SenateTableModal";
import { SiteFooter } from "./SiteFooter";
import { ordinal } from "./format";

const PLAY_INTERVAL_MS = 260;
const PRELOAD_DELAY_MS = 1500;

function Panel({
  label,
  action,
  children,
  id,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-[4.5rem] rounded-[10px] border border-line bg-surface p-[1.1rem_1.25rem_1.25rem]"
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

interface ExplorerProps {
  senate: ChamberCurrent;
  house: ChamberCurrent;
  search: MemberSearchEntry[];
}

export function SenateExplorer({ senate, house, search }: ExplorerProps) {
  const router = useRouter();
  const { chamber, stateFilter, setStateFilter } = useExplorerUrl();
  const current = chamber === "house" ? house : senate;
  const { latestCongress, minCongress } = current;

  const [congress, setCongress] = useState(latestCongress);
  const [playing, setPlaying] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [delegSort, setDelegSort] = useState<DelegationSort>("gap");
  const [trendMode, setTrendMode] = useState<TrendMode>(chamber);
  const [tableOpen, setTableOpen] = useState(false);

  // The scrub-through-time payload loads on demand (it is ~1.3 MB for the House).
  const [historyNeeded, setHistoryNeeded] = useState(false);
  const { history, loading } = useChamberHistory(chamber, historyNeeded);
  useEffect(() => {
    const t = setTimeout(() => setHistoryNeeded(true), PRELOAD_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  // Reset to the current Congress whenever the chamber changes (adjust state
  // during render — the pattern React recommends over a setState-in-effect).
  const [prevChamber, setPrevChamber] = useState(chamber);
  if (prevChamber !== chamber) {
    setPrevChamber(chamber);
    setCongress(latestCongress);
    setPlaying(false);
    setHoveredId(null);
    // The party-means chart follows the chamber switcher unless the reader has
    // since picked a specific comparison.
    setTrendMode(chamber);
  }

  const atLatest = congress === latestCongress;
  const historyPending = !atLatest && (!history || history.chamber !== chamber);

  const plottable = useMemo(() => {
    if (atLatest) return current.plottable;
    if (historyPending) return [];
    return plottableSorted(history!.allByCongress[congress] ?? []);
  }, [atLatest, historyPending, current.plottable, history, congress]);

  const histMembers =
    !atLatest && history?.chamber === chamber
      ? (history.allByCongress[congress] ?? [])
      : [];

  const stateOptions = useMemo(
    () =>
      [...new Set(current.all.map((m) => m.state))].sort((a, b) =>
        stateName(a).localeCompare(stateName(b)),
      ),
    [current.all],
  );

  const stateMembers = useMemo(
    () => (stateFilter ? plottable.filter((m) => m.state === stateFilter) : plottable),
    [plottable, stateFilter],
  );

  const goToCongress = useCallback((c: number) => {
    setHistoryNeeded(true);
    setCongress(c);
    setHoveredId(null);
  }, []);

  useEffect(() => {
    if (!playing) return;
    if (historyPending) return; // wait for history before advancing
    const id = setTimeout(() => {
      if (congress >= latestCongress) setPlaying(false);
      else goToCongress(congress + 1);
    }, PLAY_INTERVAL_MS);
    return () => clearTimeout(id);
  }, [playing, historyPending, congress, latestCongress, goToCongress]);

  const togglePlay = useCallback(() => {
    setHistoryNeeded(true);
    setPlaying((p) => {
      if (!p && congress >= latestCongress) {
        setCongress(minCongress);
        setHoveredId(null);
      }
      return !p;
    });
  }, [congress, latestCongress, minCongress]);

  const stopAnd = useCallback((fn: () => void) => {
    setPlaying(false);
    fn();
  }, []);

  const hovered = plottable.find((m) => m.bioguideId === hoveredId) ?? null;
  const shown = stateFilter ? stateMembers : plottable;
  const mostLiberal = shown[0];
  const mostConservative = shown[shown.length - 1];

  const noun = memberNoun(chamber);
  const nounPlural = memberNoun(chamber, { plural: true });
  const congressLabel = `${ordinal(congress)} Congress`;
  const spanYears = (latestCongress - minCongress) * 2 + 2;
  const isHouse = chamber === "house";
  const delegMode = isHouse ? "range" : "pair";

  const { summary } = useMemo(
    () => buildDelegations(plottable, delegMode),
    [plottable, delegMode],
  );

  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-7 px-6 pb-16 pt-9">
      <header className="max-w-[52rem]">
        <p className="mb-2 font-mono text-[0.72rem] uppercase tracking-[0.12em] text-accent">
          DW‑NOMINATE · {chamberFullName(chamber)}, {ordinal(minCongress)}–
          {ordinal(latestCongress)} Congress
        </p>
        <h1 className="mb-[0.6rem] text-balance font-serif text-[clamp(2.1rem,4.2vw,3rem)] font-semibold leading-[1.05] tracking-[-0.01em]">
          The Ideology Space
        </h1>
        <p className="max-w-[42rem] text-pretty text-[1.02rem] leading-[1.55] text-ink-muted">
          Every {noun}&rsquo;s roll-call votes reduced to two coordinates —
          economic left–right on one axis, a second cross-cutting dimension on
          the other. Scrub through {spanYears} years of Congresses to watch the
          chamber pull apart, or pick a state to see its delegation.
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
        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          <StateFilter states={stateOptions} />
          <SenatorSearch entries={search} noun={noun} />
        </div>
      </CongressControls>

      <section className="grid grid-cols-1 items-start gap-5 md:grid-cols-[minmax(0,1fr)_15.5rem]">
        <div className="relative rounded-[10px] border border-line bg-surface p-[1.25rem_1.25rem_0.75rem]">
          {stateFilter && (
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.82rem]">
              <span className="font-medium text-ink">
                {stateName(stateFilter)} · {stateMembers.length}{" "}
                {stateMembers.length === 1 ? noun : nounPlural}
                {" in the "}
                {ordinal(congress)} {chamberLabel(chamber)}
              </span>
              <button
                type="button"
                onClick={() => setStateFilter(null)}
                className="text-accent hover:underline"
              >
                Show the whole chamber
              </button>
            </div>
          )}

          {historyPending ? (
            <div className="grid h-[280px] place-items-center text-[0.85rem] text-ink-faint">
              {loading ? "Loading history…" : "Scrubbing loads the full history"}
            </div>
          ) : stateFilter && isHouse ? (
            <BeeswarmChart members={stateMembers} highlightId={hovered?.bioguideId} />
          ) : stateFilter ? (
            <DelegationChart members={plottable} filterState={stateFilter} mode="pair" />
          ) : (
            <CompassChart
              members={plottable}
              highlightedId={hoveredId}
              onHover={(m) => m && setHoveredId(m.bioguideId)}
              onSelect={(m) => router.push(memberPath(m))}
            />
          )}

          <div className="flex items-center justify-between px-[0.1rem] pb-[0.9rem] pt-[0.15rem] font-mono text-[0.62rem] text-ink-faint sm:text-[0.68rem]">
            <span>← more liberal</span>
            <span className="hidden font-sans tracking-[0.03em] text-ink-muted sm:inline">
              Dimension 1 · economic left–right
            </span>
            <span>more conservative →</span>
          </div>
          <Legend members={shown} />
        </div>

        <ReadingPanel
          congressLabel={congressLabel}
          seatsShown={shown.length}
          mostLiberal={mostLiberal}
          mostConservative={mostConservative}
        />
      </section>

      <Panel
        label={`Party means, dimension 1 · 1789–${1789 + (latestCongress - 1) * 2 + 2}`}
        action={
          <div
            className="flex flex-none flex-wrap gap-[0.4rem]"
            role="group"
            aria-label="Trend chambers"
          >
            {(
              [
                ["senate", "Senate"],
                ["house", "House"],
                ["both", "Both"],
              ] as const
            ).map(([m, text]) => (
              <button
                key={m}
                type="button"
                onClick={() => setTrendMode(m)}
                aria-pressed={trendMode === m}
                className={`rounded-md border px-[0.6rem] py-[0.3rem] text-[0.72rem] font-medium transition-colors ${
                  trendMode === m
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
        <p className="mb-2 mt-1 max-w-[44rem] text-[0.76rem] text-ink-faint">
          Per-Congress means (nokken–poole), so real drift shows. Click to jump.
          {trendMode === "both" ? " House is dashed." : ""}
        </p>
        <div className="-mx-2 overflow-x-auto px-2">
          <div className="min-w-[40rem] sm:min-w-0">
            <TrendChart
              senateTrend={senate.trend}
              houseTrend={house.trend}
              mode={trendMode}
              minCongress={Math.min(senate.minCongress, house.minCongress)}
              maxCongress={Math.max(senate.latestCongress, house.latestCongress)}
              congress={congress}
              onScrub={(c) => stopAnd(() => goToCongress(c))}
            />
          </div>
        </div>
      </Panel>

      <Panel
        id="delegation"
        label={
          isHouse
            ? "Delegation spread · each state's House members on dimension 1"
            : "Delegation alignment · each state's two senators, dimension 1"
        }
        action={
          <div
            className="flex flex-none gap-[0.4rem]"
            role="group"
            aria-label="Sort delegations"
          >
            {(
              [
                ["gap", isHouse ? "Widest spread" : "Most divided"],
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
          {isHouse
            ? `Each bar runs from a state's most-liberal to most-conservative House member in the ${ordinal(congress)} Congress; the right-hand count is the D/R split. Click a row for the full beeswarm.`
            : `${summary.shown} of ${summary.totalStates} states show a full two-senator pairing in the ${ordinal(congress)} Congress${
                summary.omitted > 0
                  ? `; ${summary.omitted} omitted (a seat held by no one long enough to score)`
                  : ""
              }. Click a row to filter to that state.`}
        </p>
        <div className="max-h-[32rem] overflow-auto border-t border-line pt-[0.4rem]">
          {historyPending ? (
            <p className="p-4 text-[0.85rem] text-ink-faint">Loading…</p>
          ) : (
            <div className="min-w-[50rem] sm:min-w-0">
              <DelegationChart
                members={plottable}
                sort={delegSort}
                mode={delegMode}
                onSelectState={(s) => setStateFilter(s)}
              />
            </div>
          )}
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
        senateMembers={atLatest ? senate.all : chamber === "senate" ? histMembers : []}
        houseMembers={atLatest ? house.all : chamber === "house" ? histMembers : []}
        activeChamber={chamber}
        stateFilter={stateFilter}
        onClose={() => setTableOpen(false)}
      />
    </main>
  );
}
