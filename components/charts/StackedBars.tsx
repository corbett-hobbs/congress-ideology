"use client";

import { useMemo, type ReactNode } from "react";
import { scaleLinear } from "d3-scale";
import { ChartFrame } from "./ChartFrame";
import { Axis } from "./Axis";
import { Tooltip, useTooltip } from "./Tooltip";
import { useElementWidth } from "@/lib/use-element-width";

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
const MARGIN = { top: 22, right: 6, left: 10 };
const BAND_H = 22;
const AXIS_H = 34;
const DIM = 0.2;

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
  const margin = { ...MARGIN, bottom: AXIS_H + (bands.length > 0 ? BAND_H + 6 : 0) };

  return (
    <div ref={wrapRef} className="relative">
      <ChartFrame
        width={width}
        height={height}
        margin={margin}
        ariaLabel={ariaLabel}
        onPointerLeave={tip.hide}
      >
        {({ innerWidth, innerHeight }) => {
          const step = innerWidth / columns.length;
          const barW = Math.max(2, step * 0.78);
          const y = scaleLinear()
            .domain(mode === "share" ? [0, 1] : [0, maxTotal])
            .range([innerHeight, 0])
            .nice(mode === "share" ? 4 : 5);
          const yTicks = mode === "share" ? [0, 0.25, 0.5, 0.75, 1] : y.ticks(5);
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
                format={(v) => (mode === "share" ? `${Math.round(v * 100)}%` : String(v))}
                zeroAt={0}
              />
              {yAxisLabel && (
                <text
                  className="axis-caption"
                  x={0}
                  y={-8}
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
                        <rect
                          x={x0}
                          y={0}
                          width={Math.max(0, w)}
                          height={BAND_H}
                          style={{
                            fill: b.fill ?? (i % 2 === 0 ? "var(--surface-raised)" : "var(--line)"),
                            stroke: "var(--line-strong)",
                            strokeWidth: 0.75,
                          }}
                        />
                        {w > Math.max(28, b.label.length * 6.4 + 6) && (
                          <text
                            x={x0 + w / 2}
                            y={BAND_H / 2 + 4}
                            textAnchor="middle"
                            style={{ fill: b.fill ? "#ffffff" : "var(--ink-muted)", fontSize: 11, fontWeight: b.fill ? 600 : 500 }}
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
