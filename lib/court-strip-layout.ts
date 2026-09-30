/**
 * Deterministic layout for "Where the justices stand": a one-axis beeswarm
 * with each justice's label placed beside its dot. Pure geometry, no DOM —
 * text widths come in through `textWidth` so the same function runs in the
 * component and in tests (`court-strip-layout.test.ts` checks every real term).
 *
 * Dots keep their TRUE x. A dot that would touch an already-placed neighbour is
 * nudged vertically off the axis just far enough to clear it (placed left to
 * right, smallest offset that fits). Labels then try right, left, above, below
 * and the diagonals, then the same eight positions farther out, keeping the
 * combination with the least overlap; only a label pushed out a ring gets a
 * leader line. Same input, same output — nothing jitters while the slider plays.
 */

/** Fixed strip geometry (px): the chart never changes height as the term moves. */
export const STRIP_GEOMETRY = {
  height: 250,
  axisY: 128,
  dotR: 8,
  labelH: 16.5, // a 12.5px IBM Plex Sans <text> bbox is 16.5px tall; baseline sits 13px below its top
  fontSize: 12.5,
  padX: 28,
} as const;

export interface StripItem {
  id: number;
  /** True x in px. */
  x: number;
  label: string;
}

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface StripLabel {
  id: number;
  box: Box;
  anchor: "start" | "middle" | "end";
  tx: number;
  ty: number;
  /** 0 = adjacent to the dot; >0 = pushed out that many rings (draws a leader). */
  ring: number;
}

export interface StripLayout {
  dots: { id: number; cx: number; cy: number }[];
  labels: StripLabel[];
}

export interface StripParams {
  width: number;
  height: number;
  axisY: number;
  dotR: number;
  /** x of the median line, for label avoidance. */
  medianX: number;
  /** Rectangles labels must stay out of (median label, endpoint captions). */
  fixed: Box[];
  textWidth: (label: string) => number;
  /** Label line height in px. */
  labelH: number;
}

type Pos = "r" | "l" | "t" | "b" | "tr" | "tl" | "br" | "bl";
const POS: Pos[] = ["r", "l", "t", "b", "tr", "tl", "br", "bl"];
const PREF = [0, 1, 1.5, 1.5, 3, 3.5, 3.5, 4];

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
  Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

export function intersects(a: Box, b: Box): boolean {
  return overlap(a, b) > 0;
}

/**
 * Beeswarm dodge: dots keep their TRUE x; each is nudged vertically off the axis
 * just far enough to clear every already-placed neighbour (placed left to right,
 * smallest offset that fits, alternating preferred side). `minDist` is the
 * centre-to-centre distance. Shared by the justice profile swarm
 * (`lib/justice-swarm-layout.ts`).
 */
export function dodgeOffsets<T extends { id: number; x: number }>(
  items: readonly T[],
  minDist: number,
): { it: T; off: number }[] {
  const md = minDist;
  const sorted = [...items].sort((a, b) => a.x - b.x || a.id - b.id);
  const placed: { it: T; off: number }[] = [];
  sorted.forEach((it, i) => {
    const pref = i % 2 ? 1 : -1;
    const cand = [0];
    for (const q of placed) {
      const dx = it.x - q.it.x;
      if (Math.abs(dx) < md) {
        const dy = Math.sqrt(md * md - dx * dx);
        cand.push(q.off + dy, q.off - dy);
      }
    }
    cand.sort((a, b) => Math.abs(a) - Math.abs(b) || pref * (a - b));
    const off = cand.find((y) =>
      placed.every((q) => {
        const dx = it.x - q.it.x;
        const dy = y - q.off;
        return dx * dx + dy * dy >= md * md - 0.01;
      }),
    ) as number;
    placed.push({ it, off });
  });
  return placed;
}

export function layoutStrip(items: StripItem[], p: StripParams): StripLayout {
  const { width: w, height: h, axisY: ay, dotR: r, labelH: H } = p;
  const md = 2 * r + 2.5; // min centre-to-centre distance

  // --- beeswarm dodge ---
  const placed = dodgeOffsets(items, md);

  // --- labels ---
  const G = r + 3;
  const boxOf = (it: StripItem, off: number, pos: Pos, k: number) => {
    const wd = p.textWidth(it.label);
    const g = G + k * 16;
    const d = g * 0.75;
    const cx = it.x;
    const cy = ay + off;
    const t: Record<Pos, Box & { a: StripLabel["anchor"]; tx: number; ty: number }> = {
      r: { x0: cx + g, x1: cx + g + wd, y0: cy - H / 2, y1: cy + H / 2, a: "start", tx: cx + g, ty: cy + H / 2 - 3.5 },
      l: { x0: cx - g - wd, x1: cx - g, y0: cy - H / 2, y1: cy + H / 2, a: "end", tx: cx - g, ty: cy + H / 2 - 3.5 },
      t: { x0: cx - wd / 2, x1: cx + wd / 2, y0: cy - g - H, y1: cy - g, a: "middle", tx: cx, ty: cy - g - 3.5 },
      b: { x0: cx - wd / 2, x1: cx + wd / 2, y0: cy + g, y1: cy + g + H, a: "middle", tx: cx, ty: cy + g + H - 3.5 },
      tr: { x0: cx + d, x1: cx + d + wd, y0: cy - d - H, y1: cy - d, a: "start", tx: cx + d, ty: cy - d - 3.5 },
      tl: { x0: cx - d - wd, x1: cx - d, y0: cy - d - H, y1: cy - d, a: "end", tx: cx - d, ty: cy - d - 3.5 },
      br: { x0: cx + d, x1: cx + d + wd, y0: cy + d, y1: cy + d + H, a: "start", tx: cx + d, ty: cy + d + H - 3.5 },
      bl: { x0: cx - d - wd, x1: cx - d, y0: cy + d, y1: cy + d + H, a: "end", tx: cx - d, ty: cy + d + H - 3.5 },
    };
    return t[pos];
  };

  const dotBoxes: Box[] = placed.map(({ it, off }) => ({
    x0: it.x - r - 1,
    x1: it.x + r + 1,
    y0: ay + off - r - 1,
    y1: ay + off + r + 1,
  }));

  const cands = placed.map(({ it, off }) => {
    const arr: { pos: Pos; k: number; box: ReturnType<typeof boxOf>; pref: number }[] = [];
    [0, 1, 2, 3].forEach((k) =>
      POS.forEach((pos, pi) =>
        arr.push({ pos, k, box: boxOf(it, off, pos, k), pref: PREF[pi] + k * 14 }),
      ),
    );
    return arr;
  });
  const chosen: (typeof cands)[number][number][] = [];
  const cost = (i: number, c: (typeof cands)[number][number]) => {
    const b = c.box;
    let v = c.pref;
    dotBoxes.forEach((d) => (v += overlap(b, d) * 12));
    p.fixed.forEach((f) => (v += overlap(b, f) * 12));
    const pb = { x0: b.x0 - 5, x1: b.x1 + 5, y0: b.y0 - 1, y1: b.y1 + 1 };
    chosen.forEach((o, j) => {
      if (j !== i && o) v += overlap(pb, o.box) * 12;
    });
    if (b.x0 < 4) v += (4 - b.x0) * H * 4;
    if (b.x1 > w - 4) v += (b.x1 - (w - 4)) * H * 4;
    if (b.y0 < 18) v += (18 - b.y0) * 40;
    if (b.y1 > h - 22) v += (b.y1 - (h - 22)) * 40;
    if (b.y0 < ay && b.y1 > ay) v += 40; // no text through the axis line
    if (b.x0 < p.medianX && b.x1 > p.medianX) v += 12; // or the median line
    return v;
  };
  const pick = (i: number, from: (typeof cands)[number][number]) =>
    cands[i].reduce((best, c) => (cost(i, c) < cost(i, best) ? c : best), from);

  const crowd = (i: number) =>
    placed.filter((q) => Math.abs(q.it.x - placed[i].it.x) < 70).length;
  const order = placed.map((_, i) => i).sort((a, b) => crowd(b) - crowd(a) || a - b);
  order.forEach((i) => {
    chosen[i] = pick(i, cands[i][0]);
  });
  for (let pass = 0; pass < 12; pass++) {
    let changed = false;
    order.forEach((i) => {
      const nb = pick(i, chosen[i]);
      if (nb !== chosen[i]) {
        chosen[i] = nb;
        changed = true;
      }
    });
    if (!changed) break;
  }

  return {
    dots: placed.map(({ it, off }) => ({ id: it.id, cx: it.x, cy: ay + off })),
    labels: placed.map(({ it }, i) => {
      const c = chosen[i];
      return {
        id: it.id,
        box: { x0: c.box.x0, x1: c.box.x1, y0: c.box.y0, y1: c.box.y1 },
        anchor: c.box.a,
        tx: c.box.tx,
        ty: c.box.ty,
        ring: c.k,
      };
    }),
  };
}

/** Collisions in a finished layout — used by tests and the dev-time audit. */
export function auditLayout(
  l: StripLayout,
  p: Pick<StripParams, "width" | "height" | "dotR" | "fixed">,
) {
  const dotBox = (d: { cx: number; cy: number }): Box => ({
    x0: d.cx - p.dotR,
    x1: d.cx + p.dotR,
    y0: d.cy - p.dotR,
    y1: d.cy + p.dotR,
  });
  let dotDot = 0;
  let labelLabel = 0;
  let labelDot = 0;
  let labelFixed = 0;
  let clipped = 0;
  l.dots.forEach((a, i) => {
    l.dots.slice(i + 1).forEach((b) => {
      if (Math.hypot(a.cx - b.cx, a.cy - b.cy) < 2 * p.dotR - 0.01) dotDot++;
    });
  });
  l.labels.forEach((a, i) => {
    l.labels.slice(i + 1).forEach((b) => {
      if (intersects(a.box, b.box)) labelLabel++;
    });
    l.dots.forEach((d) => {
      if (intersects(a.box, dotBox(d))) labelDot++;
    });
    p.fixed.forEach((f) => {
      if (intersects(a.box, f)) labelFixed++;
    });
    if (a.box.x0 < 0 || a.box.x1 > p.width || a.box.y0 < 0 || a.box.y1 > p.height)
      clipped++;
  });
  return { dotDot, labelLabel, labelDot, labelFixed, clipped };
}
