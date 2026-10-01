import { scaleLinear } from "d3-scale";
import type { ChamberMember } from "@/lib/congress-types";
import { partyFillClass } from "@/lib/party-palette";

const W = 320;
const H = 200;
const PAD = 6;

/**
 * Static snapshot of the Congress explorer's scatter (House and Senate
 * blended, latest Congress). Server-rendered, no interaction; d3 is used for
 * scales only (cf. components/senate/CompassChart.tsx).
 */
export function HubCompass({ members }: { members: ChamberMember[] }) {
  const x = scaleLinear().domain([-1, 1]).range([PAD, W - PAD]);
  const y = scaleLinear().domain([-1, 1]).range([H - PAD, PAD]);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Scatter plot of current members of Congress by ideology score, Democrats and Republicans"
    >
      <line x1={x(0)} x2={x(0)} y1={PAD} y2={H - PAD} stroke="var(--line)" />
      <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} stroke="var(--line)" />
      {members.map((m) => (
        <circle
          key={m.bioguideId}
          cx={x(m.dim1 as number)}
          cy={y(m.dim2 as number)}
          r={2.6}
          className={partyFillClass(m)}
          fillOpacity={0.85}
        />
      ))}
    </svg>
  );
}
