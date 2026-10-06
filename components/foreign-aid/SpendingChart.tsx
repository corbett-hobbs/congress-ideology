"use client";

import { initialsOf, termLabelCandidates } from "@/lib/term-label";
import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { scaleLinear } from "d3-scale";
import { Axis } from "@/components/charts/Axis";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { Tooltip, useStickyTooltip } from "@/components/charts/Tooltip";
import { useElementWidth } from "@/lib/use-element-width";
import { findExtremes } from "@/lib/chart-extremes";
import { SEGMENT_LABEL_STYLE, segmentLabelFits, yGutter } from "@/lib/chart-bars";
import { administrationForTermLabel } from "./term-labels";
import { SLOT_NAME, fiscalYearSpan, formatAidAxis, formatAidMoney, niceDollarTicks, type SpendingYear } from "@/lib/foreign-aid-derive";
import { useAidState } from "./ForeignAidState";
import { HatchDefs, slotColor } from "./shared";

const NARROW_W = 520;
const AXIS_H = 18;
const BAND_H = 20;

/**
 * Stacked bars by sector, one per fiscal year, with a presidential-term band under the axis. Reads the
 * shared state: the year window (President), the country's own dollars, the sector filter. Click or drag
 * sets the fiscal year; arrow keys move it when the chart has focus. Partial years are hatched.
 */
export function SpendingChart({ rows }: { rows: SpendingYear[] }) {
  const { data, year, range, setYear, isPartial, country, sector } = useAidState();
  const { terms, countries, sectors } = data.payload;
  const [wrapRef, measured] = useElementWidth<HTMLDivElement>();
  const width = measured || 960;
  const narrow = width < NARROW_W;
  const height = narrow ? 250 : 320;
  const mr = 6;
  const mt = 28;
  const mb = AXIS_H + BAND_H + 6;
  const max = Math.max(0, ...rows.map((r) => r.drawn));
  const { ticks, top } = niceDollarTicks(max);
  const ml = yGutter(ticks.map(formatAidAxis)); // y labels sit in a gutter left of the plot
  const innerW = width - ml - mr;
  const innerH = height - mt - mb;
  const n = rows.length;
  const step = innerW / n;
  const xOf = (i: number) => i * step;
  const hatchId = useId().replace(/:/g, "");
  const tip = useStickyTooltip<SpendingYear>();
  const [hover, setHover] = useState(-1);
  const down = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const y = scaleLinear().domain([0, top]).range([innerH, 0]);
  const bw = Math.min(Math.max(2, step * 0.72), 64);
  const si = year - range[0];

  const indexAt = (e: { clientX: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return Math.min(n - 1, Math.max(0, Math.floor((e.clientX - r.left - ml) / step)));
  };
  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    down.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const i = indexAt(e);
    tip.down(e, tip.state?.data === rows[i]);
    setYear(range[0] + i);
    tip.show(rows[i], e);
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const i = indexAt(e);
    if (down.current && tip.state?.data !== rows[i]) tip.moved();
    if (down.current) setYear(range[0] + i);
    setHover(i);
    tip.show(rows[i], e);
  };
  const onUp = () => {
    down.current = false;
    tip.up();
  };
  const onLeave = (e: PointerEvent<SVGSVGElement>) => {
    down.current = false;
    setHover(-1);
    tip.leave(e);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : e.key === "Home" ? -99 : e.key === "End" ? 99 : 0;
    if (!d) return;
    e.preventDefault();
    setYear(Math.abs(d) === 99 ? (d < 0 ? range[0] : range[1]) : year + d);
  };

  const visible = terms.map((t) => ({ t, s: Math.max(t.fromFy, range[0]), e: Math.min(t.toFy, range[1]) })).filter((o) => o.s <= o.e);
  // Peak and low fiscal year of the drawn totals, labelled above their bars (the same idea as the
  // line charts and the executive-orders bars). Complete years only: a partial year is always low.
  // `rows` already carry the Country and Sector filters, so the labels are recalculated for what is drawn.
  const marks = (() => {
    const { peak, low } = findExtremes(rows.map((r, i) => ({ day: i, value: isPartial(r.fy) || r.drawn <= 0 ? null : r.drawn })));
    return [peak, low].flatMap((p) => (p && p.day !== si ? [{ i: p.day, text: `FY${rows[p.day].fy}: ${formatAidMoney(rows[p.day].drawn)}` }] : []));
  })();
  const chipLabel = `FY${year}${isPartial(year) ? " · partial" : ""}`;
  const chipW = chipLabel.length * 6.6;

  return (
    <div
      ref={wrapRef}
      data-sticky-tip
      className="relative -mx-3 sm:mx-0 touch-scroll outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      tabIndex={0}
      onKeyDown={onKey}
      role="group"
      aria-label="Spending chart. Left and right arrow keys change the fiscal year."
    >
      <ChartFrame
        width={width}
        height={height}
        margin={{ top: mt, right: mr, bottom: mb, left: ml }}
        ariaLabel={`Stacked bars of U.S. foreign assistance disbursements by fiscal year, FY${range[0]} to FY${range[1]}${country >= 0 ? `, ${countries[country].name} only` : ""}${sector >= 0 ? `, ${sectors[sector]} only` : ""}`}
        svgRef={svgRef}
        onPointerLeave={onLeave}
        svgProps={{ onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp, style: { cursor: "crosshair", touchAction: "pan-y" } }}
      >
        {() => (
          <>
            <HatchDefs id={hatchId} />
            <Axis scale={y} orientation="left" ticks={ticks} offset={0} gridExtent={innerW} format={formatAidAxis} zeroAt={0} />
            {si >= 0 && si < n && <rect x={xOf(si)} y={-4} width={step} height={innerH + 4} rx={2} style={{ fill: "var(--surface-raised)", stroke: "var(--line-strong)" }} />}
            {hover >= 0 && hover < n && hover !== si && (
              <rect x={xOf(hover)} y={-4} width={step} height={innerH + 4} rx={2} style={{ fill: "none", stroke: "var(--line-strong)", strokeDasharray: "3 3" }} />
            )}
            {rows.map((r, i) => {
              const x = xOf(i) + (step - bw) / 2;
              let acc = 0;
              const partial = isPartial(r.fy);
              return (
                <g key={r.fy}>
                  {r.slots.map((v, k) => {
                    if (v <= 0) return null;
                    const y1 = y(acc + v);
                    const h = y(acc) - y1;
                    acc += v;
                    return <rect key={k} x={x} y={y1} width={bw} height={Math.max(h, 0)} style={{ fill: slotColor(k) }} />;
                  })}
                  {partial && acc > 0 && (
                    <>
                      <rect x={x} y={y(acc)} width={bw} height={y(0) - y(acc)} fill={`url(#${hatchId})`} />
                      <rect x={x} y={y(acc)} width={bw} height={y(0) - y(acc)} style={{ fill: "none", stroke: "var(--ink-muted)", strokeDasharray: "3 2" }} />
                    </>
                  )}
                  {/* Segment values, only where the segment is tall and wide enough to hold them. */}
                  {(() => {
                    let a = 0;
                    return r.slots.map((v, k) => {
                      if (v <= 0) return null;
                      const y1 = y(a + v);
                      const h = y(a) - y1;
                      a += v;
                      const t = formatAidMoney(v);
                      return segmentLabelFits(h, bw, t) ? (
                        <text key={k} x={x + bw / 2} y={y1 + h / 2} dy="0.35em" textAnchor="middle" style={SEGMENT_LABEL_STYLE}>
                          {t}
                        </text>
                      ) : null;
                    });
                  })()}
                </g>
              );
            })}
            <g pointerEvents="none" opacity={hover >= 0 ? 0.25 : 1} style={{ transition: "opacity .12s" }}>
              {marks.map((m) => {
                const w = m.text.length * 6.3;
                const cx = Math.min(Math.max(xOf(m.i) + step / 2, w / 2 + 2), innerW - w / 2 - 2);
                // Sit above the tallest bar the label spans, so a clamped label never lands on a neighbour.
                let tall = rows[m.i].drawn;
                for (let j = Math.max(0, Math.floor((cx - w / 2) / step)); j <= Math.min(n - 1, Math.floor((cx + w / 2) / step)); j++) tall = Math.max(tall, rows[j].drawn);
                return (
                  <text key={m.i} x={cx} y={y(tall) - 6} textAnchor="middle" className="fill-ink text-[11px] font-medium" style={{ stroke: "var(--surface)", strokeWidth: 3, paintOrder: "stroke" }}>
                    {m.text}
                  </text>
                );
              })}
            </g>
            {rows.map((r, i) =>
              n <= 10 || r.fy % 5 === 0 || i === 0 ? (
                <text key={r.fy} className="axis-tick-label" x={xOf(i) + step / 2} y={innerH + 14} textAnchor="middle" style={r.fy === year ? { fill: "var(--ink)", fontWeight: 600 } : undefined}>
                  {r.fy}
                </text>
              ) : null,
            )}
            {/* Presidential terms: the administration in office for most of each fiscal year. Labels placed right to left so they never collide. */}
            <g transform={`translate(0,${innerH + AXIS_H + 2})`}>
              {visible.map(({ t, s, e }) => {
                const x = s === range[0] ? 0 : xOf(s - range[0]);
                const w = (e - s + 1) * step;
                const c = t.party === "R" ? "--rep" : "--dem";
                return (
                  <g key={t.termId}>
                    <rect x={x + 0.5} y={0} width={Math.max(0, w - 1)} height={BAND_H} rx={2} style={{ fill: `color-mix(in oklab, var(${c}) 20%, var(--surface))` }} />
                    <rect x={x + 0.5} y={0} width={Math.max(0, w - 1)} height={2.5} style={{ fill: `var(${c})` }} />
                  </g>
                );
              })}
              {(() => {
                let nextStart = innerW + mr;
                const out = [];
                for (let k = visible.length - 1; k >= 0; k--) {
                  const { t, s, e } = visible[k];
                  const x = s === range[0] ? 0 : xOf(s - range[0]);
                  const w = (e - s + 1) * step;
                  const cands = termLabelCandidates(t.last, initialsOf(t.president));
                  for (const text of cands) {
                    const tw = text.length * 6.4;
                    let tx = Math.min(x + w / 2 - tw / 2, nextStart - 3 - tw, x + w - tw - 1);
                    tx = Math.max(tx, x + 1);
                    if ((tx + tw > nextStart - 2 && k < visible.length - 1) || tw > w + 14) continue;
                    nextStart = tx;
                    out.push(
                      <text key={t.termId} x={tx} y={BAND_H - 5} style={{ fontSize: 11, fill: "var(--ink)" }}>
                        {text}
                      </text>,
                    );
                    break;
                  }
                }
                return out;
              })()}
            </g>
            {si >= 0 && si < n && (
              <text className="axis-tick-label" x={Math.min(Math.max(xOf(si) + step / 2, chipW / 2), innerW - chipW / 2)} y={-12} textAnchor="middle" style={{ fill: "var(--ink)", fontWeight: 600 }}>
                {chipLabel}
              </text>
            )}
            {max <= 0 && (
              <text x={innerW / 2} y={innerH / 2} textAnchor="middle" style={{ fill: "var(--ink-muted)", fontSize: 13 }}>
                No disbursements recorded for these filters in {range[0] === range[1] ? `FY${range[0]}` : `FY${range[0]}–${range[1]}`}.
              </text>
            )}
          </>
        )}
      </ChartFrame>
      <Tooltip state={tip.state}>
        {(r) => <SpendingTip r={r} />}
      </Tooltip>
    </div>
  );
}

function SpendingTip({ r }: { r: SpendingYear }) {
  const { data, isPartial, country, sector } = useAidState();
  const term = administrationForTermLabel(data.payload.terms, r.fy);
  const rowsOut = r.slots.map((v, k) => [v, k] as const).filter(([v]) => v !== 0).sort((a, b) => b[0] - a[0]);
  return (
    <div>
      <div style={{ fontWeight: 600 }}>
        FY{r.fy}
        {term ? ` · ${term}` : ""}
      </div>
      <div className="tt-mono" style={{ marginBottom: 4 }}>
        {fiscalYearSpan(r.fy)}
        {isPartial(r.fy) ? " · partial year" : ""}
        {country >= 0 ? ` · ${data.payload.countries[country].name}` : ""}
      </div>
      {sector < 0 &&
        rowsOut.map(([v, k]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
            <span>
              <i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, marginRight: 6, background: slotColor(k), outline: "1px solid color-mix(in oklab, var(--bg) 40%, transparent)" }} />
              {SLOT_NAME[k]}
            </span>
            <span className="tt-mono">{formatAidMoney(v)}</span>
          </div>
        ))}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, fontWeight: 600, borderTop: sector < 0 ? "1px solid color-mix(in oklab, var(--bg) 30%, transparent)" : undefined, marginTop: sector < 0 ? 3 : 0, paddingTop: sector < 0 ? 3 : 0 }}>
        <span>{sector >= 0 ? data.payload.sectors[sector] : "Total"}</span>
        <span className="tt-mono">{formatAidMoney(r.total)}</span>
      </div>
    </div>
  );
}
