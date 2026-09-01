"use client";

import type { MouseEventHandler } from "react";
import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Axis } from "@/components/charts/Axis";
import type { Chamber } from "@/lib/chamber";
import { chamberLabel } from "@/lib/chamber";
import type { PartyMeanPoint } from "@/lib/congress-types";
import { useElementWidth } from "@/lib/use-element-width";

/** Which chamber(s) to plot the party means for. */
export type TrendMode = Chamber | "both";

/** Used before the container is first measured (avoids a zero-width flash). */
const FALLBACK_W = 1160;
const H = 190;
// No wide right margin any more — the lines run to the edge and the legend
// sits below the chart instead of labelling each line's end.
const MARGIN = { top: 14, right: 14, bottom: 24, left: 44 };
const Y_DOMAIN: [number, number] = [-0.6, 0.65];
const Y_TICKS = [-0.5, 0, 0.5];
const YEAR_TICKS = [1789, 1829, 1869, 1909, 1949, 1989, 2025];

/** A selected state's delegation trend, overlaid on the national lines. */
export interface StateOverlay {
  chamber: Chamber;
  trend: PartyMeanPoint[];
  /** Full state name, for the legend. */
  label: string;
}

interface TrendChartProps {
  senateTrend: PartyMeanPoint[];
  houseTrend: PartyMeanPoint[];
  mode: TrendMode;
  minCongress: number;
  maxCongress: number;
  congress: number;
  onScrub: (congress: number) => void;
  /** Drawn only alongside the matching chamber's national line, if visible. */
  stateOverlay?: StateOverlay | null;
}

/** Party-mean dimension 1 (per-Congress nokken_poole) over time. Click to jump. */
export function TrendChart({
  senateTrend,
  houseTrend,
  mode,
  minCongress,
  maxCongress,
  congress,
  onScrub,
  stateOverlay,
}: TrendChartProps) {
  const yearToCongress = (year: number) => Math.round((year - 1789) / 2) + 1;
  const [wrapRef, measuredW] = useElementWidth<HTMLDivElement>();
  // Size the chart to its actual container, not a fixed logical width the
  // browser then stretches or shrinks — see lib/use-element-width.ts.
  const W = measuredW || FALLBACK_W;
  // Fewer year ticks once there isn't room for all seven without overlapping.
  const yearTicks = W < 480 ? [1789, 1909, 2025] : YEAR_TICKS;

  const series: { chamber: Chamber; trend: PartyMeanPoint[]; dashed: boolean }[] =
    mode === "senate"
      ? [{ chamber: "senate", trend: senateTrend, dashed: false }]
      : mode === "house"
        ? [{ chamber: "house", trend: houseTrend, dashed: false }]
        : [
            { chamber: "senate", trend: senateTrend, dashed: false },
            { chamber: "house", trend: houseTrend, dashed: true },
          ];

  return (
    <div ref={wrapRef}>
      <ChartFrame
        width={W}
        height={H}
        margin={MARGIN}
        ariaLabel="Line chart of congressional party ideology means over time"
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

          const pathFor = (trend: PartyMeanPoint[], key: "dem" | "rep") =>
            line<PartyMeanPoint>()
              .defined((d) => d[key] != null)
              .x((d) => x(d.congress))
              .y((d) => y(d[key] as number))(trend);

          const px = x(congress);

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

              {series.map(({ chamber, trend, dashed }) => {
                const dem = pathFor(trend, "dem");
                const rep = pathFor(trend, "rep");

                const overlay =
                  stateOverlay?.chamber === chamber ? stateOverlay : null;
                const overlayDem = overlay && pathFor(overlay.trend, "dem");
                const overlayRep = overlay && pathFor(overlay.trend, "rep");

                return (
                  <g key={chamber}>
                    {dem && (
                      <path
                        className="trend-line stroke-dem"
                        d={dem}
                        strokeDasharray={dashed ? "5 4" : undefined}
                      />
                    )}
                    {rep && (
                      <path
                        className="trend-line stroke-rep"
                        d={rep}
                        strokeDasharray={dashed ? "5 4" : undefined}
                      />
                    )}

                    {/* State overlay: thinner, dashed, muted — reads as "a
                        variant of" the bold national lines, not a second
                        dataset. Labelled in the legend below. */}
                    {overlayDem && (
                      <path
                        className="trend-overlay-line stroke-dem"
                        d={overlayDem}
                        strokeDasharray="2 3"
                      />
                    )}
                    {overlayRep && (
                      <path
                        className="trend-overlay-line stroke-rep"
                        d={overlayRep}
                        strokeDasharray="2 3"
                      />
                    )}
                  </g>
                );
              })}

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

      <TrendLegend mode={mode} stateOverlay={stateOverlay ?? null} />
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
    <svg
      width="20"
      height="8"
      viewBox="0 0 20 8"
      aria-hidden
      className="flex-none"
    >
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

function TrendLegend({
  mode,
  stateOverlay,
}: {
  mode: TrendMode;
  stateOverlay: StateOverlay | null;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.72rem] text-ink-muted">
      <span className="flex items-center gap-1.5">
        <Swatch color="var(--dem)" /> Democrats
      </span>
      <span className="flex items-center gap-1.5">
        <Swatch color="var(--rep)" /> Republicans
      </span>
      {mode === "both" && (
        <span className="flex items-center gap-1.5 text-ink-faint">
          <Swatch color="var(--ink-faint)" />
          {chamberLabel("senate")}
          <span className="mx-1">·</span>
          <Swatch color="var(--ink-faint)" dash />
          {chamberLabel("house")}
        </span>
      )}
      {stateOverlay && (
        <span className="flex items-center gap-1.5 text-ink-faint">
          <Swatch color="var(--ink-faint)" dash thin />
          {stateOverlay.label} delegation
        </span>
      )}
    </div>
  );
}
