"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { mean } from "d3-array";
import type {
  ChamberCurrent,
  MemberSearchEntry,
  PartyMeanPoint,
} from "@/lib/congress-types";
import { congressStartYear, plottableSorted } from "@/lib/congress-types";
import { chamberLabel, viewNoun } from "@/lib/chamber";
import { memberPath } from "@/lib/member-url";
import { stateName } from "@/lib/states";
import { useChamberHistory, useExplorerUrl } from "@/lib/use-chamber";
import { ExplorerToolbar } from "./ExplorerToolbar";
import { CompassChart } from "./CompassChart";
import { CompassPanel } from "./CompassPanel";
import { BeeswarmChart } from "./BeeswarmChart";
import { Dim2Footnote } from "./Dim2Footnote";
import { Legend } from "./Legend";
import { TrendChart } from "./TrendChart";
import { DelegationChart, type DelegationSort } from "./DelegationChart";
import { SenatorSearch } from "./SenatorSearch";
import { SenateTableModal } from "./SenateTableModal";
import { SiteFooter } from "./SiteFooter";
import { ordinal } from "./format";

const PLAY_INTERVAL_MS = 450;
const PRELOAD_DELAY_MS = 1500;

const INTRO =
  "Political scientists Keith Poole and Howard Rosenthal built DW-NOMINATE to measure ideology from behavior. It looks at every yes-or-no vote a member has ever cast and finds the position that best explains their whole record, so members who vote alike land close together and members who vote oppositely land far apart. Each member ends up with two coordinates, plotted below as one dot — the horizontal position (dimension 1) is the familiar economic left–right spectrum and on its own explains most of how members differ; the vertical position (dimension 2) captures a secondary pattern whose meaning has shifted across history (see the note below the chart). Doing this for every Congress since 1789 turns the slider into a way to watch the chamber pull apart or come together over time, and picking a state shows whether its delegation votes as a bloc or splits down the middle.";

function Card({
  title,
  lede,
  action,
  className,
  children,
}: {
  title: string;
  lede: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`flex flex-col rounded-[10px] border border-line bg-surface p-[1.35rem_1.35rem_1.1rem] ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="font-serif text-[1.05rem] font-medium">{title}</h2>
        {action}
      </div>
      <p className="mb-4 mt-1 text-[0.82rem] leading-[1.5] text-ink-muted">
        {lede}
      </p>
      {children}
    </section>
  );
}

interface ExplorerProps {
  senate: ChamberCurrent;
  house: ChamberCurrent;
  /** Blended party means — the only "both" data that can't be merged client-side. */
  bothTrend: PartyMeanPoint[];
  search: MemberSearchEntry[];
}

export function SenateExplorer({
  senate,
  house,
  bothTrend,
  search,
}: ExplorerProps) {
  const router = useRouter();
  const { view, stateFilter, setStateFilter } = useExplorerUrl();

  // "Both" is just the two chambers' current sets concatenated; the trend is
  // the one piece that needs the server (it's recomputed across the combined
  // per-Congress set, not an average of two averages).
  const both = useMemo<ChamberCurrent>(
    () => ({
      chamber: "both",
      latestCongress: Math.max(senate.latestCongress, house.latestCongress),
      minCongress: Math.min(senate.minCongress, house.minCongress),
      all: [...house.all, ...senate.all],
      plottable: [...house.plottable, ...senate.plottable].sort(
        (a, b) => (a.dim1 as number) - (b.dim1 as number),
      ),
      trend: bothTrend,
    }),
    [senate, house, bothTrend],
  );

  const current = view === "house" ? house : view === "senate" ? senate : both;
  const { latestCongress, minCongress } = current;

  const [congress, setCongress] = useState(latestCongress);
  const [playing, setPlaying] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [delegSort, setDelegSort] = useState<DelegationSort>("gap");
  const [tableOpen, setTableOpen] = useState(false);

  // The scrub-through-time payload loads on demand (~1.3 MB for the House, both
  // chambers for "Both"). A state filter needs it immediately for the overlay.
  const [historyNeeded, setHistoryNeeded] = useState(false);
  const { history, loading } = useChamberHistory(
    view,
    historyNeeded || stateFilter != null,
  );
  useEffect(() => {
    const t = setTimeout(() => setHistoryNeeded(true), PRELOAD_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  // Reset to the current Congress whenever the view changes.
  const [prevView, setPrevView] = useState(view);
  if (prevView !== view) {
    setPrevView(view);
    setCongress(latestCongress);
    setPlaying(false);
    setHoveredId(null);
  }

  const atLatest = congress === latestCongress;
  const historyPending = !atLatest && (!history || history.chamber !== view);

  const plottable = useMemo(() => {
    if (atLatest) return current.plottable;
    if (historyPending) return [];
    return plottableSorted(history!.allByCongress[congress] ?? []);
  }, [atLatest, historyPending, current.plottable, history, congress]);

  const histMembers =
    !atLatest && history?.chamber === view
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
    () =>
      stateFilter ? plottable.filter((m) => m.state === stateFilter) : plottable,
    [plottable, stateFilter],
  );

  // The selected state's delegation, per Congress — an overlay on the national
  // trend, not a replacement (a 1–3 member "party mean" isn't a real trend).
  const stateTrend = useMemo(() => {
    if (!stateFilter || !history || history.chamber !== view) return [];
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
  }, [stateFilter, history, view]);

  const goToCongress = useCallback((c: number) => {
    setHistoryNeeded(true);
    setCongress(c);
    setHoveredId(null);
  }, []);

  // Play steps through every Congress and loops back to the first.
  useEffect(() => {
    if (!playing || historyPending) return;
    const id = setTimeout(() => {
      goToCongress(congress >= latestCongress ? minCongress : congress + 1);
    }, PLAY_INTERVAL_MS);
    return () => clearTimeout(id);
  }, [playing, historyPending, congress, latestCongress, minCongress, goToCongress]);

  const togglePlay = useCallback(() => {
    setHistoryNeeded(true);
    setPlaying((p) => !p);
  }, []);

  const stopAnd = useCallback((fn: () => void) => {
    setPlaying(false);
    fn();
  }, []);

  const hovered = plottable.find((m) => m.bioguideId === hoveredId) ?? null;
  const shown = stateFilter ? stateMembers : plottable;
  const mostLiberal = shown[0];
  const mostConservative = shown[shown.length - 1];

  const noun = viewNoun(view);
  const nounPlural = viewNoun(view, { plural: true });
  const isSenate = view === "senate";
  const delegMode = isSenate ? "pair" : "range";
  const overlayVisible = stateFilter != null;
  const smallSample =
    overlayVisible && stateMembers.length > 0 && stateMembers.length <= 3;
  const showCompass = !stateFilter && !historyPending;
  const bodyLabel = view === "both" ? "Congress" : chamberLabel(view);

  return (
    <>
      <ExplorerToolbar
        states={stateOptions}
        congress={congress}
        min={minCongress}
        max={latestCongress}
        playing={playing}
        onCongressChange={(c) => stopAnd(() => goToCongress(c))}
        onTogglePlay={togglePlay}
      />

      <main className="mx-auto flex w-full max-w-[1120px] flex-col gap-5 px-4 pb-16 pt-7 sm:px-6">
        <div>
          <h1 className="mb-4 font-serif text-[clamp(1.7rem,3.6vw,2.35rem)] font-medium leading-[1.1] tracking-[-0.01em]">
            How Does Congress Vote?
          </h1>
          <p className="text-[0.92rem] leading-[1.65] text-ink-muted">{INTRO}</p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-[1.15fr_1fr]">
          <Card
            title="Where members stand"
            lede="Each dot is a member of Congress, positioned by how they vote."
            action={
              <div className="w-full sm:w-auto">
                <SenatorSearch
                  entries={search}
                  noun={view === "both" ? "member" : noun}
                />
              </div>
            }
          >
            {stateFilter && (
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.82rem]">
                <span className="font-medium text-ink">
                  {stateName(stateFilter)} · {stateMembers.length}{" "}
                  {stateMembers.length === 1 ? noun : nounPlural} in the{" "}
                  {ordinal(congress)} {bodyLabel}
                </span>
                <button
                  type="button"
                  onClick={() => setStateFilter(null)}
                  className="text-accent hover:underline"
                >
                  {view === "both"
                    ? "Show the whole Congress"
                    : "Show the whole chamber"}
                </button>
              </div>
            )}

            {historyPending ? (
              <div className="grid h-[300px] place-items-center text-[0.85rem] text-ink-faint">
                {loading ? "Loading history…" : "Scrubbing loads the full history"}
              </div>
            ) : stateFilter && !isSenate ? (
              <BeeswarmChart
                members={stateMembers}
                highlightId={hovered?.bioguideId}
              />
            ) : stateFilter ? (
              <DelegationChart
                members={plottable}
                filterState={stateFilter}
                mode="pair"
              />
            ) : (
              <CompassPanel congress={congress}>
                <CompassChart
                  variant="explorer"
                  members={plottable}
                  highlightedId={hoveredId}
                  onHover={(m) => m && setHoveredId(m.bioguideId)}
                  onSelect={(m) => router.push(memberPath(m))}
                />
              </CompassPanel>
            )}

            <div className="mt-3">
              <Legend members={shown} />
            </div>

            <p className="mt-2 text-[0.76rem] text-ink-muted">
              Most liberal:{" "}
              <span className="text-ink">{mostLiberal?.name ?? "—"}</span> ·
              most conservative:{" "}
              <span className="text-ink">{mostConservative?.name ?? "—"}</span>
            </p>

            {showCompass && <Dim2Footnote congress={congress} />}
          </Card>

          <Card
            title="How each state votes"
            lede="How far apart each state's delegation sits, same Congress as the chart on the left."
            action={
              <div
                className="flex flex-none gap-[0.35rem]"
                role="group"
                aria-label="Sort states"
              >
                {(
                  [
                    ["gap", isSenate ? "Most divided" : "Widest spread"],
                    ["az", "A–Z"],
                  ] as const
                ).map(([mode, text]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDelegSort(mode)}
                    aria-pressed={delegSort === mode}
                    className={`rounded-md border px-[0.55rem] py-[0.28rem] text-[0.7rem] font-medium transition-colors ${
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
            {/* Roughly the compass card's height, so the two columns line up;
                scrolls inside. On mobile the whole list just expands. */}
            <div className="mt-1 flex-1 border-t border-line pt-1 sm:max-h-[600px] sm:overflow-y-auto">
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
          </Card>
        </div>

        <Card
          title="How far apart are the parties?"
          lede="Each party's average position on the economic left–right axis, every Congress since 1789. Click or drag the chart to jump to any point — it moves the same slider as everything above."
        >
          {overlayVisible && (
            <p className="mb-2 text-[0.76rem] text-ink-faint">
              Solid lines are {stateName(stateFilter as string)}&rsquo;s{" "}
              {view === "both" ? "" : `${chamberLabel(view)} `}delegation; the
              dotted lines behind them are the national mean.
              {smallSample &&
                ` It's just ${stateMembers.length} ${
                  stateMembers.length === 1 ? noun : nounPlural
                } — expect it to look noisier than the national lines.`}
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
        </Card>

        <SiteFooter>
          <button
            type="button"
            onClick={() => setTableOpen(true)}
            className="rounded-md border border-line-strong px-[0.85rem] py-[0.5rem] text-[0.8rem] font-medium text-accent hover:border-accent"
          >
            View this Congress as a table
          </button>
        </SiteFooter>
      </main>

      <SenateTableModal
        open={tableOpen}
        congress={congress}
        senateMembers={
          atLatest
            ? senate.all
            : histMembers.filter((m) => m.chamber === "senate")
        }
        houseMembers={
          atLatest ? house.all : histMembers.filter((m) => m.chamber === "house")
        }
        activeView={view}
        stateFilter={stateFilter}
        onClose={() => setTableOpen(false)}
      />
    </>
  );
}
