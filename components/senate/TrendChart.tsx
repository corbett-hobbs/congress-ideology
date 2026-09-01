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
const MARGIN = { top: 14, right: 108, bottom: 24, left: 44 };
const Y_DOMAIN: [number, number] = [-0.6, 0.65];
const Y_TICKS = [-0.5, 0, 0.5];
const YEAR_TICKS = [1789, 1829, 1869, 1909, 1949, 1989, 2025];

interface TrendChartProps {
  senateTrend: PartyMeanPoint[];
  houseTrend: PartyMeanPoint[];
  mode: TrendMode;
  minCongress: number;
  maxCongress: number;
  congress: number;
  onScrub: (congress: number) => void;
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
        const single = series.length === 1;

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
              const last = trend[trend.length - 1];
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
                  {last?.dem != null && (
                    <text
                      className="trend-end-label fill-dem"
                      x={x(last.congress) + 8}
                      y={y(last.dem) + 4}
                    >
                      {single ? "Democrats" : `Dem · ${chamberLabel(chamber)}`}
                    </text>
                  )}
                  {last?.rep != null && (
                    <text
                      className="trend-end-label fill-rep"
                      x={x(last.congress) + 8}
                      y={y(last.rep) + 4}
                    >
                      {single ? "Republicans" : `Rep · ${chamberLabel(chamber)}`}
                    </text>
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
    </div>
  );
}
