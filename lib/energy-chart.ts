/**
 * Pure geometry for the energy charts: panels stacked on one shared time axis (a main plot, and on two cards a
 * shorter second plot under it). Pixels in, pixels out; unit-tested in `energy-chart.test.ts`.
 */
export const CAPTION_H = 16;
export const PANEL_GAP = 14;

export interface PanelSpec {
  /** Plot height. */
  h: number;
  /** A one-line caption sits above the plot (always for panels after the first). */
  caption: boolean;
}

export interface StackedPanels {
  tops: number[];
  bottoms: number[];
  /** Baseline of each caption, or null. */
  captionYs: (number | null)[];
  /** Bottom of the last plot: the year axis sits here. */
  axisY: number;
}

/** Stack panels downward from `top`, with a caption row above any panel that has one and a gap between panels. */
export function stackPanels(specs: readonly PanelSpec[], top: number): StackedPanels {
  const tops: number[] = [];
  const bottoms: number[] = [];
  const captionYs: (number | null)[] = [];
  let y = top;
  specs.forEach((s, i) => {
    if (i > 0) y += PANEL_GAP;
    captionYs.push(s.caption ? y + CAPTION_H - 4 : null);
    if (s.caption) y += CAPTION_H;
    tops.push(y);
    y += s.h;
    bottoms.push(y);
  });
  return { tops, bottoms, captionYs, axisY: y };
}

/** Which panel (if any) a pointer y falls in, with a few pixels of grace so the gap between panels still reads as a date. */
export function panelAtY(stack: StackedPanels, y: number, grace = 6): boolean {
  return stack.tops.length > 0 && y >= stack.tops[0] && y <= stack.axisY + grace;
}
