"use client";

import { useMemo } from "react";
import { TableView } from "@/components/decisions/shared";
import { STAGES, flowLayout, stageVar, type StageCounts } from "@/lib/committee-bills-derive";
import type { Stage } from "@/lib/committee-bills-types";
import { fmtInt } from "@/lib/decisions-derive";
import { useElementWidth } from "@/lib/use-element-width";
import { FOCUS_RING, pct } from "./shared";
import type { StageView } from "./StageTiles";

const NARROW = 760;

/**
 * Where bills go after referral: a node for the bills that reached each step (top), a band to the next step, and a block for
 * the bills that ended at each step (bottom). Band widths are proportional to counts, drawn at least 1.5px so a handful of
 * bills stays visible. A block is a filter: a "reached" block shows bills that got that far, a bottom block those that ended there.
 */
export function FlowChart({ counts, pick, view, onPick }: { counts: StageCounts; pick: Stage | null; view: StageView; onPick: (k: Stage | null, v: StageView) => void }) {
  const [ref, measured] = useElementWidth<HTMLDivElement>();
  const width = measured || 960;
  const narrow = width < NARROW;
  const total = counts.reach[1] ?? 0;
  const height = narrow ? 296 : 330;
  const TOP = narrow ? 38 : 40;
  const BOTTOM = 34;
  const layout = useMemo(() => flowLayout(counts, { width, height, top: TOP, bottom: BOTTOM, nodeW: narrow ? 10 : 14, padL: 4, padR: narrow ? 44 : 120 }), [counts, width, height, narrow, TOP]);
  const dim = (kind: "reach" | "stop", k: Stage) => pick !== null && !(pick === k && view === kind) && 0.45;

  return (
    <div>
      <div ref={ref} data-sticky-tip className="relative -mx-3 touch-pan-y sm:mx-0">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Flow of bills through the committee's steps, from referral to law" className="block max-w-full overflow-visible">
          <g>
            {layout.links.map((l) => (
              <path key={l.id} d={l.d} fill={stageVar(l.stage)} opacity={dim(l.kind, l.stage) || 0.38} pointerEvents="none">
                <title>{`${fmtInt(l.value)} ${l.kind === "reach" ? `reached ${STAGES[l.stage - 1]!.label}` : `ended at ${STAGES[l.stage - 1]!.label}`}`}</title>
              </path>
            ))}
          </g>
          <g>
            {layout.nodes.map((n) => {
              const label = n.kind === "reach" ? `${STAGES[n.stage - 1]!.label} or beyond: ${fmtInt(n.value)} (${pct(n.value, total)})` : `Ended at ${STAGES[n.stage - 1]!.label}: ${fmtInt(n.value)} (${pct(n.value, total)})`;
              const on = pick === n.stage && view === n.kind;
              return (
                <rect
                  key={n.id}
                  x={n.x}
                  y={n.y}
                  width={n.w}
                  height={n.h}
                  rx={2}
                  fill={stageVar(n.stage)}
                  opacity={dim(n.kind, n.stage) || 1}
                  stroke={on ? "var(--ink)" : "none"}
                  strokeWidth={on ? 1.5 : 0}
                  role="button"
                  tabIndex={0}
                  aria-pressed={on}
                  aria-label={label}
                  className={`cursor-pointer outline-none focus-visible:[stroke:var(--focus)] focus-visible:[stroke-width:2] ${FOCUS_RING}`}
                  onClick={() => onPick(on ? null : n.stage, n.kind)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onPick(on ? null : n.stage, n.kind);
                    }
                  }}
                >
                  <title>{label}</title>
                </rect>
              );
            })}
          </g>
          <g className="pointer-events-none">
            {layout.nodes
              .filter((n) => n.kind === "reach")
              .map((n) => {
                const name = narrow ? STAGES[n.stage - 1]!.short : n.stage === 1 ? "Referred (all)" : n.stage === 6 ? "Became law" : `${STAGES[n.stage - 1]!.label} or beyond`;
                return (
                  <g key={n.id}>
                    <text x={n.x} y={TOP - 21} className="fill-ink text-[11px] font-semibold">
                      {fmtInt(n.value)}
                      {narrow || n.stage === 1 ? "" : ` (${pct(n.value, total)})`}
                    </text>
                    <text x={n.x} y={TOP - 8} className="fill-ink-muted text-[11px]">
                      {name}
                    </text>
                  </g>
                );
              })}
            {layout.nodes
              .filter((n) => n.kind === "stop")
              .map((n) => (
                <g key={n.id}>
                  <text x={n.x + n.w / 2} y={height - BOTTOM + 14} textAnchor="middle" className="fill-ink text-[11px] font-semibold">
                    {fmtInt(n.value)}
                    {narrow ? "" : ` (${pct(n.value, total)})`}
                  </text>
                  <text x={n.x + n.w / 2} y={height - BOTTOM + 26} textAnchor="middle" className="fill-ink-muted text-[11px]">
                    {narrow ? `at ${STAGES[n.stage - 1]!.short}` : `ended at ${STAGES[n.stage - 1]!.label}`}
                  </text>
                </g>
              ))}
          </g>
        </svg>
      </div>
      <TableView
        label="Bills by furthest step, as a table"
        head={["Step", "Stopped here", "Got this far"]}
        rows={STAGES.map((s) => [s.label, counts.stop[s.k] ?? 0, counts.reach[s.k] ?? 0])}
      />
    </div>
  );
}
