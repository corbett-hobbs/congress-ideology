"use client";

import { useId, useMemo, type ReactNode } from "react";
import { scaleLinear } from "d3-scale";
import { ChartFrame, type Margin } from "./ChartFrame";
import { Axis } from "./Axis";
import { Tooltip, useTooltip } from "./Tooltip";

/**
 * The 2-D ideology scatter, entity-agnostic. Owns the frame, the scales,
 * gridlines, the dots (draw order, hover, tooltip, click-to-navigate, focus
 * fade), and domain-positioned text labels. The caller supplies accessors and
 * the tooltip body, so both the member compass (`components/senate/CompassChart`)
 * and the committee compass (`components/committee/CommitteeCompass`) are thin
 * wrappers over this — no forked chart code.
 *
 * The domain is `[-1, 1]` on both axes by default (individual members span it);
 * a caller whose points cluster tightly (blended committees) can pass a smaller
 * symmetric `domain` to zoom in — the zero-lines stay centred and anything
 * outside the domain (a backdrop point) is clipped to the plot.
 */

const FULL_DOMAIN = [-1, 1] as const;
const DEFAULT_TICKS = [-1, -0.5, 0, 0.5, 1];

export interface DotState {
  highlighted: boolean;
  selected: boolean;
  faded: boolean;
}

export interface ScatterLabel {
  /** Domain coordinates of the anchor point. */
  x: number;
  y: number;
  text: string;
  anchor: "start" | "middle" | "end";
  /** Pixel nudge from the anchor. */
  dx?: number;
  dy?: number;
  className?: string;
}

interface ScatterPlotProps<T> {
  points: readonly T[];
  ariaLabel: string;
  width: number;
  height: number;
  margin?: Partial<Margin>;
  /** Symmetric extent on both axes. Default `[-1, 1]`. */
  domain?: readonly [number, number];
  /** Gridline positions in domain units. Default `[-1, -0.5, 0, 0.5, 1]`. */
  ticks?: readonly number[];
  /** Draw the numeric tick labels (profile) or leave the axes bare (explorer). */
  axisTickLabels?: boolean;
  /** Optional rotated caption beside the y-axis (the compass's "DIMENSION 2"). */
  yAxisCaption?: string;

  x: (d: T) => number;
  y: (d: T) => number;
  id: (d: T) => string;
  /** SVG fill class for the dot, e.g. `"fill-rep"`. */
  colorClass: (d: T) => string;
  radius?: (d: T, state: DotState) => number;

  highlightedId?: string | null;
  /** Extra ids to ring with the same treatment as `highlightedId`. */
  highlightedIds?: readonly string[];
  selectedId?: string | null;
  /** Fade every dot that isn't highlighted / selected. */
  dimUnfocused?: boolean;

  onHover?: (d: T | null) => void;
  onSelect?: (d: T) => void;
  /** Gate click-to-select per datum (default: selectable whenever onSelect is set). */
  isSelectable?: (d: T) => boolean;
  renderTooltip: (d: T) => ReactNode;

  labels?: readonly ScatterLabel[];
  /** Faint, non-interactive context dots drawn behind the plot (e.g. the member
   *  cloud behind the committee dots). Domain coordinates. */
  backdrop?: readonly { x: number; y: number }[];
}

const defaultRadius = (_d: unknown, s: DotState) =>
  s.highlighted ? 7.5 : s.selected ? 6.5 : 4.6;

export function ScatterPlot<T>({
  points,
  ariaLabel,
  width,
  height,
  margin,
  domain = FULL_DOMAIN,
  ticks = DEFAULT_TICKS,
  axisTickLabels = false,
  yAxisCaption,
  x: xOf,
  y: yOf,
  id: idOf,
  colorClass,
  radius = defaultRadius,
  highlightedId = null,
  highlightedIds,
  selectedId = null,
  dimUnfocused = false,
  onHover,
  onSelect,
  isSelectable,
  renderTooltip,
  labels,
  backdrop,
}: ScatterPlotProps<T>) {
  const tip = useTooltip<T>();
  const clipId = `scatter-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const ringed = useMemo(() => new Set(highlightedIds ?? []), [highlightedIds]);

  const zRank = (d: T) => {
    const key = idOf(d);
    if (key === highlightedId) return 3;
    if (ringed.has(key)) return 2;
    if (key === selectedId) return 1;
    return 0;
  };

  const drawOrder = useMemo(
    () => [...points].sort((a, b) => zRank(a) - zRank(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, highlightedId, selectedId, ringed],
  );

  return (
    <>
      <ChartFrame
        width={width}
        height={height}
        margin={margin}
        ariaLabel={ariaLabel}
        onPointerLeave={() => {
          // Leaving the plot by any edge (not onto another dot) must clear the
          // hover tooltip and any hover-driven enlargement — a per-dot
          // pointerleave can be missed when a hover re-sort moves the node out
          // from under the pointer.
          onHover?.(null);
          tip.hide();
        }}
      >
        {({ innerWidth, innerHeight }) => {
          const x = scaleLinear().domain(domain).range([0, innerWidth]);
          const y = scaleLinear().domain(domain).range([innerHeight, 0]);

          return (
            <>
              <Axis
                scale={x}
                orientation="bottom"
                ticks={[...ticks]}
                offset={innerHeight}
                gridExtent={innerHeight}
                zeroAt={0}
                labels={axisTickLabels}
                format={(v) => v.toFixed(1)}
              />
              <Axis
                scale={y}
                orientation="left"
                ticks={[...ticks]}
                offset={0}
                gridExtent={innerWidth}
                zeroAt={0}
                labels={axisTickLabels}
                format={(v) => v.toFixed(1)}
              />
              {yAxisCaption && (
                <text
                  className="axis-caption"
                  transform={`translate(${-42},${innerHeight / 2}) rotate(-90)`}
                  textAnchor="middle"
                >
                  {yAxisCaption}
                </text>
              )}

              <clipPath id={clipId}>
                <rect x={0} y={0} width={innerWidth} height={innerHeight} />
              </clipPath>
              <g clipPath={`url(#${clipId})`}>
                {backdrop?.map((p, i) => (
                  <circle
                    key={`bg${i}`}
                    cx={x(p.x)}
                    cy={y(p.y)}
                    r={2.5}
                    className="fill-oth"
                    opacity={0.1}
                    pointerEvents="none"
                  />
                ))}

                {drawOrder.map((d) => {
                  const key = idOf(d);
                  const highlighted = key === highlightedId || ringed.has(key);
                  const selected = key === selectedId;
                  const faded = dimUnfocused && !highlighted && !selected;
                  const selectable =
                    onSelect != null && (isSelectable ? isSelectable(d) : true);
                  return (
                    <circle
                      key={key}
                      cx={x(xOf(d))}
                      cy={y(yOf(d))}
                      r={radius(d, { highlighted, selected, faded })}
                      className={`dot ${colorClass(d)}${highlighted ? " is-highlighted" : ""}`}
                      opacity={faded ? 0.28 : 1}
                      onPointerEnter={(e) => {
                        onHover?.(d);
                        tip.show(d, e);
                      }}
                      onPointerMove={tip.move}
                      onPointerLeave={() => {
                        onHover?.(null);
                        tip.hide();
                      }}
                      onClick={selectable ? () => onSelect!(d) : undefined}
                      style={selectable ? { cursor: "pointer" } : undefined}
                    />
                  );
                })}
              </g>

              {labels?.map((l, i) => (
                <text
                  key={`${l.text}:${i}`}
                  className={l.className ?? "dot-label"}
                  textAnchor={l.anchor}
                  x={x(l.x) + (l.dx ?? 0)}
                  y={y(l.y) + (l.dy ?? 0)}
                >
                  {l.text}
                </text>
              ))}
            </>
          );
        }}
      </ChartFrame>
      <Tooltip state={tip.state}>{(d) => renderTooltip(d)}</Tooltip>
    </>
  );
}
