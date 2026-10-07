"use client";

import { Y_GUTTER } from "@/lib/chart-bars";
import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";
import { LegendToggle, useIsolate } from "@/components/charts/LegendToggle";
import { ExampleMarks, aboveFlags, pickExample } from "@/components/charts/ExampleMarks";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Axis } from "@/components/charts/Axis";
import type {
  PartyGroup,
  PartyMeanPoint,
  MemberTrajectoryPoint,
} from "@/lib/congress-types";
import { congressStartYear, GROUP_LABEL, GROUP_VAR } from "./format";

const W = 620;
const H = 240;
// No wide right gutter — the lines run to the edge and the legend sits below.
const MARGIN = { top: 20, right: 16, bottom: 26, left: Y_GUTTER };
/** Minimum vertical span so a genuinely stable senator isn't over-magnified. */
const MIN_Y_SPAN = 0.5;
const clamp = (v: number) => Math.max(-1, Math.min(1, v));

function niceTicks(lo: number, hi: number): number[] {
  const candidates = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
  return candidates.filter((t) => t >= lo - 1e-9 && t <= hi + 1e-9);
}

const STROKE: Record<PartyGroup, string> = {
  dem: "stroke-dem",
  rep: "stroke-rep",
  other: "stroke-[var(--oth)]",
};
const FILL: Record<PartyGroup, string> = {
  dem: "fill-dem",
  rep: "fill-rep",
  other: "fill-other",
};

interface SenatorTrajectoryChartProps {
  /** This senator's per-Congress nokken_poole_dim1, chronological. */
  trajectory: MemberTrajectoryPoint[];
  /** Full Senate party-mean series; clipped to the trajectory span here. */
  partyMean: PartyMeanPoint[];
  group: PartyGroup;
  careerDim1: number | null;
  /** This member's display name, for the legend. */
  memberName: string;
}

/**
 * One senator's dimension-1 path over the Congresses they served (per-Congress
 * nokken_poole), against their party's mean — a single-member version of the
 * Session 3 trend chart. Built from the shared ChartFrame + Axis.
 */
export function SenatorTrajectoryChart({
  trajectory,
  partyMean,
  group,
  careerDim1,
  memberName,
}: SenatorTrajectoryChartProps) {
  const first = trajectory[0]?.congress ?? 0;
  const lastPt = trajectory[trajectory.length - 1]?.congress ?? first;
  const single = trajectory.length === 1;
  const [only, isolate] = useIsolate<"senator" | "mean" | "career">();
  const show = (k: "senator" | "mean" | "career") => only === null || only === k;

  // Pad a single-point domain so the dot and reference line have room.
  const domainLo = single ? first - 1 : first;
  const domainHi = single ? lastPt + 1 : lastPt;

  const meanInRange = partyMean.filter(
    (p) => p.congress >= first && p.congress <= lastPt,
  );
  const meanKey = group === "rep" ? "rep" : "dem";

  // Zoom the y-axis to this senator's own range (plus the reference marks),
  // so a moderate trajectory doesn't read as a flat line on a fixed [-1, 1].
  const yValues = [
    ...trajectory.map((t) => t.dim1),
    ...meanInRange.map((p) => p[meanKey]),
    careerDim1,
  ].filter((v): v is number => v != null);
  let yLo = Math.min(...yValues);
  let yHi = Math.max(...yValues);
  if (yHi - yLo < MIN_Y_SPAN) {
    const mid = (yLo + yHi) / 2;
    yLo = mid - MIN_Y_SPAN / 2;
    yHi = mid + MIN_Y_SPAN / 2;
  }
  const pad = (yHi - yLo) * 0.18;
  yLo = clamp(yLo - pad);
  yHi = clamp(yHi + pad);

  const meanLabel = `${GROUP_LABEL[meanKey]} mean`;

  return (
   <div>
    <ChartFrame
      width={W}
      height={H}
      margin={MARGIN}
      ariaLabel="This senator's dimension-1 position over the Congresses they served"
    >
      {({ innerWidth, innerHeight }) => {
        const x = scaleLinear().domain([domainLo, domainHi]).range([0, innerWidth]);
        const y = scaleLinear().domain([yHi, yLo]).range([0, innerHeight]);

        const congressTicks = axisCongresses(first, lastPt);
        const yTicks = niceTicks(yLo, yHi);

        const senatorLine = line<MemberTrajectoryPoint>()
          .defined((d) => d.dim1 != null)
          .x((d) => x(d.congress))
          .y((d) => y(d.dim1 as number))(trajectory);

        const meanLine = line<PartyMeanPoint>()
          .defined((d) => d[meanKey] != null)
          .x((d) => x(d.congress))
          .y((d) => y(d[meanKey] as number))(meanInRange);

        // One example value on the senator's line and on the party mean, at the congress 3/4 of the way across.
        const exView: [number, number] = [domainLo, domainHi + 1];
        const exSrc = [
          ...(show("senator") ? [{ pts: trajectory.map((d) => ({ day: d.congress, value: d.dim1 })), color: `var(--${group === "other" ? "oth" : group})` }] : []),
          ...(meanLine && show("mean") ? [{ pts: meanInRange.map((d) => ({ day: d.congress, value: d[meanKey] })), color: "var(--ink-muted)" }] : []),
        ];
        const exPicks = exSrc.flatMap((e) => {
          const p = pickExample(e.pts, exView);
          return p && p.value !== null ? [{ day: p.day, value: p.value, color: e.color }] : [];
        });
        const exAbove = aboveFlags(exPicks);
        const exMarks = exPicks.map((p, i) => ({ x: x(p.day), y: y(p.value), above: exAbove[i], color: p.color, text: `${congressStartYear(p.day)}: ${p.value.toFixed(2)}` }));

        return (
          <>
            <Axis
              scale={y}
              orientation="left"
              ticks={yTicks}
              offset={0}
              gridExtent={innerWidth}
              zeroAt={0}
              format={(v) => v.toFixed(2)}
            />
            <Axis
              scale={x}
              orientation="bottom"
              ticks={congressTicks}
              offset={innerHeight}
              format={(c) => String(congressStartYear(c))}
            />

            {meanLine && show("mean") && (
              <path
                className={`trend-line ${STROKE[meanKey]}`}
                d={meanLine}
                opacity={0.3}
              />
            )}

            {careerDim1 != null && show("career") && (
              <line
                className="grid-line"
                strokeDasharray="4 3"
                x1={0}
                x2={innerWidth}
                y1={y(careerDim1)}
                y2={y(careerDim1)}
              />
            )}

            {senatorLine && show("senator") && (
              <path className={`trend-line ${STROKE[group]}`} d={senatorLine} />
            )}
            {show("senator") && trajectory.map((d) =>
              d.dim1 == null ? null : (
                <circle
                  key={d.congress}
                  className={`dot ${FILL[group]}`}
                  cx={x(d.congress)}
                  cy={y(d.dim1)}
                  r={single ? 5.5 : 3.6}
                />
              ),
            )}

            {!single && <ExampleMarks marks={exMarks} left={0} right={innerWidth} top={0} bottom={innerHeight} />}
          </>
        );
      }}
    </ChartFrame>

    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.72rem] text-ink-muted">
      <LegendToggle active={only === "senator"} dimmed={only !== null && only !== "senator"} onClick={() => isolate("senator")}>
        <Swatch color={GROUP_VAR[group]} /> {memberName}
      </LegendToggle>
      <LegendToggle active={only === "mean"} dimmed={only !== null && only !== "mean"} onClick={() => isolate("mean")}>
        <Swatch color={GROUP_VAR[meanKey]} faint />{" "}
        {meanLabel}
      </LegendToggle>
      {careerDim1 != null && (
        <LegendToggle active={only === "career"} dimmed={only !== null && only !== "career"} onClick={() => isolate("career")}>
          <Swatch color="var(--ink-faint)" dash /> Career average
        </LegendToggle>
      )}
    </div>
   </div>
  );
}

function Swatch({
  color,
  dash,
  faint,
}: {
  color: string;
  dash?: boolean;
  faint?: boolean;
}) {
  return (
    <svg width="20" height="8" viewBox="0 0 20 8" aria-hidden className="flex-none">
      <line
        x1="0"
        y1="4"
        x2="20"
        y2="4"
        stroke={color}
        strokeWidth={2.25}
        strokeDasharray={dash ? "3 3" : undefined}
        opacity={faint ? 0.3 : 1}
      />
    </svg>
  );
}

/** 3–6 evenly spread Congress numbers for the x-axis. */
function axisCongresses(first: number, last: number): number[] {
  const span = last - first;
  if (span <= 0) return [first];
  const step = Math.max(1, Math.ceil(span / 5));
  const out: number[] = [];
  for (let c = first; c <= last; c += step) out.push(c);
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}
