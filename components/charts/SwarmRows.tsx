"use client";

import { type ReactNode } from "react";
import { scaleLinear } from "d3-scale";
import { ChartFrame, type Margin } from "./ChartFrame";
import { Axis } from "./Axis";
import { Tooltip, useTooltip } from "./Tooltip";
import { useElementWidth } from "@/lib/use-element-width";

/**
 * A stack of one-dimensional rows on a shared [-1, 1] axis: a left label, a
 * min→max connector, dots, and a right-hand meta string. This is the shape the
 * state-delegation "range" view and the committee beeswarm both draw — extracted
 * so `components/senate/DelegationChart` and `components/committee/CommitteeSwarm`
 * render through it instead of a forked copy.
 *
 * The dumbbell ("pair") delegation view also rides on this: two emphasized
 * points and, when a single row is embedded on a profile page, a per-point
 * annotation.
 */

const FALLBACK_W = 1100;
const TICKS = [-1, -0.5, 0, 0.5, 1];
const NARROW_TICKS = [-1, 0, 1];

export interface SwarmPoint<TP> {
  id: string;
  /** Position on the shared [-1, 1] axis. */
  value: number;
  /** SVG fill class, e.g. `"fill-rep"`. */
  colorClass: string;
  /** Bigger, fully-opaque dot — a range endpoint, or either end of a dumbbell. */
  emphasized: boolean;
  highlighted?: boolean;
  /** Show a pointer cursor (a profile page exists to navigate to). */
  navigable?: boolean;
  onClick?: () => void;
  tooltip: TP;
}

export interface SwarmRowData<TP> {
  id: string;
  label: string;
  /** Emphasise the row's label (the explorer's selected state). */
  labelHighlighted?: boolean;
  /** Paint the selected-row background band and make the whole row a target. */
  selected?: boolean;
  onRowClick?: () => void;
  points: SwarmPoint<TP>[];
  /** Right-hand text — a party split ("14R·9D") or a gap number. */
  meta: string;
  /** Domain-positioned captions (the embedded dumbbell's name + score). */
  annotations?: { value: number; text: string; above: boolean }[];
}

interface SwarmRowsProps<TP> {
  rows: SwarmRowData<TP>[];
  ariaLabel: string;
  margin: Margin;
  rowHeight: number;
  renderTooltip: (d: TP) => ReactNode;
}

export function SwarmRows<TP>({
  rows,
  ariaLabel,
  margin,
  rowHeight,
  renderTooltip,
}: SwarmRowsProps<TP>) {
  const tip = useTooltip<TP>();
  const [wrapRef, measuredW] = useElementWidth<HTMLDivElement>();
  const W = measuredW || FALLBACK_W;
  const ticks = W < 420 ? NARROW_TICKS : TICKS;
  const plotH = rows.length * rowHeight;

  // The label gutter can't eat a narrow phone card — clamp it to a fraction of
  // the measured width and clip labels that no longer fit. The floor (112) is
  // set so the widest US state name still fits at any width; only the long
  // committee names actually clip.
  const effMargin = {
    ...margin,
    left: Math.min(margin.left, Math.max(112, Math.round(W * 0.42))),
  };
  const maxLabelChars = Math.max(6, Math.floor((effMargin.left - 8) / 6.4));
  const height = effMargin.top + plotH + effMargin.bottom;
  const clip = (s: string) =>
    s.length > maxLabelChars ? `${s.slice(0, maxLabelChars - 1)}…` : s;

  return (
    <div ref={wrapRef}>
      <ChartFrame
        width={W}
        height={height}
        margin={effMargin}
        ariaLabel={ariaLabel}
      >
        {({ innerWidth }) => {
          const x = scaleLinear().domain([-1, 1]).range([0, innerWidth]);

          return (
            <>
              <Axis
                scale={x}
                orientation="bottom"
                ticks={ticks}
                offset={-14}
                gridExtent={-(plotH + 20)}
                zeroAt={0}
                format={(v) => v.toFixed(1)}
              />

              {rows.map((row, i) => {
                const y = i * rowHeight + rowHeight / 2;
                const xs = row.points.map((p) => x(p.value));
                const rowClickable = row.onRowClick != null;

                return (
                  <g
                    key={row.id}
                    style={rowClickable ? { cursor: "pointer" } : undefined}
                    onClick={rowClickable ? () => row.onRowClick!() : undefined}
                  >
                    {row.selected && (
                      <rect
                        className="deleg-row-selected-bg"
                        x={-effMargin.left}
                        y={y - rowHeight / 2 + 1}
                        width={innerWidth + effMargin.left + effMargin.right - 1}
                        height={rowHeight - 2}
                        rx={3}
                      />
                    )}
                    <text
                      className={`deleg-state-label${row.labelHighlighted ? " is-selected" : ""}`}
                      x={-effMargin.left + 2}
                      y={y + 4}
                    >
                      {clip(row.label)}
                    </text>
                    {xs.length > 0 && (
                      <line
                        className="deleg-row-line"
                        x1={Math.min(...xs)}
                        x2={Math.max(...xs)}
                        y1={y}
                        y2={y}
                      />
                    )}
                    {row.points.map((p, si) => (
                      <g key={`${p.id}:${si}`}>
                        <circle
                          className={`deleg-dot ${p.colorClass}${p.highlighted ? " is-highlighted" : ""}`}
                          cx={x(p.value)}
                          cy={y}
                          r={p.highlighted ? 7 : p.emphasized ? 5 : 3}
                          opacity={p.emphasized ? 1 : 0.5}
                          style={p.navigable ? { cursor: "pointer" } : undefined}
                          onPointerEnter={(e) => tip.show(p.tooltip, e)}
                          onPointerMove={tip.move}
                          onPointerLeave={tip.hide}
                          onClick={(e) => {
                            // Always swallow the click so a dot without its own
                            // action (a former member on a scrubbed-back
                            // Congress) doesn't fall through to the row's
                            // select-this-row handler.
                            e.stopPropagation();
                            p.onClick?.();
                          }}
                        />
                      </g>
                    ))}
                    {row.annotations?.map((a, ai) => (
                      <text
                        key={ai}
                        className="deleg-gap-label"
                        x={x(a.value)}
                        y={a.above ? y - 12 : y + 20}
                        textAnchor="middle"
                        fill="var(--ink-muted)"
                      >
                        {a.text}
                      </text>
                    ))}
                    <text
                      className="deleg-gap-label"
                      x={innerWidth + effMargin.right - 4}
                      y={y + 4}
                      textAnchor="end"
                    >
                      {row.meta}
                    </text>
                  </g>
                );
              })}
            </>
          );
        }}
      </ChartFrame>
      <Tooltip state={tip.state}>{(d) => renderTooltip(d)}</Tooltip>
    </div>
  );
}
