"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { mean } from "d3-array";
import type { ChamberCurrent, MemberSearchEntry } from "@/lib/congress-types";
import { congressStartYear, plottableSorted } from "@/lib/congress-types";
import { chamberFullName, chamberLabel, memberNoun } from "@/lib/chamber";
import { memberPath } from "@/lib/member-url";
import { stateName } from "@/lib/states";
import { useChamberHistory, useExplorerUrl } from "@/lib/use-chamber";
import { dim2Context } from "@/lib/dim2-context";
import { CongressControls } from "./CongressControls";
import { CompassChart } from "./CompassChart";
import { BeeswarmChart } from "./BeeswarmChart";
import { Dim2Footnote } from "./Dim2Footnote";
import { Legend } from "./Legend";
import { ReadingPanel } from "./ReadingPanel";
import { TrendChart } from "./TrendChart";
import { buildDelegations, DelegationChart, type DelegationSort } from "./DelegationChart";
import { SenatorSearch } from "./SenatorSearch";
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
      className="scroll-mt-[7rem] rounded-[10px] border border-line bg-surface p-[1.1rem_1.25rem_1.25rem]"
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
  const [tableOpen, setTableOpen] = useState(false);

  // The scrub-through-time payload loads on demand (it is ~1.3 MB for the House).
  // A state filter also needs it immediately, for that state's trend overlay
  // (which spans every Congress, not just the one currently shown).
  const [historyNeeded, setHistoryNeeded] = useState(false);
  const { history, loading } = useChamberHistory(
    chamber,
    historyNeeded || stateFilter != null,
  );
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

  const stateMembers = useMemo(
    () => (stateFilter ? plottable.filter((m) => m.state === stateFilter) : plottable),
    [plottable, stateFilter],
  );

  // The selected state's delegation, per Congress — an overlay on the
  // national trend, not a replacement for it (a 1-3 member "party mean"
  // isn't a meaningful trend on its own). Needs the full history regardless
  // of which Congress is currently shown.
  const stateTrend = useMemo(() => {
    if (!stateFilter || !history || history.chamber !== chamber) return [];
    return history.congresses.map((c) => {
      const members = (history.allByCongress[c] ?? []).filter(
        (m) => m.state === stateFilter && m.dim1 != null,
      );
      const meanOf = (group: "dem" | "rep") => {
        const vals = members
          .filter((m) => m.group === group)
          .map((m) => m.dim1 as number);
        return vals.length ? (mean(vals) ?? null) : null;
      };
      return {
        congress: c,
        year: congressStartYear(c),
        dem: meanOf("dem"),
        rep: meanOf("rep"),
      };
    });
  }, [stateFilter, history, chamber]);

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
  const overlayVisible = stateFilter != null;
  const smallSample =
    overlayVisible && stateMembers.length > 0 && stateMembers.length <= 3;

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
          Congressional Ideology
        </h1>
        <p className="max-w-[42rem] text-pretty text-[1.02rem] leading-[1.55] text-ink-muted">
          Use the toolbar up top to switch between the House and the Senate, or
          to focus on a single state&rsquo;s delegation. Below, every{" "}
          {noun}&rsquo;s roll-call votes are reduced to two coordinates —
          economic left–right on one axis, a second cross-cutting dimension on
          the other — and the slider scrubs through {spanYears} years of
          Congresses to watch the chamber pull apart.
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
        <SenatorSearch entries={search} noun={noun} />
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
              dim2NoteHint={dim2Context(congress).markerHint}
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

          {!stateFilter && !historyPending && (
            <Dim2Footnote congress={congress} />
          )}
        </div>

        <ReadingPanel
          congressLabel={congressLabel}
          seatsShown={shown.length}
          mostLiberal={mostLiberal}
          mostConservative={mostConservative}
        />
      </section>

      <Panel
        label={`${chamberLabel(chamber)} party means, dimension 1 · 1789–${1789 + (latestCongress - 1) * 2 + 2}`}
      >
        <p className="mb-2 mt-1 max-w-[44rem] text-[0.76rem] text-ink-faint">
          Per-Congress means (nokken–poole), so real drift shows. Click to jump.
          {overlayVisible &&
            ` Solid lines are ${stateName(stateFilter as string)}'s ${chamberLabel(chamber)} delegation; the dotted lines behind them are the national mean.`}
        </p>
        {smallSample && (
          <p className="mb-2 max-w-[44rem] text-[0.76rem] text-ink-faint italic">
            {stateName(stateFilter as string)}&rsquo;s overlay reflects just{" "}
            {stateMembers.length} {stateMembers.length === 1 ? noun : nounPlural}{" "}
            — expect it to look noisier than the national lines, which average many more.
          </p>
        )}
        <TrendChart
          trend={current.trend}
          minCongress={minCongress}
          maxCongress={latestCongress}
          congress={congress}
          onScrub={(c) => stopAnd(() => goToCongress(c))}
          stateOverlay={
            overlayVisible && stateFilter
              ? { trend: stateTrend, label: stateName(stateFilter) }
              : null
          }
        />
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
        {/* On a phone the whole list scrolls with the page — a scroll region
            inside a scroll region is miserable on touch. Contained on desktop. */}
        <div className="border-t border-line pt-[0.4rem] sm:max-h-[32rem] sm:overflow-y-auto">
          {historyPending ? (
            <p className="p-4 text-[0.85rem] text-ink-faint">Loading…</p>
          ) : (
            <DelegationChart
              members={plottable}
              sort={delegSort}
              mode={delegMode}
              onSelectState={(s) => setStateFilter(s)}
            />
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
