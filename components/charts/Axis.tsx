import type { ScaleContinuousNumeric } from "d3-scale";

interface AxisProps {
  /** Any continuous numeric scale (linear, symlog, ...) — only `scale(v)` is
   *  called, so this accepts anything with that shape, not just `scaleLinear`. */
  scale: ScaleContinuousNumeric<number, number>;
  orientation: "bottom" | "left";
  /** Explicit tick values. */
  ticks: number[];
  /** Where the axis sits on the cross-axis (px, in plot coords). */
  offset: number;
  /**
   * If set, each tick draws a full gridline this long across the plot instead
   * of a short tick mark.
   */
  gridExtent?: number;
  format?: (v: number) => string;
  /** Values within 1e-9 of this render with the `zero-line` emphasis. */
  zeroAt?: number;
  labels?: boolean;
}

const defaultFormat = (v: number) => String(v);


/**
 * Left-axis labels sit in a gutter to the left of the plot (right-aligned at `offset - 6`, centred on their gridline), so
 * bars and lines never run under them; the chart's left margin must be at least `yGutter(labels)` (lib/chart-bars).
 *
 * Renders tick marks / gridlines and labels for a linear scale. One
 * implementation, used by every chart — the prototype hand-rolled tick
 * placement separately in the trend and delegation charts.
 */
export function Axis({
  scale,
  orientation,
  ticks,
  offset,
  gridExtent,
  format = defaultFormat,
  zeroAt,
  labels = true,
}: AxisProps) {
  const horizontal = orientation === "bottom";

  return (
    <g className="axis">
      {ticks.map((v) => {
        const p = scale(v);
        const isZero = zeroAt != null && Math.abs(v - zeroAt) < 1e-9;
        const lineClass = isZero ? "zero-line" : "grid-line";

        const line = horizontal
          ? {
              x1: p,
              x2: p,
              y1: gridExtent != null ? offset - gridExtent : offset,
              y2: gridExtent != null ? offset : offset + 6,
            }
          : {
              y1: p,
              y2: p,
              x1: gridExtent != null ? offset : offset - 6,
              x2: gridExtent != null ? offset + gridExtent : offset,
            };

        const label = horizontal
          ? { x: p, y: offset + 16, anchor: "middle" as const }
          : { x: offset - 6, y: p + 3.5, anchor: "end" as const };

        return (
          <g key={v}>
            <line className={lineClass} {...line} />
            {labels && (
              <text
                className="axis-tick-label"
                x={label.x}
                y={label.y}
                textAnchor={label.anchor}
              >
                {format(v)}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
