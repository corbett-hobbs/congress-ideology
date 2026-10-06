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

// --------------------------------------------------------------------------- stacked-band labels

export interface BandSample {
  /** Pixel x of the month. */
  x: number;
  /** Pixel y of the band's lower and upper edge (y0 > y1, since y grows downward). */
  y0: number;
  y1: number;
}

export interface BandLabel {
  /** Pixel position of the label's centre (inside) or of its left edge and middle (outside, in the right gutter). */
  x: number;
  y: number;
  inside: boolean;
}

export const BAND_LABEL_MIN_H = 14;

/**
 * Where to name each band of a stacked chart. A band is labelled inside itself, at the x where it stays at least
 * `minH` tall across the label's whole width (the best such x; only samples left of `maxX` count, so a hatched
 * preliminary stretch never sits under a label). A band that is nowhere thick enough (wind, solar, "other" in the early
 * years) is named in the right gutter at its midpoint at the newest sample, nudged apart so gutter labels never overlap.
 * Pure: pixels in, pixels out.
 */
export function placeBandLabels(
  bands: readonly { key: string; width: number; samples: readonly BandSample[] }[],
  o: { maxX: number; gutterX: number; useGutter: boolean; minH?: number; gap?: number },
): Map<string, BandLabel | null> {
  const minH = o.minH ?? BAND_LABEL_MIN_H;
  const gap = o.gap ?? 12;
  const out = new Map<string, BandLabel | null>();
  const gutter: { key: string; y: number }[] = [];
  for (const b of bands) {
    let best: { x: number; y: number; thick: number } | null = null;
    const usable = b.samples.filter((s) => s.x <= o.maxX);
    for (const c of usable) {
      const near = usable.filter((s) => Math.abs(s.x - c.x) <= b.width / 2);
      if (!near.length || c.x - b.width / 2 < usable[0].x - 1 || c.x + b.width / 2 > o.maxX) continue;
      const thick = Math.min(...near.map((s) => s.y0 - s.y1));
      const y = near.reduce((a, s) => a + (s.y0 + s.y1) / 2, 0) / near.length;
      if (!best || thick > best.thick) best = { x: c.x, y, thick };
    }
    if (best && best.thick >= minH) out.set(b.key, { x: best.x, y: best.y, inside: true });
    else {
      out.set(b.key, null);
      const last = b.samples[b.samples.length - 1];
      if (o.useGutter && last) gutter.push({ key: b.key, y: (last.y0 + last.y1) / 2 });
    }
  }
  // Gutter labels: top to bottom, each at least `gap` below the one above.
  gutter.sort((a, b) => a.y - b.y);
  let prev = -Infinity;
  for (const g of gutter) {
    const y = Math.max(g.y, prev + gap);
    prev = y;
    out.set(g.key, { x: o.gutterX, y, inside: false });
  }
  return out;
}
