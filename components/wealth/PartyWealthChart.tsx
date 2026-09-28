"use client";

import { useMemo } from "react";
import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Axis } from "@/components/charts/Axis";
import { useElementWidth } from "@/lib/use-element-width";
import { chamberLabel, type ChamberView } from "@/lib/chamber";
import { stateName } from "@/lib/states";
import type { WealthMember } from "@/lib/wealth-data";
import {
  partyChartSeries,
  sampleRange,
  type PartyChartPoint,
} from "@/lib/wealth-party-chart";
import { formatCompactUSD } from "@/lib/format-money";

const FALLBACK_W = 1080;
const H = 280;
const MARGIN = { top: 16, right: 20, bottom: 28, left: 64 };
const MAX_TICKS = 6;

/** "Nice" y ticks between $50K and $50M, always including $0. */
function niceTicks(maxValue: number): number[] {
  const domainMax = Math.max(maxValue, 50_000);
  const scale = scaleLinear().domain([0, domainMax]).nice();
  return scale.ticks(MAX_TICKS).filter((v) => v >= 0);
}

interface Props {
  view: ChamberView;
  chamberMembers: WealthMember[];
  stateFilter: string | null;
}

export function PartyWealthChart({ view, chamberMembers, stateFilter }: Props) {
  const [wrapRef, measuredW] = useElementWidth<HTMLDivElement>();
  const W = measuredW || FALLBACK_W;

  const series = useMemo(() => partyChartSeries(chamberMembers), [chamberMembers]);

  const stateSeries = useMemo(() => {
    if (!stateFilter) return null;
    return partyChartSeries(chamberMembers.filter((m) => m.state === stateFilter));
  }, [chamberMembers, stateFilter]);

  const latestYear = series[series.length - 1];
  const smallSampleDem = stateSeries ? stateSeries[stateSeries.length - 1].demCount : 0;
  const smallSampleRep = stateSeries ? stateSeries[stateSeries.length - 1].repCount : 0;
  const showSmallSampleNote =
    stateSeries != null && (smallSampleDem <= 3 || smallSampleRep <= 3);

  const demRange = sampleRange(series, "demCount");
  const repRange = sampleRange(series, "repCount");

  const maxValue = Math.max(
    0,
    ...series.flatMap((p) => [p.dem ?? 0, p.rep ?? 0]),
    ...(stateSeries?.flatMap((p) => [p.dem ?? 0, p.rep ?? 0]) ?? []),
  );
  const yTicks = niceTicks(maxValue);
  const yMax = yTicks[yTicks.length - 1];

  const innerWidth = W - MARGIN.left - MARGIN.right;
  const innerHeight = H - MARGIN.top - MARGIN.bottom;

  const chamberNoun = view === "senate" ? "Senate" : view === "house" ? "House" : "Both chambers";

  return (
    <section className="rounded-xl border border-line-strong bg-surface p-5 sm:p-6">
      <h2 className="font-serif text-xl font-medium text-ink sm:text-2xl">
        How far apart are the parties&rsquo; wealth?
      </h2>
      <p className="mt-1 text-[0.85rem] text-ink-muted">
        Median net worth by party, 2013–2025 · {chamberNoun}
        {stateFilter && ` · ${stateName(stateFilter)} overlay`}
      </p>

      <div ref={wrapRef} className="mt-4">
        <ChartFrame
          width={W}
          height={H}
          margin={MARGIN}
          ariaLabel={`Line chart of median net worth by party, 2013 to 2025, latest value Democrats ${
            latestYear.dem != null ? formatCompactUSD(latestYear.dem) : "unavailable"
          }, Republicans ${latestYear.rep != null ? formatCompactUSD(latestYear.rep) : "unavailable"}`}
        >
          {() => {
            const x = scaleLinear().domain([2013, 2025]).range([0, innerWidth]);
            const y = scaleLinear().domain([0, yMax]).range([innerHeight, 0]);

            const pathFor = (pts: PartyChartPoint[], key: "dem" | "rep") =>
              line<PartyChartPoint>()
                .defined((d) => d[key] != null)
                .x((d) => x(d.year))
                .y((d) => y(d[key] as number))(pts);

            const markers = (pts: PartyChartPoint[], key: "dem" | "rep", hollow: boolean) =>
              pts
                .filter((d) => d[key] != null)
                .map((d, i, arr) => (
                  <circle
                    key={`${key}-${d.year}`}
                    cx={x(d.year)}
                    cy={y(d[key] as number)}
                    r={i === arr.length - 1 ? 4.5 : 2.6}
                    className={key === "dem" ? "stroke-dem" : "stroke-rep"}
                    fill={hollow ? "var(--surface)" : `var(--${key})`}
                    strokeWidth={1.5}
                  />
                ));

            return (
              <>
                <Axis
                  scale={x}
                  orientation="bottom"
                  ticks={[2013, 2017, 2021, 2025]}
                  offset={innerHeight}
                  gridExtent={innerHeight}
                  format={(v) => String(v)}
                />
                <Axis
                  scale={y}
                  orientation="left"
                  ticks={yTicks}
                  offset={0}
                  zeroAt={0}
                  gridExtent={innerWidth}
                  format={(v) => formatCompactUSD(v)}
                />

                {pathFor(series, "dem") && (
                  <path
                    className={`trend-line stroke-dem`}
                    d={pathFor(series, "dem") as string}
                  />
                )}
                {pathFor(series, "rep") && (
                  <path
                    className={`trend-line stroke-rep`}
                    d={pathFor(series, "rep") as string}
                  />
                )}
                {markers(series, "dem", false)}
                {markers(series, "rep", false)}

                {stateSeries && pathFor(stateSeries, "dem") && (
                  <path
                    className="trend-overlay-line stroke-dem"
                    d={pathFor(stateSeries, "dem") as string}
                    strokeDasharray="4 3"
                  />
                )}
                {stateSeries && pathFor(stateSeries, "rep") && (
                  <path
                    className="trend-overlay-line stroke-rep"
                    d={pathFor(stateSeries, "rep") as string}
                    strokeDasharray="4 3"
                  />
                )}
                {stateSeries && markers(stateSeries, "dem", true)}
                {stateSeries && markers(stateSeries, "rep", true)}
              </>
            );
          }}
        </ChartFrame>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.72rem] text-ink-muted">
        <LineSwatch color="var(--dem)" label="Democrats" />
        <LineSwatch color="var(--rep)" label="Republicans" />
        {stateSeries && (stateSeries.some((p) => p.dem != null)) && (
          <LineSwatch color="var(--dem)" label={`${stateName(stateFilter!)} Democrats`} dash />
        )}
        {stateSeries && (stateSeries.some((p) => p.rep != null)) && (
          <LineSwatch color="var(--rep)" label={`${stateName(stateFilter!)} Republicans`} dash />
        )}
      </div>

      {showSmallSampleNote && (
        <p className="mt-2 text-[0.78rem] text-note">
          {stateName(stateFilter!)} has {smallSampleDem} Democrat{smallSampleDem === 1 ? "" : "s"}{" "}
          and {smallSampleRep} Republican{smallSampleRep === 1 ? "" : "s"} with usable 2025 data. A
          median of 1–3 members isn’t a meaningful average, so read the dashed lines as individual
          members.
        </p>
      )}

      <p className="mt-3 text-[0.72rem] leading-relaxed text-ink-faint">
        Years are the year each report covers, so the 2025 point comes from
        reports filed in 2026. Medians are used instead of means so one very
        wealthy member doesn’t move the line.{" "}
        {demRange && repRange && (
          <>
            Sample per year: {demRange[0]}–{demRange[1]} Democrats,{" "}
            {repRange[0]}–{repRange[1]} Republicans.{" "}
          </>
        )}
        Scope: {chamberLabelForFootnote(view)}.
      </p>
    </section>
  );
}

function chamberLabelForFootnote(view: ChamberView): string {
  if (view === "both") return "House and Senate";
  return chamberLabel(view);
}

function LineSwatch({
  color,
  label,
  dash,
}: {
  color: string;
  label: string;
  dash?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="18" height="8" viewBox="0 0 18 8" aria-hidden className="flex-none">
        <line
          x1="0"
          y1="4"
          x2="18"
          y2="4"
          stroke={color}
          strokeWidth={dash ? 1.3 : 2.25}
          strokeDasharray={dash ? "3 2" : undefined}
          opacity={dash ? 0.85 : 1}
        />
      </svg>
      {label}
    </span>
  );
}
