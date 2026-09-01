"use client";

import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Axis } from "@/components/charts/Axis";
import type {
  PartyGroup,
  PartyMeanPoint,
  MemberTrajectoryPoint,
} from "@/lib/congress-types";
import { congressStartYear, GROUP_LABEL } from "./format";

const W = 620;
const H = 240;
const MARGIN = { top: 20, right: 96, bottom: 26, left: 40 };
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
}: SenatorTrajectoryChartProps) {
  const first = trajectory[0]?.congress ?? 0;
  const lastPt = trajectory[trajectory.length - 1]?.congress ?? first;
  const single = trajectory.length === 1;

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

  return (
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

            {meanLine && (
              <path
                className={`trend-line ${STROKE[meanKey]}`}
                d={meanLine}
                opacity={0.3}
              />
            )}

            {careerDim1 != null && (
              <>
                <line
                  className="grid-line"
                  strokeDasharray="4 3"
                  x1={0}
                  x2={innerWidth}
                  y1={y(careerDim1)}
                  y2={y(careerDim1)}
                />
                <text
                  fill="var(--ink-faint)"
                  className="axis-tick-label"
                  x={innerWidth + 6}
                  y={y(careerDim1) - 5}
                >
                  career
                </text>
              </>
            )}

            {senatorLine && (
              <path className={`trend-line ${STROKE[group]}`} d={senatorLine} />
            )}
            {trajectory.map((d) =>
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

            {meanLine && (
              <text
                fill="var(--ink-faint)"
                className="axis-tick-label"
                x={x(lastPt) + 6}
                y={y((meanInRange.at(-1)?.[meanKey] as number) ?? 0) + 11}
              >
                {GROUP_LABEL[meanKey]} mean
              </text>
            )}
          </>
        );
      }}
    </ChartFrame>
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
