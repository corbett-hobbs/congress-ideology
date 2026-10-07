"use client";

import { useMemo, type PointerEvent } from "react";
import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";
import { Axis } from "@/components/charts/Axis";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { ExampleMarks, aboveFlags, pickExample } from "@/components/charts/ExampleMarks";
import { LegendToggle, useIsolate } from "@/components/charts/LegendToggle";
import { LEGEND_ITEM, LEGEND_ROW } from "@/components/charts/legend";
import { TERM_BAND_H, TermBandSvg } from "@/components/charts/TermBandSvg";
import { Tooltip, useStickyTooltip } from "@/components/charts/Tooltip";
import { Y_GUTTER } from "@/lib/chart-bars";
import { congressSpan, fmtAge, presidentById, termSegmentsFor, type AgeMeasure } from "@/lib/demographics-chart";
import type { DemoCongress, DemoPresident } from "@/lib/demographics-types";
import { useElementWidth } from "@/lib/use-element-width";
import { TooltipCard } from "./shared";

type Caucus = "D" | "R";
const LINES: { k: Caucus; label: string; color: string }[] = [
  { k: "D", label: "Democrats", color: "var(--dem)" },
  { k: "R", label: "Republicans", color: "var(--rep)" },
];
const MARGIN = { top: 16, right: 10, left: Y_GUTTER };
const AXIS_H = 28;
const NARROW_W = 560;

/** Age by caucus, one point per Congress on the same slots as the bar charts below it, so the term band and playhead line up. */
export function AgeChart({ rows, presidents, measure, pin, onPin }: { rows: readonly DemoCongress[]; presidents: readonly DemoPresident[]; measure: AgeMeasure; pin: number | null; onPin: (c: number | null) => void }) {
  const [wrapRef, measured] = useElementWidth<HTMLDivElement>();
  const width = measured || 960;
  const narrow = width < NARROW_W;
  const height = (narrow ? 250 : 290) + TERM_BAND_H + 6;
  const [only, isolate] = useIsolate<Caucus>();
  const tip = useStickyTooltip<DemoCongress>();
  const segs = useMemo(() => termSegmentsFor(rows, presidents), [rows, presidents]);
  const by = useMemo(() => presidentById(presidents), [presidents]);
  const val = (r: DemoCongress, k: Caucus) => r.age[k][measure];
  const shown = LINES.filter((l) => only === null || only === l.k);

  const nums = rows.flatMap((r) => shown.map((l) => val(r, l.k))).filter((v): v is number => v !== null);
  const lo = nums.length ? Math.min(...nums) : 40;
  const hi = nums.length ? Math.max(...nums) : 70;

  return (
    <div>
      <div ref={wrapRef} data-sticky-tip className="relative -mx-3 sm:mx-0">
        <ChartFrame width={width} height={height} margin={{ ...MARGIN, bottom: AXIS_H + TERM_BAND_H + 6 }} ariaLabel={`Line chart of ${measure} age by caucus, one point per Congress`} onPointerLeave={tip.leave}>
          {({ innerWidth, innerHeight }) => {
            const y = scaleLinear().domain([Math.floor(lo) - 1, Math.ceil(hi) + 1]).range([innerHeight, 0]).nice(5);
            const step = innerWidth / Math.max(1, rows.length);
            const xOf = (i: number) => (i + 0.5) * step;
            const every = Math.max(1, Math.ceil((narrow ? 30 : 44) / step));
            const path = (k: Caucus) =>
              line<DemoCongress>()
                .defined((r) => val(r, k) !== null)
                .x((_, i) => xOf(i))
                .y((r) => y(val(r, k) as number))(rows as DemoCongress[]);
            const picks = shown.flatMap((l) => {
              const p = pickExample(rows.map((r, i) => ({ day: i, value: val(r, l.k) })), [0, rows.length]);
              return p && p.value !== null ? [{ l, i: p.day, v: p.value }] : [];
            });
            const above = aboveFlags(picks.map((p) => ({ value: p.v })));
            const marks = picks.map((p, j) => ({ x: xOf(p.i), y: y(p.v), above: above[j], color: p.l.color, text: `${rows[p.i].year}: ${fmtAge(p.v)}` }));
            const pinned = rows.findIndex((r) => r.congress === pin);
            const hit = (e: PointerEvent<SVGRectElement>) => {
              const b = e.currentTarget.getBoundingClientRect();
              return Math.min(rows.length - 1, Math.max(0, Math.floor(((e.clientX - b.left) / b.width) * rows.length)));
            };
            return (
              <>
                <Axis scale={y} orientation="left" ticks={y.ticks(5)} offset={0} gridExtent={innerWidth} format={(v) => String(v)} />
                {shown.map((l) => (
                  <path key={l.k} d={path(l.k) ?? ""} fill="none" stroke={l.color} strokeWidth={2.25} strokeLinejoin="round" />
                ))}
                <ExampleMarks marks={marks} left={0} right={innerWidth} top={0} bottom={innerHeight} faded={pinned >= 0 || tip.state != null} />
                {pinned >= 0 && (
                  <g pointerEvents="none">
                    <line x1={xOf(pinned)} x2={xOf(pinned)} y1={0} y2={innerHeight} stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="4 3" />
                    {shown.map((l) => (val(rows[pinned], l.k) === null ? null : <circle key={l.k} cx={xOf(pinned)} cy={y(val(rows[pinned], l.k) as number)} r={4} fill={l.color} stroke="var(--surface)" strokeWidth={1.5} />))}
                  </g>
                )}
                {rows.map((r, i) => {
                  const show = i % every === 0 || i === rows.length - 1;
                  const crowded = i !== rows.length - 1 && rows.length - 1 - i < every / 2;
                  if (!show || crowded) return null;
                  return (
                    <g key={r.congress} transform={`translate(${xOf(i)},${innerHeight})`}>
                      <line className="grid-line" y1={0} y2={5} />
                      <text className="axis-tick-label" y={18} textAnchor="middle">
                        {narrow ? `’${String(r.year).slice(2)}` : r.year}
                      </text>
                    </g>
                  );
                })}
                <TermBandSvg segments={segs} x0={0} step={step} y={innerHeight + AXIS_H + 6} />
                <rect
                  x={0}
                  y={0}
                  width={innerWidth}
                  height={innerHeight}
                  fill="transparent"
                  style={{ cursor: "pointer", touchAction: "pan-y" }}
                  onPointerDown={(e) => {
                    if (e.pointerType === "mouse") return;
                    const r = rows[hit(e)];
                    tip.down(e, tip.state?.data === r);
                    tip.show(r, e);
                  }}
                  onPointerEnter={(e) => e.pointerType === "mouse" && tip.show(rows[hit(e)], e)}
                  onPointerMove={(e) => {
                    const r = rows[hit(e)];
                    if (tip.state && tip.state.data !== r) {
                      tip.moved();
                      tip.show(r, e);
                    } else tip.move(e);
                  }}
                  onPointerUp={tip.up}
                  onPointerCancel={tip.moved}
                  onClick={(e) => {
                    const c = rows[hit(e as unknown as PointerEvent<SVGRectElement>)].congress;
                    onPin(pin === c ? null : c);
                  }}
                />
              </>
            );
          }}
        </ChartFrame>
        <Tooltip state={tip.state}>
          {(r) => (
            <TooltipCard title={congressSpan(r)} sub={by.get(r.termId)?.president ? `${by.get(r.termId)?.president} was president on the first day` : undefined}>
              {LINES.map((l) => (
                <div key={l.k} className="whitespace-nowrap">
                  <span style={{ color: l.color }}>●</span> {l.label}: {fmtAge(val(r, l.k))} <span className="text-ink-muted">· {r.age[l.k].n} members</span>
                </div>
              ))}
            </TooltipCard>
          )}
        </Tooltip>
      </div>
      <div className={`mt-2 ${LEGEND_ROW}`}>
        {LINES.map((l) => (
          <LegendToggle key={l.k} active={only === l.k} dimmed={only !== null && only !== l.k} onClick={() => isolate(l.k)}>
            <span className={LEGEND_ITEM}>
              <svg width="20" height="8" viewBox="0 0 20 8" aria-hidden className="flex-none">
                <line x1="0" y1="4" x2="20" y2="4" stroke={l.color} strokeWidth={2.25} />
              </svg>
              {l.label}
            </span>
          </LegendToggle>
        ))}
      </div>
    </div>
  );
}
