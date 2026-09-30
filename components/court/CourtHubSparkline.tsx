import { line } from "d3-shape";
import { scaleLinear } from "d3-scale";
import type { CourtHubSummary } from "@/lib/court-types";

const W = 240;
const H = 56;
const PAD = 4;

/**
 * Static sparkline of the Court median by term, on the same fixed score domain
 * as the explorer's charts. Neutral ink — the median belongs to no party.
 * Server-rendered; d3 computes the path only (cf. components/HubSparkline.tsx).
 */
export function CourtHubSparkline({ summary }: { summary: CourtHubSummary }) {
  const pts = summary.medianSeries;
  if (pts.length < 2) return null;
  const x = scaleLinear()
    .domain([pts[0].term, pts[pts.length - 1].term])
    .range([PAD, W - PAD]);
  const y = scaleLinear().domain(summary.domain).range([H - PAD, PAD]);
  const d =
    line<(typeof pts)[number]>()
      .x((p) => x(p.term))
      .y((p) => y(p.median))(pts) ?? "";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-14 w-full"
      role="img"
      aria-label={`Supreme Court median score by term, ${pts[0].term} to ${pts[pts.length - 1].term}`}
    >
      <path
        d={d}
        fill="none"
        strokeWidth={1.6}
        vectorEffect="non-scaling-stroke"
        style={{ stroke: "var(--ink)" }}
      />
    </svg>
  );
}
