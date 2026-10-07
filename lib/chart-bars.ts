/**
 * Shared geometry for bar charts (`charts/Axis` draws left labels in a gutter; see `yGutter`). Pure; unit-tested in
 * `chart-bars.test.ts`.
 */

/** Width of an axis label in the 11px monospace tick style. */
const TICK_CHAR_W = 6.7;

/**
 * Left margin a chart needs so its y-axis labels sit in a gutter beside the plot instead of inside it: the widest label
 * plus 6px to the gridline and 4px of air. Every chart with a left `Axis` sets `margin.left` to this (or a fixed
 * `Y_GUTTER` when its ticks are not known up front).
 */
export function yGutter(labels: readonly string[]): number {
  return Math.ceil(Math.max(0, ...labels.map((l) => l.length)) * TICK_CHAR_W + 10);
}

/** Default gutter for labels of up to five characters ("−0.5", "$30B", "100%"). */
export const Y_GUTTER = yGutter(["00000"]);

/** Whether a value label of `text` fits inside a segment `h` tall and `w` wide. */
export function segmentLabelFits(h: number, w: number, text: string): boolean {
  return h >= 15 && w >= text.length * 5.6 + 3;
}

/** In-segment value labels: white with a soft dark edge so they read on light and dark fills alike. */
export const SEGMENT_LABEL_STYLE = {
  fill: "#fff",
  fontSize: 11,
  fontWeight: 600,
  stroke: "rgba(0,0,0,0.35)",
  strokeWidth: 2.5,
  paintOrder: "stroke",
  strokeLinejoin: "round",
  pointerEvents: "none",
} as const;
