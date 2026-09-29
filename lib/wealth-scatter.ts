import type { WealthMember } from "./wealth-data";

/**
 * Pure geometry/selection helpers for the "where they started, where they are now"
 * scatter (components/wealth/NetWorthScatterCard.tsx). Kept out of the
 * component so the transform and standout-label selection are unit-testable
 * without a DOM.
 */

/** Years of usable data = span between a cohort member's first and last
 *  usable year (0-12). Cohort members always have >= 2 points, so >= 1. */
export function yearsOfData(member: WealthMember): number {
  const first = member.points[0];
  const last = member.points[member.points.length - 1];
  return last.year - first.year;
}

/** Net worth is capped at ±this on both axes; beyond it a dot is drawn as a
 *  diamond at the edge. */
export const NET_WORTH_CAP = 20_000_000;
/** The `asinh` knee: values much smaller than this stay near-linear, so the
 *  region around $0 isn't over-stretched. */
const SIGNED_LOG_KNEE = 100_000;

/** The one transform both axes share — that identity is what makes the plot
 *  square and its diagonal a true no-change line. */
export function signedLog(value: number): number {
  return Math.asinh(value / SIGNED_LOG_KNEE);
}

/** Inverse of `signedLog`, rounded to whole dollars (tick labels). */
export function signedLogInverse(t: number): number {
  return Math.round(Math.sinh(t) * SIGNED_LOG_KNEE);
}

export function clampNetWorth(value: number): number {
  return Math.max(-NET_WORTH_CAP, Math.min(NET_WORTH_CAP, value));
}

export function isBeyondCap(value: number): boolean {
  return Math.abs(value) > NET_WORTH_CAP;
}

/** Cohort members always have >= 2 usable points. */
export function firstNetWorth(member: WealthMember): number {
  return member.points[0].midpoint;
}
export function latestNetWorth(member: WealthMember): number {
  return member.points[member.points.length - 1].midpoint;
}
/** Total dollar change, first usable filing to latest. */
export function netWorthChange(member: WealthMember): number {
  return latestNetWorth(member) - firstNetWorth(member);
}
/** Clipped on either coordinate. */
export function isClipped(member: WealthMember): boolean {
  return isBeyondCap(firstNetWorth(member)) || isBeyondCap(latestNetWorth(member));
}

export interface StandoutEntry {
  member: WealthMember;
  change: number;
}

/**
 * Top/bottom `n` cohort members by total dollar change (`latest - first`, not
 * rate) — the scatter's standout labels. Ties broken by `bioguideId` for
 * determinism. `top` and `bottom` never share a member (relevant only when
 * the cohort has fewer than `2n` members).
 */
export function pickStandouts(
  cohort: readonly WealthMember[],
  n = 3,
): { top: StandoutEntry[]; bottom: StandoutEntry[] } {
  const ranked = cohort
    .map((member) => ({ member, change: netWorthChange(member) }))
    .sort(
      (a, b) => b.change - a.change || a.member.bioguideId.localeCompare(b.member.bioguideId),
    );

  const top = ranked.slice(0, n);
  const bottomPool = ranked.slice(Math.max(n, ranked.length - n));
  const bottom = [...bottomPool].sort((a, b) => a.change - b.change);

  // A tiny cohort could put the same member in both slices.
  const topIds = new Set(top.map((e) => e.member.bioguideId));
  return { top, bottom: bottom.filter((e) => !topIds.has(e.member.bioguideId)) };
}

/**
 * Label anchors for standout dots (plot-area px, square plot of side `size`):
 * each label sits beside its dot, flipped to the dot's left when the dot is in
 * the right part of the plot (away from the nearest edge), then y-positions
 * are relaxed apart so labels don't overlap.
 */
export function placeStandoutLabels(
  dots: readonly { cx: number; cy: number }[],
  size: number,
  minGap = 14,
): { x: number; y: number; anchor: "start" | "end" }[] {
  const ys = spreadLabelsY(
    dots.map((d) => d.cy + 4),
    minGap,
    size,
  );
  return dots.map((d, i) => {
    const flip = d.cx > size * 0.6;
    return { x: d.cx + (flip ? -10 : 10), y: ys[i], anchor: flip ? "end" : "start" };
  });
}

/**
 * Nudges a set of label anchor y-positions apart so none sit within `minGap`
 * of each other — a simple 1-D relaxation, not a general force layout (there
 * are at most ~8 standout labels at once, typically two far-apart clusters:
 * positive outliers pinned near the top edge, negative ones near the
 * bottom). After spreading, a forward sweep keeps the lowest value >= 0 and a
 * backward sweep keeps the highest <= `chartHeight`, each only pushing its
 * own end of the order — so a cluster pinned at one edge is repositioned
 * without disturbing an unrelated cluster at the other edge.
 */
export function spreadLabelsY(
  ys: readonly number[],
  minGap: number,
  chartHeight: number,
): number[] {
  if (ys.length === 0) return [];
  const order = ys.map((y, i) => i).sort((a, b) => ys[a] - ys[b]);
  const spread = [...ys];
  for (let pass = 0; pass < order.length; pass++) {
    let moved = false;
    for (let k = 1; k < order.length; k++) {
      const a = order[k - 1];
      const b = order[k];
      const gap = spread[b] - spread[a];
      if (gap < minGap) {
        const push = (minGap - gap) / 2;
        spread[a] -= push;
        spread[b] += push;
        moved = true;
      }
    }
    if (!moved) break;
  }

  // Forward sweep: pull the lowest point up to 0, carrying its neighbors
  // along to preserve spacing.
  if (spread[order[0]] < 0) {
    const shift = -spread[order[0]];
    spread[order[0]] += shift;
  }
  for (let k = 1; k < order.length; k++) {
    const min = spread[order[k - 1]] + minGap;
    if (spread[order[k]] < min) spread[order[k]] = min;
  }
  // Backward sweep: push the highest point down to chartHeight likewise.
  const last = order.length - 1;
  if (spread[order[last]] > chartHeight) spread[order[last]] = chartHeight;
  for (let k = last - 1; k >= 0; k--) {
    const max = spread[order[k + 1]] - minGap;
    if (spread[order[k]] > max) spread[order[k]] = max;
  }

  return spread;
}
