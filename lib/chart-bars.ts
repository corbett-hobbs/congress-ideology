/**
 * Shared geometry for bar charts that draw their left-axis labels inside the
 * plot (see `charts/Axis`). Pure; unit-tested in `chart-bars.test.ts`.
 */

const LABEL_CHAR_W = 6.2;
/** Axis labels start 4px in; keep 4px clear after the text. */
const LABEL_PAD = 8;

/**
 * How far to push the first bar right so no y-axis label is covered by a bar.
 * A tick's label sits just above its gridline, so a bar hides it only when the
 * bar rises above that gridline (`top > tick`) and its left edge falls inside
 * the label's width. Returns 0 when nothing collides (most charts), else the
 * extra pixels of left inset the plot needs.
 *
 * `tops[i]` is bar i's top in the same units as `ticks`; bars are `barW` wide,
 * centred in slots of `step`, starting at x = 0.
 */
export function yLabelInset(opts: {
  ticks: readonly number[];
  format: (v: number) => string;
  tops: readonly number[];
  step: number;
  barW: number;
}): number {
  const { ticks, format, tops, step, barW } = opts;
  const lead = (step - barW) / 2;
  let need = 0;
  for (const t of ticks) {
    const w = format(t).length * LABEL_CHAR_W + LABEL_PAD;
    for (let i = 0; i < tops.length; i++) {
      const left = i * step + lead;
      if (left >= w) break;
      if (tops[i] > t) {
        need = Math.max(need, w);
        break;
      }
    }
  }
  return need > lead ? Math.ceil(need - lead) : 0;
}

/** Whether a value label of `text` fits inside a segment `h` tall and `w` wide. */
export function segmentLabelFits(h: number, w: number, text: string): boolean {
  return h >= 15 && w >= text.length * 6.4 + 6;
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
