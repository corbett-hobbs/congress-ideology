"use client";

import { useMemo, type ReactNode } from "react";
import { scaleLinear } from "d3-scale";
import { ChartFrame } from "./ChartFrame";
import { Axis } from "./Axis";
import { Tooltip, useTooltip } from "./Tooltip";
import { useElementWidth } from "@/lib/use-element-width";
import { findExtremes } from "@/lib/chart-extremes";
import { SEGMENT_LABEL_STYLE, Y_GUTTER, segmentLabelFits } from "@/lib/chart-bars";

export interface StackSeries {
  id: string;
  label: string;
  /** Any SVG `fill` value: a colour token, or `url(#pattern)` the caller defines. */
  fill: string;
}

export interface StackColumn {
  key: string;
  /** Axis label for the column. */
  label: string;
  total: number;
  values: Record<string, number>;
  /** Extra axis line under the label (e.g. "YTD" for a year still in progress). */
  sublabel?: string;
}

/** A labelled span under the axis, in column-index space (0 = left edge of column 0). */
export interface StackBand {
  id: string;
  label: string;
  from: number;
  to: number;
  /** Any SVG fill; with it the label is drawn in white. Without, the neutral alternating grays. */
  fill?: string;
}

interface Props<C extends StackColumn> {
  columns: readonly C[];
  /** Bottom-to-top draw order. Colour/fill follows the series, never its rank. */
  series: readonly StackSeries[];
  mode: "count" | "share";
  /** Series id to emphasise; every other series dims. */
  highlight: string | null;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  bands?: readonly StackBand[];
  ariaLabel: string;
  yAxisLabel?: string;
  renderTooltip: (column: C) => ReactNode;
}

const NARROW_W = 560;
const MARGIN = { top: 34, right: 6, left: Y_GUTTER };
const BAND_H = 22;
const AXIS_H = 34;
const DIM = 0.2;
const MARK_CHAR_W = 6.3;
const MARK_HALO = { stroke: "var(--surface)", strokeWidth: 3, paintOrder: "stroke" } as const;

/**
 * Stacked columns over a categorical axis: count or share-of-column, a fixed
 * series order, optional spans under the axis (here: presidential terms), a
 * highlight series, and click / keyboard selection of a column. Built on
 * ChartFrame / Axis / Tooltip like every other chart; D3 is used for scales
 * only, the DOM is JSX. No entity knowledge — the executive-orders page
 * supplies columns, series and the tooltip.
 */
export function StackedBars<C extends StackColumn>({
  columns,
  series,
  mode,
  highlight,
  selectedKey,
  onSelect,
  bands = [],
  ariaLabel,
  yAxisLabel,
  renderTooltip,
}: Props<C>) {
  const [wrapRef, measured] = useElementWidth<HTMLDivElement>();
  const width = measured || 960;
  const narrow = width < NARROW_W;
  const height = narrow ? 300 : 360;
  const tip = useTooltip<C>();

  const maxTotal = useMemo(() => Math.max(1, ...columns.map((c) => c.total)), [columns]);
  // Peak and low, recalculated for what is on screen: every column's total, or, with a topic picked,
  // that topic's own count (its share of the year in Share mode) over the window. `top` is where the
  // label sits, in y-domain units: the top of the bar, or of the topic's segment when filtered.
  // Share totals are all 100%, so with no topic picked there is nothing to mark.
  // `columns` is already windowed.
  const marks = useMemo(() => {
    if (mode === "share" && !highlight) return [];
    const denomOf = (c: C) => (mode === "share" ? c.total || 1 : 1);
    const val = (c: C) => (highlight ? (c.values[highlight] ?? 0) / denomOf(c) : c.total);
    const topOf = (c: C) => {
      if (!highlight) return mode === "share" ? 1 : c.total;
      let acc = 0;
      for (const s of series) {
        acc += c.values[s.id] ?? 0;
        if (s.id === highlight) break;
      }
      return acc / denomOf(c);
    };
    const fmt = (v: number) => (mode === "share" ? `${Math.round(v * 100)}%` : String(v));
    // A topic with no orders in a year has no bar to label: its low is the smallest year that has some.
    const { peak, low } = findExtremes(columns.map((c, i) => ({ day: i, value: highlight && val(c) === 0 ? null : val(c) })));
    return [peak, low].flatMap((p, k) =>
      p ? [{ i: p.day, kind: k === 0 ? ("peak" as const) : ("low" as const), text: `${columns[p.day].label}: ${fmt(p.value as number)}`, top: topOf(columns[p.day]) }] : [],
    );
  }, [columns, series, mode, highlight]);
  const margin = { ...MARGIN, bottom: AXIS_H + (bands.length > 0 ? BAND_H + 6 : 0) };

  return (
    <div ref={wrapRef} className="relative -mx-3 sm:mx-0">
      <ChartFrame
        width={width}
        height={height}
        margin={margin}
        ariaLabel={ariaLabel}
        onPointerLeave={tip.hide}
      >
        {({ innerWidth, innerHeight }) => {
          const y = scaleLinear()
            .domain(mode === "share" ? [0, 1] : [0, maxTotal])
            .range([innerHeight, 0])
            .nice(mode === "share" ? 4 : 5);
          const yTicks = mode === "share" ? [0, 0.25, 0.5, 0.75, 1] : y.ticks(5);
          const yFormat = (v: number) => (mode === "share" ? `${Math.round(v * 100)}%` : String(v));
          const step = innerWidth / columns.length;
          const barW = Math.max(2, step * 0.78);
          // Label as many columns as fit: a zoomed-in window gets every year, the full span every few.
          const every = Math.max(1, Math.ceil((narrow ? 30 : 44) / step));
          const xOf = (i: number) => i * step;

          return (
            <>
              <Axis
                scale={y}
                orientation="left"
                ticks={yTicks}
                offset={0}
                gridExtent={innerWidth}
                format={yFormat}
                zeroAt={0}
              />
              {yAxisLabel && (
                <text
                  className="axis-caption"
                  x={0}
                  y={-20}
                  textAnchor="start"
                >
                  {yAxisLabel}
                </text>
              )}


              {columns.map((col, i) => {
                const x = xOf(i) + (step - barW) / 2;
                const denom = mode === "share" ? col.total || 1 : 1;
                let acc = 0;
                const selected = col.key === selectedKey;
                const label = `${col.label}${col.sublabel ? ` ${col.sublabel}` : ""}: ${col.total} executive orders`;
                return (
                  <g key={col.key}>
                    {selected && (
                      <rect
                        x={xOf(i)}
                        y={0}
                        width={step}
                        height={innerHeight}
                        style={{ fill: "var(--accent)", opacity: 0.1 }}
                      />
                    )}
                    {series.map((s) => {
                      const v = col.values[s.id] ?? 0;
                      if (v === 0) return null;
                      const y0 = y((acc + v) / denom);
                      const y1 = y(acc / denom);
                      acc += v;
                      return (
                        <rect
                          key={s.id}
                          x={x}
                          y={y0}
                          width={barW}
                          height={Math.max(0, y1 - y0)}
                          style={{
                            fill: s.fill,
                            stroke: "var(--surface)",
                            strokeWidth: 0.75,
                            opacity: highlight && highlight !== s.id ? DIM : 1,
                          }}
                        />
                      );
                    })}
                    {/* Segment values, only where the segment is tall and wide enough to hold them. */}
                    {(() => {
                      let a = 0;
                      return series.map((s) => {
                        const v = col.values[s.id] ?? 0;
                        if (v === 0) return null;
                        const y0 = y((a + v) / denom);
                        const h = y(a / denom) - y0;
                        a += v;
                        const t = mode === "share" ? `${Math.round((v / denom) * 100)}%` : String(v);
                        if (highlight && highlight !== s.id) return null;
                        return segmentLabelFits(h, barW, t) ? (
                          <text key={s.id} x={x + barW / 2} y={y0 + h / 2} dy="0.35em" textAnchor="middle" style={SEGMENT_LABEL_STYLE}>
                            {t}
                          </text>
                        ) : null;
                      });
                    })()}
                    {/* One full-height hit target per column: hover, click, keyboard. */}
                    <rect
                      x={xOf(i)}
                      y={0}
                      width={step}
                      height={innerHeight}
                      fill="transparent"
                      role="button"
                      tabIndex={0}
                      aria-label={label}
                      aria-pressed={selected}
                      className="cursor-pointer outline-none focus-visible:[stroke:var(--focus)] focus-visible:[stroke-width:2]"
                      onPointerEnter={(e) => tip.show(col, e)}
                      onPointerMove={tip.move}
                      onClick={() => onSelect(selected ? null : col.key)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelect(selected ? null : col.key);
                        }
                      }}
                    />
                  </g>
                );
              })}

              {/* Peak and low, labelled above their bars; they fade while a column is hovered or picked. */}
              <g pointerEvents="none" opacity={tip.state || selectedKey ? 0.25 : 1} style={{ transition: "opacity .12s" }}>
                {marks.map((m, k) => {
                  const w = m.text.length * MARK_CHAR_W;
                  const clampX = (x: number) => Math.min(Math.max(x, w / 2 + 2), innerWidth - w / 2 - 2);
                  const cx0 = clampX(xOf(m.i) + step / 2);
                  const first = marks[0];
                  const peakCx = clampX(xOf(first.i) + step / 2);
                  // The low label slides to the far side of its own bar when it would land on the peak's (close in both x and height).
                  const peakTop = y(first.top);
                  const clash = k === 1 && Math.abs(cx0 - peakCx) < w && Math.abs(y(m.top) - peakTop) < 14;
                  const anchor = clash ? (m.i < first.i ? "end" : "start") : "middle";
                  const cx = clash ? xOf(m.i) + step / 2 + (anchor === "end" ? 6 : -6) : cx0;
                  if (clash && (anchor === "end" ? cx > peakCx - w / 2 - 4 : cx < peakCx + w / 2 + 4)) return null;
                  const topY = y(m.top);
                  return (
                    <text key={m.kind} x={cx} y={topY - 6} textAnchor={anchor} className="fill-ink text-[11px] font-medium" style={MARK_HALO}>
                      {m.text}
                    </text>
                  );
                })}
              </g>

              {/* x labels */}
              {columns.map((col, i) => {
                const show = i % every === 0 || i === columns.length - 1;
                // Don't crowd the final label with the previous one.
                const crowded = i !== columns.length - 1 && columns.length - 1 - i < every / 2;
                if (!show || crowded) return null;
                return (
                  <g key={col.key} transform={`translate(${xOf(i) + step / 2},${innerHeight})`}>
                    <line className="grid-line" y1={0} y2={5} />
                    <text className="axis-tick-label" y={18} textAnchor="middle">
                      {narrow ? `’${col.label.slice(2)}` : col.label}
                    </text>
                    {col.sublabel && (
                      <text className="axis-tick-label" y={30} textAnchor="middle">
                        {col.sublabel}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* spans under the axis */}
              {bands.length > 0 && (
                <g transform={`translate(0,${innerHeight + AXIS_H + 6})`}>
                  {bands.map((b, i) => {
                    const x0 = xOf(b.from);
                    const w = xOf(b.to) - x0;
                    return (
                      <g key={b.id}>
                        <title>{b.label}</title>
                        {b.fill ? (
                          <>
                            {/* Same look as the foreign-aid term band: a light tint, a solid party-colour rule on top, ink label. */}
                            <rect x={x0 + 0.5} y={0} width={Math.max(0, w - 1)} height={BAND_H} rx={2} style={{ fill: `color-mix(in oklab, ${b.fill} 20%, var(--surface))` }} />
                            <rect x={x0 + 0.5} y={0} width={Math.max(0, w - 1)} height={2.5} style={{ fill: b.fill }} />
                          </>
                        ) : (
                          <rect
                            x={x0}
                            y={0}
                            width={Math.max(0, w)}
                            height={BAND_H}
                            style={{
                              fill: i % 2 === 0 ? "var(--surface-raised)" : "var(--line)",
                              stroke: "var(--line-strong)",
                              strokeWidth: 0.75,
                            }}
                          />
                        )}
                        {w > Math.max(28, b.label.length * 6.4 + 6) && (
                          <text
                            x={x0 + w / 2}
                            y={BAND_H / 2 + 4}
                            textAnchor="middle"
                            style={{ fill: b.fill ? "var(--ink)" : "var(--ink-muted)", fontSize: 11, fontWeight: 500 }}
                          >
                            {b.label}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              )}
            </>
          );
        }}
      </ChartFrame>
      <Tooltip state={tip.state}>{renderTooltip}</Tooltip>
    </div>
  );
}
