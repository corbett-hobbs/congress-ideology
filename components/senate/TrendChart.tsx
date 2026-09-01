"use client";

import type { MouseEventHandler } from "react";
import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Axis } from "@/components/charts/Axis";
import type { PartyMeanPoint } from "@/lib/congress-types";
import { useElementWidth } from "@/lib/use-element-width";

/** Used before the container is first measured (avoids a zero-width flash). */
const FALLBACK_W = 1160;
const H = 190;
// No wide right margin — the lines run to the edge and the legend sits below.
const MARGIN = { top: 14, right: 14, bottom: 24, left: 44 };
const Y_DOMAIN: [number, number] = [-0.6, 0.65];
const Y_TICKS = [-0.5, 0, 0.5];
const YEAR_TICKS = [1789, 1829, 1869, 1909, 1949, 1989, 2025];

/** A selected state's delegation trend, overlaid on the national lines. */
export interface StateOverlay {
  trend: PartyMeanPoint[];
  /** Full state name, for the legend. */
  label: string;
}

interface TrendChartProps {
  /** The active chamber's national party means, every Congress. */
  trend: PartyMeanPoint[];
  minCongress: number;
  maxCongress: number;
  congress: number;
  onScrub: (congress: number) => void;
  stateOverlay?: StateOverlay | null;
}

/** Party-mean dimension 1 (per-Congress nokken_poole) over time. Click to jump. */
export function TrendChart({
  trend,
  minCongress,
  maxCongress,
  congress,
  onScrub,
  stateOverlay,
}: TrendChartProps) {
  const yearToCongress = (year: number) => Math.round((year - 1789) / 2) + 1;
  const [wrapRef, measuredW] = useElementWidth<HTMLDivElement>();
  // Size the chart to its actual container — see lib/use-element-width.ts.
  const W = measuredW || FALLBACK_W;
  const yearTicks = W < 480 ? [1789, 1909, 2025] : YEAR_TICKS;

  return (
    <div ref={wrapRef}>
      <ChartFrame
        width={W}
        height={H}
        margin={MARGIN}
        ariaLabel="Line chart of the chamber's party ideology means over time"
      >
        {({ innerWidth, innerHeight }) => {
          const x = scaleLinear()
            .domain([minCongress, maxCongress])
            .range([0, innerWidth]);
          const y = scaleLinear().domain(Y_DOMAIN).range([innerHeight, 0]);

          const handleScrub: MouseEventHandler<SVGRectElement> = (e) => {
            const ctm = e.currentTarget.getScreenCTM();
            if (!ctm) return;
            const local = new DOMPoint(e.clientX, e.clientY).matrixTransform(
              ctm.inverse(),
            );
            const cg = Math.round(x.invert(local.x));
            onScrub(Math.max(minCongress, Math.min(maxCongress, cg)));
          };

          const pathFor = (pts: PartyMeanPoint[], key: "dem" | "rep") =>
            line<PartyMeanPoint>()
              .defined((d) => d[key] != null)
              .x((d) => x(d.congress))
              .y((d) => y(d[key] as number))(pts);

          const px = x(congress);
          const overlayDem = stateOverlay && pathFor(stateOverlay.trend, "dem");
          const overlayRep = stateOverlay && pathFor(stateOverlay.trend, "rep");

          // With a state selected, that state's line is the thing you're
          // looking at — make it primary and drop the national means back to
          // a dotted reference. (The small-sample caption still flags that a
          // 1-3 member "mean" is noisy.)
          const nationalClass = stateOverlay ? "trend-overlay-line" : "trend-line";
          const nationalDash = stateOverlay ? "1 3" : undefined;

          return (
            <>
              <Axis
                scale={x}
                orientation="bottom"
                ticks={yearTicks.map(yearToCongress)}
                offset={innerHeight}
                gridExtent={innerHeight}
                format={(cg) => String(1789 + (cg - 1) * 2)}
              />
              <Axis
                scale={y}
                orientation="left"
                ticks={Y_TICKS}
                offset={0}
                zeroAt={0}
                format={(v) => v.toFixed(1)}
              />
              <line
                className="zero-line"
                x1={0}
                x2={innerWidth}
                y1={y(0)}
                y2={y(0)}
              />

              {pathFor(trend, "dem") && (
                <path
                  className={`${nationalClass} stroke-dem`}
                  d={pathFor(trend, "dem") as string}
                  strokeDasharray={nationalDash}
                />
              )}
              {pathFor(trend, "rep") && (
                <path
                  className={`${nationalClass} stroke-rep`}
                  d={pathFor(trend, "rep") as string}
                  strokeDasharray={nationalDash}
                />
              )}

              {/* The selected state's delegation — the primary line when shown. */}
              {overlayDem && (
                <path className="trend-line stroke-dem" d={overlayDem} />
              )}
              {overlayRep && (
                <path className="trend-line stroke-rep" d={overlayRep} />
              )}

              <line
                className="trend-playhead"
                x1={px}
                x2={px}
                y1={0}
                y2={innerHeight}
              />

              <rect
                x={0}
                y={0}
                width={innerWidth}
                height={innerHeight}
                fill="transparent"
                style={{ cursor: "crosshair" }}
                onClick={handleScrub}
              />
            </>
          );
        }}
      </ChartFrame>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.72rem] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <Swatch color="var(--dem)" /> Democrats
        </span>
        <span className="flex items-center gap-1.5">
          <Swatch color="var(--rep)" /> Republicans
        </span>
        {stateOverlay && (
          <>
            <span className="flex items-center gap-1.5 text-ink-faint">
              <Swatch color="var(--ink)" />
              {stateOverlay.label} delegation
            </span>
            <span className="flex items-center gap-1.5 text-ink-faint">
              <Swatch color="var(--ink-faint)" dash thin />
              national mean
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function Swatch({
  color,
  dash,
  thin,
}: {
  color: string;
  dash?: boolean;
  thin?: boolean;
}) {
  return (
    <svg width="20" height="8" viewBox="0 0 20 8" aria-hidden className="flex-none">
      <line
        x1="0"
        y1="4"
        x2="20"
        y2="4"
        stroke={color}
        strokeWidth={thin ? 1.3 : 2.25}
        strokeDasharray={dash ? "2 3" : undefined}
        opacity={thin ? 0.7 : 1}
      />
    </svg>
  );
}
