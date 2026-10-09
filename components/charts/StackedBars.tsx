"use client";

import { useId, useMemo, type ReactNode } from "react";
import { scaleLinear } from "d3-scale";
import { ChartFrame } from "./ChartFrame";
import { Axis } from "./Axis";
import { Tooltip, useStickyTooltip } from "./Tooltip";
import { useElementWidth } from "@/lib/use-element-width";
import { findExtremes } from "@/lib/chart-extremes";
import { Y_GUTTER, fmtShare, yearLabelEvery } from "@/lib/chart-bars";
import { SegmentLabel } from "./SegmentLabel";
import { TERM_BAND_H, TermBandSvg, type TermSegment } from "./TermBandSvg";
import { ControlRowsSvg, controlRowsHeight, type ControlRow } from "./ControlRowsSvg";

export interface StackSeries {
  id: string;
  label: string;
  /** Any SVG `fill` value: a colour token, or `url(#pattern)` the caller defines. */
  fill: string;
  /** Colour of this series' in-bar value labels, when the default white (with a dark edge) would not read on its fill. */
  labelFill?: string;
}

export interface StackColumn {
  key: string;
  /** Axis label for the column. */
  label: string;
  /** Axis label on a narrow chart, when `’yy` (the default, for year labels) is not it. */
  shortLabel?: string;
  total: number;
  values: Record<string, number>;
  /** Extra axis line under the label (e.g. "YTD" for a year still in progress). */
  sublabel?: string;
  /** What a share is a share of, when that is not the stack's own total (women as a share of all seats). Defaults to `total`. */
  denom?: number;
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
  /** What `total` counts, for the column's accessible name (default "executive orders"). */
  unit?: string;
  /** Share mode with a `denom`: fit the axis to the tallest share instead of 0-100% (rule 10d). */
  fitShare?: boolean;
  /** Share mode: label the tallest and shortest column's share (columns whose bars are all 100% carry none). */
  markShare?: boolean;
  /** The selected column as a tinted band (default) or a dashed playhead line. */
  selectedStyle?: "tint" | "line";
  /** Presidential terms under the axis as `TermBandSvg` segments (one slot per column); used instead of `bands`. */
  terms?: readonly TermSegment[];
  /** A column hovered elsewhere (a linked chart): drawn as a faint dashed line, never selected. */
  activeKey?: string | null;
  /** Called with the hovered column's key (mouse only) and null on leave, so a sibling chart can follow. */
  onActive?: (key: string | null) => void;
  /** Column labels are years: print round years every 1, 2, 5, 10 or 20 (rule 10h) instead of every nth column. */
  yearTicks?: boolean;
  /** Years a column spans (a two-year Congress = 2). With `yearTicks`, labels then fall every few columns from the first, not on round years. */
  slotYears?: number;
  /** Columns still in progress: drawn hatched and left out of the peak and low marks. */
  partialKeys?: ReadonlySet<string>;
  /** Strips under the term band, one cell per column (which party held each chamber). */
  controlRows?: readonly ControlRow[];
  /** Room above the plot for the peak and low labels (default 34, enough for a y-axis caption too). */
  marginTop?: number;
  /** The chart's height in px, narrow and wide, before the term band and control rows (default 300 and 360). */
  heights?: { narrow: number; wide: number };
  renderTooltip: (column: C) => ReactNode;
}

const NARROW_W = 560;
const MARGIN = { top: 34, right: 6, left: Y_GUTTER };
const BAND_H = 22;
const AXIS_H = 34;
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
  unit = "executive orders",
  fitShare = false,
  markShare = false,
  selectedStyle = "tint",
  terms,
  activeKey = null,
  onActive,
  yearTicks = false,
  slotYears = 1,
  partialKeys,
  controlRows,
  marginTop,
  heights,
  renderTooltip,
}: Props<C>) {
  const hatchId = `hatch${useId().replace(/:/g, "")}`;
  const [wrapRef, measured] = useElementWidth<HTMLDivElement>();
  const width = measured || 960;
  const narrow = width < NARROW_W;
  const ctlH = controlRowsHeight(controlRows);
  const height = (narrow ? (heights?.narrow ?? 300) : (heights?.wide ?? 360)) + ctlH;
  const tip = useStickyTooltip<C>();
  // A highlighted series is isolated: drawn alone from zero as a count, on its own scale.
  const eff = highlight ? "count" : mode;

  const maxTotal = useMemo(() => Math.max(1, ...columns.map((c) => (highlight ? (c.values[highlight] ?? 0) : c.total))), [columns, highlight]);
  // Peak and low, recalculated for what is on screen: every column's total, or, with a topic picked,
  // that topic's own count over the window. `top` is where the
  // label sits, in y-domain units: the top of the bar, or of the topic's segment when filtered.
  // Share totals are all 100%, so with no topic picked there is nothing to mark.
  // `columns` is already windowed.
  const shareOf = (c: C) => (c.denom ?? c.total) || 1;
  const maxShare = useMemo(() => Math.max(0.01, ...columns.map((c) => c.total / ((c.denom ?? c.total) || 1))), [columns]);
  const marks = useMemo(() => {
    if (eff === "share" && !markShare) return [];
    const share = eff === "share";
    const val = (c: C) => (share ? c.total / ((c.denom ?? c.total) || 1) : highlight ? (c.values[highlight] ?? 0) : c.total);
    const topOf = val;
    const fmt = (v: number) => (share ? fmtShare(v) : String(v));
    // A topic with no orders in a year has no bar to label: its low is the smallest year that has some.
    const { peak, low } = findExtremes(columns.map((c, i) => ({ day: i, value: (highlight && val(c) === 0) || partialKeys?.has(c.key) ? null : val(c) })));
    return [peak, low].flatMap((p, k) =>
      p ? [{ i: p.day, kind: k === 0 ? ("peak" as const) : ("low" as const), text: `${columns[p.day].label}: ${fmt(p.value as number)}`, top: topOf(columns[p.day]) }] : [],
    );
  }, [columns, eff, highlight, markShare, partialKeys]);
  const bandH = terms ? TERM_BAND_H : BAND_H;
  const margin = { ...MARGIN, ...(marginTop === undefined ? {} : { top: marginTop }), bottom: AXIS_H + (bands.length > 0 || terms ? bandH + 6 : 0) + ctlH };

  return (
    <div ref={wrapRef} data-sticky-tip className="relative -mx-3 sm:mx-0">
      <ChartFrame
        width={width}
        height={height}
        margin={margin}
        ariaLabel={ariaLabel}
        onPointerLeave={(e) => {
          tip.leave(e);
          if (e.pointerType === "mouse") onActive?.(null);
        }}
      >
        {({ innerWidth, innerHeight }) => {
          const fitted = eff === "share" && fitShare;
          const y = scaleLinear()
            .domain(eff === "share" ? [0, fitted ? maxShare : 1] : [0, maxTotal])
            .range([innerHeight, 0])
            .nice(eff === "share" ? (fitted ? 4 : 4) : 5);
          const yTicks = eff === "share" && !fitted ? [0, 0.25, 0.5, 0.75, 1] : y.ticks(fitted ? 4 : 5);
          const yFormat = (v: number) => (eff === "share" ? `${Math.round(v * 100)}%` : String(v));
          const step = innerWidth / columns.length;
          const barW = Math.max(2, step * 0.78);
          // Label as many columns as fit: a zoomed-in window gets every year, the full span every few.
          const every = yearTicks ? yearLabelEvery(step / slotYears) : Math.max(1, Math.ceil((narrow ? 30 : 44) / step));
          const tickEvery = slotYears > 1 ? Math.ceil(every / slotYears) : every;
          const xOf = (i: number) => i * step;

          return (
            <>
              <defs>
                <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="6" stroke="var(--surface)" strokeWidth="2.5" opacity="0.7" />
                </pattern>
              </defs>
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
                const denom = eff === "share" ? shareOf(col) : 1;
                let acc = 0;
                const selected = col.key === selectedKey;
                const label = `${col.label}${col.sublabel ? ` ${col.sublabel}` : ""}: ${col.total} ${unit}`;
                return (
                  <g key={col.key}>
                    {selected && selectedStyle === "line" && (
                      <line x1={xOf(i) + step / 2} x2={xOf(i) + step / 2} y1={0} y2={innerHeight} stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="4 3" pointerEvents="none" />
                    )}
                    {!selected && col.key === activeKey && (
                      <line x1={xOf(i) + step / 2} x2={xOf(i) + step / 2} y1={0} y2={innerHeight} stroke="var(--ink)" strokeWidth={1.25} strokeDasharray="3 3" opacity={0.5} pointerEvents="none" />
                    )}
                    {selected && selectedStyle === "tint" && (
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
                      if (v === 0 || (highlight && highlight !== s.id)) return null;
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
                          }}
                        />
                      );
                    })}
                    {partialKeys?.has(col.key) && acc > 0 && <rect x={x} y={y(acc / denom)} width={barW} height={Math.max(0, innerHeight - y(acc / denom))} fill={`url(#${hatchId})`} pointerEvents="none" />}
                    {/* Segment values, only where the segment is tall and wide enough to hold them. */}
                    {(() => {
                      let a = 0;
                      return series.map((s) => {
                        const v = col.values[s.id] ?? 0;
                        if (v === 0 || (highlight && highlight !== s.id)) return null;
                        const y0 = y((a + v) / denom);
                        const h = y(a / denom) - y0;
                        a += v;
                        const t = eff === "share" ? (fitShare ? fmtShare(v / denom) : `${Math.round((v / denom) * 100)}%`) : String(v);
                        return <SegmentLabel key={s.id} x={x + barW / 2} y={y0 + h / 2} h={h} w={barW} text={t} fill={s.labelFill} />;
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
                      onPointerDown={(e) => {
                        // A finger has no hover: the press itself opens the tooltip (and a press on the open bar closes it on release).
                        if (e.pointerType === "mouse") return;
                        tip.down(e, tip.state?.data === col);
                        tip.show(col, e);
                      }}
                      onPointerEnter={(e) => {
                        if (e.pointerType !== "mouse") return;
                        tip.show(col, e);
                        onActive?.(col.key);
                      }}
                      onPointerMove={tip.move}
                      onPointerUp={tip.up}
                      onPointerCancel={tip.moved}
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
              <g pointerEvents="none" opacity={tip.state || selectedKey || activeKey ? 0.25 : 1} style={{ transition: "opacity .12s" }}>
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
                const year = Number(col.label);
                const show = yearTicks && Number.isFinite(year) ? (slotYears > 1 ? i % tickEvery === 0 : year % every === 0) : i % every === 0 || i === columns.length - 1;
                // Don't crowd the final label with the previous one.
                const crowded = !yearTicks && i !== columns.length - 1 && columns.length - 1 - i < every / 2;
                if (!show || crowded) return null;
                return (
                  <g key={col.key} transform={`translate(${xOf(i) + step / 2},${innerHeight})`}>
                    <line className="grid-line" y1={0} y2={5} />
                    <text className="axis-tick-label" y={18} textAnchor="middle">
                      {narrow && !yearTicks ? (col.shortLabel ?? `’${col.label.slice(2)}`) : col.label}
                    </text>
                    {col.sublabel && (
                      <text className="axis-tick-label" y={30} textAnchor="middle">
                        {col.sublabel}
                      </text>
                    )}
                  </g>
                );
              })}

              {terms && <TermBandSvg segments={terms} x0={0} step={step} y={innerHeight + AXIS_H + 6} />}
              {controlRows && controlRows.length > 0 && <ControlRowsSvg rows={controlRows} x0={0} step={step} y={innerHeight + AXIS_H + 6 + bandH + 6} />}

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
