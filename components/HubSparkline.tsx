import { line } from "d3-shape";
import { scaleLinear } from "d3-scale";
import type { PartyMeanPoint } from "@/lib/congress-types";

const W = 240;
const H = 56;
const PAD = 4;

/**
 * Static two-line sparkline of the party caucus means on dimension 1 (the
 * same series the explorer's trend chart plots). Server-rendered; d3 is used
 * for scale/path computation only.
 */
export function HubSparkline({ trend }: { trend: PartyMeanPoint[] }) {
  const pts = trend.filter((p) => p.dem != null && p.rep != null);
  if (pts.length < 2) return null;

  const x = scaleLinear()
    .domain([pts[0].year, pts[pts.length - 1].year])
    .range([PAD, W - PAD]);
  const vals = pts.flatMap((p) => [p.dem as number, p.rep as number]);
  const y = scaleLinear()
    .domain([Math.min(...vals), Math.max(...vals)])
    .range([H - PAD, PAD]);

  const path = (key: "dem" | "rep") =>
    line<PartyMeanPoint>()
      .x((p) => x(p.year))
      .y((p) => y(p[key] as number))(pts) ?? "";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-14 w-full"
      role="img"
      aria-label="Democratic and Republican caucus means on dimension 1, 1789 to present"
    >
      <path d={path("dem")} fill="none" strokeWidth={1.6} vectorEffect="non-scaling-stroke" style={{ stroke: "var(--dem)" }} />
      <path d={path("rep")} fill="none" strokeWidth={1.6} vectorEffect="non-scaling-stroke" style={{ stroke: "var(--rep)" }} />
    </svg>
  );
}
