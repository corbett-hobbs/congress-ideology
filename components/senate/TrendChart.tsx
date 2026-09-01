"use client";

import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Axis } from "@/components/charts/Axis";
import type { PartyMeanPoint } from "@/lib/senate-data";

const W = 1160;
const H = 190;
const MARGIN = { top: 14, right: 96, bottom: 24, left: 44 };
const Y_DOMAIN: [number, number] = [-0.6, 0.65];
const Y_TICKS = [-0.5, 0, 0.5];
const YEAR_TICKS = [1789, 1829, 1869, 1909, 1949, 1989, 2025];

interface TrendChartProps {
  trend: PartyMeanPoint[];
  minCongress: number;
  maxCongress: number;
  congress: number;
  onScrub: (congress: number) => void;
}

/** Party-mean dimension 1 (per-Congress nokken_poole) over time. Click to jump. */
export function TrendChart({
  trend,
  minCongress,
  maxCongress,
  congress,
  onScrub,
}: TrendChartProps) {
  const yearToCongress = (year: number) => Math.round((year - 1789) / 2) + 1;

  return (
    <ChartFrame
      width={W}
      height={H}
      margin={MARGIN}
      ariaLabel="Line chart of Senate party ideology means over time"
      className="cursor-crosshair"
      onClick={(e) => {
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const frac = (e.clientX - rect.left) / rect.width;
        const cg = Math.round(
          minCongress + frac * (maxCongress - minCongress),
        );
        onScrub(Math.max(minCongress, Math.min(maxCongress, cg)));
      }}
    >
      {({ innerWidth, innerHeight }) => {
        const x = scaleLinear()
          .domain([minCongress, maxCongress])
          .range([0, innerWidth]);
        const y = scaleLinear().domain(Y_DOMAIN).range([innerHeight, 0]);

        const demPath = line<PartyMeanPoint>()
          .defined((d) => d.dem != null)
          .x((d) => x(d.congress))
          .y((d) => y(d.dem as number))(trend);
        const repPath = line<PartyMeanPoint>()
          .defined((d) => d.rep != null)
          .x((d) => x(d.congress))
          .y((d) => y(d.rep as number))(trend);

        const last = trend[trend.length - 1];
        const px = x(congress);

        return (
          <>
            <Axis
              scale={x}
              orientation="bottom"
              ticks={YEAR_TICKS.map(yearToCongress)}
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

            {demPath && <path className="trend-line stroke-dem" d={demPath} />}
            {repPath && <path className="trend-line stroke-rep" d={repPath} />}

            <line
              className="trend-playhead"
              x1={px}
              x2={px}
              y1={0}
              y2={innerHeight}
            />

            {last?.dem != null && (
              <text
                className="trend-end-label fill-dem"
                x={x(last.congress) + 8}
                y={y(last.dem) + 4}
              >
                Democrats
              </text>
            )}
            {last?.rep != null && (
              <text
                className="trend-end-label fill-rep"
                x={x(last.congress) + 8}
                y={y(last.rep) + 4}
              >
                Republicans
              </text>
            )}
          </>
        );
      }}
    </ChartFrame>
  );
}
