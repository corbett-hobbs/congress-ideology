"use client";

import { Y_GUTTER } from "@/lib/chart-bars";
import { useId, useMemo, useState } from "react";
import { scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Axis } from "@/components/charts/Axis";
import { Tooltip, useTooltip } from "@/components/charts/Tooltip";
import { useElementWidth } from "@/lib/use-element-width";
import {
  fmtScore,
  isDimmed,
  isSeated,
  partyLabel,
  scoreAt,
  type CourtFilter,
  type CourtJustice,
  type CourtPayload,
} from "@/lib/court-types";

const FALLBACK_W = 1100;
const H = 340;
const MARGIN = { top: 14, right: 14, bottom: 30, left: Y_GUTTER };
const partyVar = (j: CourtJustice) => (j.party === "D" ? "var(--dem)" : "var(--rep)");

/**
 * "How each justice moved": every justice's score by term, one faint party-
 * coloured line each, a bold Court-median line, a playhead on the shared term
 * and — for the selected justice — the real 95% interval band, clipped to the
 * plot. Click or drag the background to scrub the shared term.
 */
export function JusticeTrajectory({
  data,
  term,
  filter,
  selectedId,
  onSelect,
  onScrub,
}: {
  data: CourtPayload;
  term: number;
  filter: CourtFilter;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onScrub: (t: number) => void;
}) {
  const [wrapRef, measuredW] = useElementWidth<HTMLDivElement>();
  const W = measuredW || FALLBACK_W;
  const clipId = `court-clip-${useId().replace(/:/g, "")}`;
  const [hoverId, setHoverId] = useState<number | null>(null);
  const tip = useTooltip<CourtJustice>();
  const { firstTerm, lastTerm } = data;

  const yearStep = W < 600 ? 20 : 10;
  const yearTicks = useMemo(() => {
    const out: number[] = [];
    for (let t = Math.ceil(firstTerm / yearStep) * yearStep; t <= lastTerm; t += yearStep)
      out.push(t);
    return out;
  }, [firstTerm, lastTerm, yearStep]);

  const focusId = hoverId ?? selectedId;
  const byId = new Map(data.justices.map((j) => [j.id, j]));
  const focus = focusId != null ? (byId.get(focusId) ?? null) : null;
  const selected = selectedId != null ? (byId.get(selectedId) ?? null) : null;

  return (
    <div ref={wrapRef}>
      <ChartFrame
        width={W}
        height={H}
        margin={MARGIN}
        ariaLabel="Line chart of each justice's ideology score by term, with the Court median"
      >
        {({ innerWidth, innerHeight }) => {
          const x = scaleLinear().domain([firstTerm, lastTerm]).range([0, innerWidth]);
          const y = scaleLinear().domain(data.domain).range([innerHeight, 0]);

          const yTicks: number[] = [];
          for (let v = Math.ceil(data.domain[0] / 2) * 2; v <= data.domain[1]; v += 2) yTicks.push(v);

          const path = (j: CourtJustice) =>
            line<number>()
              .x((_, i) => x(j.t0 + i))
              .y((v) => y(v))(j.s) ?? "";

          const band = (j: CourtJustice) =>
            area<number>()
              .x((_, i) => x(j.t0 + i))
              .y0((_, i) => y(j.lo[i]))
              .y1((_, i) => y(j.hi[i]))(j.s) ?? "";

          const medianPath =
            line<(typeof data.terms)[number]>()
              .x((t) => x(t.term))
              .y((t) => y(t.median))(data.terms) ?? "";

          const scrub = (e: React.PointerEvent<SVGRectElement>) => {
            const ctm = e.currentTarget.getScreenCTM();
            if (!ctm) return;
            const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
            const t = Math.round(x.invert(p.x));
            onScrub(Math.max(firstTerm, Math.min(lastTerm, t)));
          };

          // Dimmed lines draw first so the matching ones sit on top.
          const order = [...data.justices].sort(
            (a, b) => Number(isDimmed(b, filter)) - Number(isDimmed(a, filter)),
          );

          let endLabel: React.ReactNode = null;
          if (focus) {
            const ex = x(focus.t1);
            const ey = y(focus.s[focus.s.length - 1]);
            const fits = ex + 6 + focus.short.length * 7.2 <= innerWidth + MARGIN.right - 2;
            endLabel = (
              <text
                x={fits ? ex + 6 : ex - 4}
                y={fits ? ey + 4 : ey - 9}
                textAnchor={fits ? "start" : "end"}
                fill={partyVar(focus)}
                fontSize={12.5}
                fontWeight={600}
                pointerEvents="none"
              >
                {focus.short}
              </text>
            );
          }

          return (
            <>
              <defs>
                <clipPath id={clipId}>
                  <rect x={0} y={0} width={innerWidth} height={innerHeight} />
                </clipPath>
              </defs>

              <Axis
                scale={x}
                orientation="bottom"
                ticks={yearTicks}
                offset={innerHeight}
                gridExtent={innerHeight}
                format={(t) => String(t)}
              />
              <Axis
                scale={y}
                orientation="left"
                ticks={yTicks}
                offset={0}
                gridExtent={innerWidth}
                zeroAt={0}
                format={(v) => (v === 0 ? "0" : v > 0 ? `+${v}` : `−${Math.abs(v)}`)}
              />
              <text x={4} y={12} fill="var(--ink-muted)" fontSize={12}>
                More conservative
              </text>
              <text x={4} y={innerHeight - 6} fill="var(--ink-muted)" fontSize={12}>
                More liberal
              </text>

              <rect
                x={0}
                y={0}
                width={innerWidth}
                height={innerHeight}
                fill="transparent"
                style={{ cursor: "crosshair" }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  scrub(e);
                }}
                onPointerMove={(e) => {
                  if (e.buttons) scrub(e);
                }}
              />

              {selected && (
                <path
                  d={band(selected)}
                  fill={partyVar(selected)}
                  opacity={0.16}
                  clipPath={`url(#${clipId})`}
                  pointerEvents="none"
                />
              )}

              {order.map((j) => {
                const f = focusId === j.id;
                const dim = isDimmed(j, filter);
                return (
                  <g key={j.id}>
                    <path
                      d={path(j)}
                      fill="none"
                      stroke={partyVar(j)}
                      strokeWidth={f ? 3 : 1.3}
                      strokeLinejoin="round"
                      opacity={f ? 1 : dim ? 0.07 : focusId != null ? 0.16 : 0.38}
                      pointerEvents="none"
                    />
                    <path
                      d={path(j)}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={10}
                      style={{ cursor: "pointer" }}
                      onPointerEnter={(e) => {
                        setHoverId(j.id);
                        tip.show(j, e);
                      }}
                      onPointerMove={tip.move}
                      onPointerLeave={() => {
                        setHoverId(null);
                        tip.hide();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(j.id);
                      }}
                    />
                  </g>
                );
              })}
              {endLabel}

              <path
                d={medianPath}
                fill="none"
                stroke="var(--ink)"
                strokeWidth={2.8}
                strokeLinejoin="round"
                pointerEvents="none"
              />

              <line
                className="trend-playhead"
                x1={x(term)}
                x2={x(term)}
                y1={0}
                y2={innerHeight}
                pointerEvents="none"
              />
              {data.justices
                .filter((j) => isSeated(j, term))
                .map((j) => (
                  <circle
                    key={j.id}
                    cx={x(term)}
                    cy={y(scoreAt(j, term))}
                    r={3.2}
                    fill={partyVar(j)}
                    opacity={isDimmed(j, filter) ? 0.2 : 1}
                    pointerEvents="none"
                  />
                ))}
            </>
          );
        }}
      </ChartFrame>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.72rem] text-ink-muted">
        <Swatch color="var(--dem)" label="Democratic appointee" />
        <Swatch color="var(--rep)" label="Republican appointee" />
        <Swatch color="var(--ink)" label="Court median" thick />
        {selected && (
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-5 rounded-sm"
              style={{ background: partyVar(selected), opacity: 0.25 }}
            />
            {selected.short}&rsquo;s 95% interval
          </span>
        )}
      </div>

      <Tooltip state={tip.state}>
        {(j) => (
          <>
            <b>{j.name}</b>
            <div>
              Appointed by {j.pres} ({partyLabel(j.party)})
            </div>
            <div className="tt-mono">
              Scored terms: {j.t0}–{j.t1}
            </div>
            <div className="tt-mono">Career average: {fmtScore(j.career)}</div>
          </>
        )}
      </Tooltip>
    </div>
  );
}

function Swatch({ color, label, thick }: { color: string; label: string; thick?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="20" height="8" viewBox="0 0 20 8" aria-hidden className="flex-none">
        <line x1="0" y1="4" x2="20" y2="4" stroke={color} strokeWidth={thick ? 2.8 : 2.25} />
      </svg>
      {label}
    </span>
  );
}
