import { dodgeOffsets } from "./court-strip-layout";

/**
 * Pure geometry for the justice page's career-average swarm (no DOM): the
 * beeswarm positions and the label rows stacked above it. The y offset is
 * collision avoidance only, not data. `components/senate/BeeswarmChart` (d3-force)
 * could not be reused: it is typed to `ChamberMember`, fixed to [-1, 1], and
 * forceX only approximates the true x under collision, so a score could be
 * drawn a few px off. This uses the exact-x dodge `court-strip-layout` already
 * ships, and lays out its labels here so the chart never changes height
 * between modes.
 */

export interface SwarmIn {
  id: number;
  /** True x in px. */
  x: number;
  r: number;
}

export interface SwarmDot {
  id: number;
  x: number;
  /** Offset from the swarm's centre line, px. */
  y: number;
}

/** Collision-free dots at their TRUE x. Deterministic: same input, same output. */
export function layoutSwarm(items: readonly SwarmIn[], gap = 1.5): { dots: SwarmDot[]; halfHeight: number } {
  const r = Math.max(...items.map((i) => i.r), 0);
  const placed = dodgeOffsets(items, 2 * r + gap);
  const byId = new Map(placed.map((p) => [p.it.id, p]));
  const dots = items.map((i) => ({ id: i.id, x: i.x, y: (byId.get(i.id) as { off: number }).off }));
  const halfHeight = Math.max(...dots.map((d, i) => Math.abs(d.y) + items[i].r), 0);
  return { dots, halfHeight };
}

export interface LabelIn {
  id: number;
  /** x of the dot the label belongs to. */
  x: number;
  width: number;
}

export interface LabelOut {
  id: number;
  /** Left edge, clamped inside [0, totalWidth]. */
  left: number;
  row: number;
}

/**
 * Greedy row packing: left to right, each label goes in the lowest row where it
 * clears the previous label by `pad`. Row 0 sits closest to the dots.
 */
export function packLabels(labels: readonly LabelIn[], totalWidth: number, pad = 6): LabelOut[] {
  const rowEnd: number[] = [];
  const out: LabelOut[] = [];
  for (const l of [...labels].sort((a, b) => a.x - b.x || a.id - b.id)) {
    const left = Math.max(0, Math.min(totalWidth - l.width, l.x - l.width / 2));
    let row = rowEnd.findIndex((end) => end + pad <= left);
    if (row === -1) row = rowEnd.length;
    rowEnd[row] = left + l.width;
    out.push({ id: l.id, left, row });
  }
  return out;
}

export const rowCount = (out: readonly LabelOut[]) => (out.length ? Math.max(...out.map((o) => o.row)) + 1 : 0);
