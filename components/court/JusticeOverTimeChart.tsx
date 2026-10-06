"use client";

import { Y_GUTTER } from "@/lib/chart-bars";
import { useMemo } from "react";
import { scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Axis } from "@/components/charts/Axis";
import { Tooltip, useTooltip } from "@/components/charts/Tooltip";
import { useElementSize } from "@/lib/use-element-size";
import { fmtScore, partyLabel, termLabel } from "@/lib/court-types";
import type { JusticeProfile, PeerTrace } from "@/lib/justice-types";
import { partyVar, type JusticeMode } from "./justice-mode";

const FALLBACK = { width: 600, height: 420 };
/** Fixed chart height below md, where the cards stack and nothing stretches it. */
export const STACKED_CHART_HEIGHT = 340;
const LABEL_H = 13;
/** Conservative per-character width at the 11.5px label size. */
const charW = 6.4;

type Tip =
  | { kind: "peer"; peer: PeerTrace }
  | { kind: "term"; term: number; score: number; lo: number; hi: number; name: string };

/** Nudge labels apart vertically (input sorted by y), keeping them inside [0, max]. */
export function deCollide(ys: number[], gap: number, max: number): number[] {
  const out = [...ys];
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + gap);
  if (out.length && out[out.length - 1] > max) {
    out[out.length - 1] = max;
    for (let i = out.length - 2; i >= 0; i--) out[i] = Math.min(out[i], out[i + 1] - gap);
  }
  return out;
}

/** Ticks every five years within [a, b]; falls back to the two ends for a short tenure. */
export function yearTicks(a: number, b: number, step = 5): number[] {
  const out: number[] = [];
  for (let t = Math.ceil(a / step) * step; t <= b; t += step) out.push(t);
  if (out.length >= 2) return out;
  return a === b ? [a] : [a, b];
}

/**
 * "Ideology over time": the subject's score by term as a heavy party-coloured
 * line with its 95% credible band, every justice who shared a term with them as
 * a thin muted trace clipped to those shared terms, and the Court median as a
 * dashed line. The y domain is fitted to what this chart draws.
 * Modeled on `wealth/MemberNetWorthChart` (line + band, fills the height the
 * layout gives it) and `senate/SenatorTrajectoryChart`; built on the same
 * ChartFrame / Axis / Tooltip primitives.
 *
 * The plot fills its container: `fill` (md+) measures the box the grid row gave
 * it, otherwise it is `STACKED_CHART_HEIGHT` tall.
 */
export function JusticeOverTimeChart({
  profile,
  mode,
}: {
  profile: JusticeProfile;
  mode: JusticeMode;
}) {
  const [ref, measured] = useElementSize<HTMLDivElement>();
  const size = measured.width > 0 && measured.height > 0 ? measured : FALLBACK;
  const { justice, chart } = profile;
  const tip = useTooltip<Tip>();
  const narrow = size.width < 520;
  const { peers, median } = chart;

  // Zoom to what is drawn (this justice's band, the overlapping traces, the
  // median over their terms), not the league-wide extent.
  const domain = useMemo((): [number, number] => {
    const vals = [
      ...profile.justice.lo,
      ...profile.justice.hi,
      ...peers.flatMap((p) => p.s),
      ...median.filter((m) => m.term >= profile.justice.t0 && m.term <= profile.justice.t1).map((m) => m.median),
    ];
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = (hi - lo) * 0.05;
    return [Math.floor((lo - pad) * 2) / 2, Math.ceil((hi + pad) * 2) / 2];
  }, [profile.justice, peers, median]);

  const labeled = useMemo(() => {
    const show = (p: PeerTrace) =>
      narrow
        ? p.endsAtEdge
        : p.sharedTerms >= 10 || p.endsAtEdge || (mode === "neighbors" && p.isNeighbor);
    return peers.filter(show);
  }, [peers, narrow, mode]);

  const maxLabel = Math.max(
    justice.short.length * (charW + 0.6),
    ...labeled.map((p) => p.short.length * charW),
  );
  const margin = {
    top: 10,
    right: Math.min(Math.ceil(maxLabel) + 14, narrow ? 76 : 100),
    bottom: 28,
    left: Y_GUTTER,
  };

  const hi = (p: PeerTrace) => mode === "neighbors" && p.isNeighbor;
  const faded = (p: PeerTrace) => mode === "neighbors" && !p.isNeighbor;
  const ordered = [...peers].sort((a, b) => Number(hi(a)) - Number(hi(b)));

  return (
    <div ref={ref} className="absolute inset-0">
      <ChartFrame
        width={size.width}
        height={size.height}
        margin={margin}
        ariaLabel={`Line chart of ${justice.name}'s ideology score by term with a credible interval, the ${peers.length} justices who overlapped, and the Court median`}
        svgProps={{ style: { touchAction: "pan-y" } }}
      >
        {({ innerWidth, innerHeight }) => {
          const t0 = justice.t0;
          const t1 = justice.t1;
          const single = t0 === t1;
          const x = scaleLinear()
            .domain(single ? [t0 - 1, t0 + 1] : [t0, t1])
            .range([0, innerWidth]);
          const y = scaleLinear().domain(domain).range([innerHeight, 0]);
          const ticks = yearTicks(t0, t1, narrow && t1 - t0 > 30 ? 10 : 5);
          const yTicks: number[] = [];
          const step = domain[1] - domain[0] <= 6 ? 1 : 2;
          for (let v = Math.ceil(domain[0] / step) * step; v <= domain[1]; v += step) yTicks.push(v);

          const path = (vals: number[], from: number) =>
            line<number>()
              .x((_, i) => x(from + i))
              .y((v) => y(v))(vals) ?? "";
          const band =
            area<number>()
              .x((_, i) => x(t0 + i))
              .y0((_, i) => y(justice.lo[i]))
              .y1((_, i) => y(justice.hi[i]))(justice.s) ?? "";
          const medianPath =
            line<(typeof median)[number]>()
              .x((m) => x(m.term))
              .y((m) => y(m.median))(median) ?? "";

          // End labels, de-collided vertically.
          const items = [
            {
              key: "subject",
              text: justice.short,
              x: x(t1),
              y: y(justice.s[justice.s.length - 1]),
              subject: true,
              color: partyVar(justice.party),
            },
            ...labeled.map((p) => ({
              key: String(p.id),
              text: p.short,
              x: x(p.t1),
              y: y(p.s[p.s.length - 1]),
              subject: false,
              color: "var(--ink-muted)",
            })),
          ].sort((a, b) => a.y - b.y);
          const ys = deCollide(
            items.map((i) => i.y),
            LABEL_H,
            innerHeight - 4,
          );

          const nearestTerm = (e: React.PointerEvent<SVGRectElement>) => {
            const ctm = e.currentTarget.getScreenCTM();
            if (!ctm) return null;
            const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
            const t = Math.round(x.invert(p.x));
            return Math.max(t0, Math.min(t1, t));
          };
          const showTerm = (e: React.PointerEvent<SVGRectElement>) => {
            const t = nearestTerm(e);
            if (t == null) return;
            const i = t - t0;
            const data: Tip = {
              kind: "term",
              term: t,
              score: justice.s[i],
              lo: justice.lo[i],
              hi: justice.hi[i],
              name: justice.short,
            };
            tip.show(data, e);
          };

          return (
            <>
              <Axis
                scale={y}
                orientation="left"
                ticks={yTicks}
                offset={0}
                gridExtent={innerWidth}
                zeroAt={0}
                format={(v) => (v === 0 ? "0" : v > 0 ? `+${v}` : `−${Math.abs(v)}`)}
              />
              <Axis
                scale={x}
                orientation="bottom"
                ticks={ticks}
                offset={innerHeight}
                format={(t) => String(t)}
              />
              <text x={6} y={14} fontSize={11} fontStyle="italic" fill="var(--ink-muted)">
                More conservative
              </text>
              <text x={6} y={innerHeight - 6} fontSize={11} fontStyle="italic" fill="var(--ink-muted)">
                More liberal
              </text>

              <rect
                x={0}
                y={0}
                width={innerWidth}
                height={innerHeight}
                fill="transparent"
                onPointerEnter={(e) => showTerm(e)}
                onPointerMove={(e) => showTerm(e)}
                onPointerLeave={tip.hide}
              />

              {!single && (
                <path d={band} fill={partyVar(justice.party)} opacity={0.16} pointerEvents="none" />
              )}
              {single && (
                <line
                  x1={x(t0)}
                  x2={x(t0)}
                  y1={y(justice.lo[0])}
                  y2={y(justice.hi[0])}
                  stroke={partyVar(justice.party)}
                  strokeWidth={9}
                  strokeLinecap="round"
                  opacity={0.16}
                  pointerEvents="none"
                />
              )}

              {median.length > 1 && (
                <path
                  d={medianPath}
                  fill="none"
                  stroke="var(--ink-faint)"
                  strokeWidth={1.6}
                  strokeDasharray="5 4"
                  pointerEvents="none"
                />
              )}

              {ordered.map((p) => {
                const color = partyVar(p.party);
                const strong = hi(p);
                const opacity = strong ? 0.95 : faded(p) ? 0.2 : 0.5;
                const w = strong ? 2.4 : 1.2;
                return (
                  <g key={p.id}>
                    {p.s.length === 1 ? (
                      <circle
                        cx={x(p.t0)}
                        cy={y(p.s[0])}
                        r={strong ? 3.6 : 2.6}
                        fill={color}
                        opacity={opacity}
                        pointerEvents="none"
                      />
                    ) : (
                      <path
                        d={path(p.s, p.t0)}
                        fill="none"
                        stroke={color}
                        strokeWidth={w}
                        opacity={opacity}
                        strokeLinejoin="round"
                        pointerEvents="none"
                      />
                    )}
                    {/* Wide invisible hit target: thin lines are hard to hover. */}
                    {p.s.length === 1 ? (
                      <circle
                        cx={x(p.t0)}
                        cy={y(p.s[0])}
                        r={8}
                        fill="transparent"
                        onPointerEnter={(e) => tip.show({ kind: "peer", peer: p }, e)}
                        onPointerMove={tip.move}
                        onPointerLeave={tip.hide}
                      />
                    ) : (
                      <path
                        d={path(p.s, p.t0)}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={10}
                        onPointerEnter={(e) => tip.show({ kind: "peer", peer: p }, e)}
                        onPointerMove={tip.move}
                        onPointerLeave={tip.hide}
                      />
                    )}
                  </g>
                );
              })}

              {justice.s.length > 1 && (
                <path
                  d={path(justice.s, t0)}
                  fill="none"
                  stroke={partyVar(justice.party)}
                  strokeWidth={3.2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  pointerEvents="none"
                />
              )}
              <circle
                cx={x(t1)}
                cy={y(justice.s[justice.s.length - 1])}
                r={5.5}
                fill={partyVar(justice.party)}
                stroke="var(--surface)"
                strokeWidth={2}
                pointerEvents="none"
              />

              {items.map((it, i) => (
                <text
                  key={it.key}
                  x={it.x + 9}
                  y={ys[i] + 4}
                  fontSize={it.subject ? 12.5 : 11.5}
                  fontWeight={it.subject ? 700 : 500}
                  fill={it.color}
                  stroke="var(--surface)"
                  strokeWidth={3}
                  paintOrder="stroke"
                  strokeLinejoin="round"
                  pointerEvents="none"
                >
                  {it.text}
                </text>
              ))}
            </>
          );
        }}
      </ChartFrame>

      <Tooltip state={tip.state}>
        {(t) =>
          t.kind === "peer" ? (
            <>
              <b>{t.peer.name}</b>
              <div>{partyLabel(t.peer.party)} appointee</div>
              <div className="tt-mono">
                Shared terms: {t.peer.t0}–{t.peer.t1}
              </div>
              <div className="tt-mono">Career average: {fmtScore(t.peer.career)}</div>
            </>
          ) : (
            <>
              <b>{t.name}</b>
              <div className="tt-mono">
                {termLabel(t.term)}: {fmtScore(t.score)}
              </div>
              <div className="tt-mono">
                95% interval {fmtScore(t.lo)} to {fmtScore(t.hi)}
              </div>
            </>
          )
        }
      </Tooltip>
    </div>
  );
}

export function ChartLegend({ profile }: { profile: JusticeProfile }) {
  const color = partyVar(profile.justice.party);
  return (
    <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.72rem] text-ink-muted">
      <li className="flex items-center gap-1.5">
        <svg width="22" height="8" aria-hidden className="flex-none">
          <line x1="0" y1="4" x2="22" y2="4" stroke={color} strokeWidth={3.2} strokeLinecap="round" />
        </svg>
        {profile.justice.name}
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="inline-block h-2.5 w-5 rounded-sm" style={{ background: color, opacity: 0.22 }} />
        95% credible interval
      </li>
      <li className="flex items-center gap-1.5">
        <svg width="22" height="8" aria-hidden className="flex-none">
          <line x1="0" y1="4" x2="22" y2="4" stroke="var(--dem)" strokeWidth={1.4} opacity={0.6} />
        </svg>
        Peer, appointed by a Democrat
      </li>
      <li className="flex items-center gap-1.5">
        <svg width="22" height="8" aria-hidden className="flex-none">
          <line x1="0" y1="4" x2="22" y2="4" stroke="var(--rep)" strokeWidth={1.4} opacity={0.6} />
        </svg>
        Peer, appointed by a Republican
      </li>
      <li className="flex items-center gap-1.5">
        <svg width="22" height="8" aria-hidden className="flex-none">
          <line x1="0" y1="4" x2="22" y2="4" stroke="var(--ink-faint)" strokeWidth={1.6} strokeDasharray="5 4" />
        </svg>
        Court median
      </li>
    </ul>
  );
}
