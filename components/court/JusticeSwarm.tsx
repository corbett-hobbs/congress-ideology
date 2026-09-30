"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { scaleLinear } from "d3-scale";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Axis } from "@/components/charts/Axis";
import { Tooltip, useTooltip } from "@/components/charts/Tooltip";
import { useElementWidth } from "@/lib/use-element-width";
import { fmtScore, partyLabel } from "@/lib/court-types";
import { justicePath } from "@/lib/justice-url";
import { layoutSwarm } from "@/lib/justice-swarm-layout";
import type { JusticeProfile, SwarmPoint } from "@/lib/justice-types";
import { partyVar, type JusticeMode } from "./justice-mode";

const FALLBACK_W = 420;
const PAD_X = 14;
const R = 4.8;
const R_SUBJECT = 7;
const AXIS_H = 24;
const RANGE_H = 34;

/**
 * "Where {Last} sits among all justices": a one-dimensional swarm of every
 * justice in the data set at career average, on a score axis fitted to the data, like the
 * chart beside it. The subject is ringed, the toggle's highlighted set is solid,
 * everyone else is faded. There are no name labels (hover for names). The axis
 * is fitted to the career averages. Under the axis, a bar spans the subject's lowest to
 * highest per-term score.
 */
export function JusticeSwarm({
  profile,
  mode,
}: {
  profile: JusticeProfile;
  mode: JusticeMode;
}) {
  const router = useRouter();
  const [ref, measured] = useElementWidth<HTMLDivElement>();
  const W = measured || FALLBACK_W;
  const tip = useTooltip<SwarmPoint>();
  const { justice, swarm } = profile;
  const { points, range } = swarm;

  const geo = useMemo(() => {
    const careers = points.map((p) => p.career);
    const lo = Math.min(...careers, range.min);
    const hi = Math.max(...careers, range.max);
    const pad = (hi - lo) * 0.04;
    const domain: [number, number] = [Math.floor((lo - pad) * 2) / 2, Math.ceil((hi + pad) * 2) / 2];
    const x = scaleLinear()
      .domain(domain)
      .range([PAD_X, W - PAD_X]);
    const items = points.map((p) => ({
      id: p.id,
      x: x(p.career),
      r: p.id === justice.id ? R_SUBJECT : R,
    }));
    const { dots, halfHeight } = layoutSwarm(items);
    const dotById = new Map(dots.map((d) => [d.id, d]));

    return { x, dotById, halfHeight, domain };
  }, [points, justice.id, range.min, range.max, W]);

  const labelsH = 6;
  const swarmH = geo.halfHeight * 2;
  const height = labelsH + swarmH + AXIS_H + RANGE_H;
  const axisY = labelsH + swarmH;
  const midY = labelsH + geo.halfHeight;

  const tier = (p: SwarmPoint): 0 | 1 | 2 =>
    p.id === justice.id ? 2 : (mode === "alongside" ? p.alongside : p.neighbor) ? 1 : 0;
  const ordered = [...points].sort((a, b) => tier(a) - tier(b));

  const ticks: number[] = [];
  for (let v = Math.ceil(geo.domain[0] / 2) * 2; v <= geo.domain[1]; v += 2) ticks.push(v);
  const color = partyVar(justice.party);
  const { x } = geo;

  return (
    <div ref={ref}>
      <ChartFrame
        width={W}
        height={height}
        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        ariaLabel={`Beeswarm of every justice's career-average score; ${justice.name} is ringed`}
        svgProps={{ style: { touchAction: "pan-y" } }}
      >
        {() => (
          <>
            <Axis
              scale={x}
              orientation="bottom"
              ticks={ticks}
              offset={axisY}
              gridExtent={swarmH + 4}
              zeroAt={0}
              format={(v) => (v === 0 ? "0" : v > 0 ? `+${v}` : `−${Math.abs(v)}`)}
            />

            {ordered.map((p) => {
              const d = geo.dotById.get(p.id)!;
              const t = tier(p);
              const isSubject = t === 2;
              const href = justicePath(p);
              return (
                <g key={p.id}>
                  {isSubject && (
                    <circle
                      cx={d.x}
                      cy={midY + d.y}
                      r={R_SUBJECT + 3.5}
                      fill="none"
                      stroke="var(--ink)"
                      strokeWidth={1.6}
                    />
                  )}
                  <circle
                    cx={d.x}
                    cy={midY + d.y}
                    r={isSubject ? R_SUBJECT : R}
                    fill={partyVar(p.party)}
                    stroke="var(--surface)"
                    strokeWidth={1.25}
                    opacity={t === 0 ? 0.22 : 1}
                    style={isSubject ? undefined : { cursor: "pointer" }}
                    onPointerEnter={(e) => tip.show(p, e)}
                    onPointerMove={tip.move}
                    onPointerLeave={tip.hide}
                    onClick={isSubject ? undefined : () => router.push(href)}
                  />
                </g>
              );
            })}

            {/* Range of the subject's per-term scores. */}
            <g transform={`translate(0 ${axisY + AXIS_H + 4})`}>
              {range.min === range.max ? (
                <circle cx={x(range.min)} cy={6} r={4} fill={color} />
              ) : (
                <line
                  x1={x(range.min)}
                  x2={x(range.max)}
                  y1={6}
                  y2={6}
                  stroke={color}
                  strokeWidth={4}
                  strokeLinecap="round"
                  opacity={0.85}
                />
              )}
              {range.min === range.max ? (
                <text x={Math.max(20, Math.min(W - 20, x(range.min)))} y={25} textAnchor="middle" fontSize={10.5} className="font-mono" fill="var(--ink-muted)">
                  {fmtScore(range.min)}
                </text>
              ) : (
                <>
                  <text x={Math.max(34, x(range.min) + 2)} y={25} textAnchor="end" fontSize={10.5} className="font-mono" fill="var(--ink-muted)">
                    {fmtScore(range.min)}
                  </text>
                  <text x={Math.min(W - 34, x(range.max) - 2)} y={25} textAnchor="start" fontSize={10.5} className="font-mono" fill="var(--ink-muted)">
                    {fmtScore(range.max)}
                  </text>
                </>
              )}
            </g>
          </>
        )}
      </ChartFrame>
      <p className="mt-1 text-center text-[0.72rem] text-ink-muted">
        {profile.last}&rsquo;s range across terms
      </p>

      <Tooltip state={tip.state}>
        {(p) => (
          <>
            <b>{p.name}</b>
            <div>{partyLabel(p.party)} appointee</div>
            <div className="tt-mono">Career average: {fmtScore(p.career)}</div>
          </>
        )}
      </Tooltip>
    </div>
  );
}
