import type { WealthMember } from "./wealth-data";
import { annualizedRate } from "./wealth-derive";

/**
 * Pure geometry/selection helpers for the "who outperformed, who lagged"
 * scatter (components/wealth/NetWorthScatterCard.tsx). Kept out of the
 * component so the jitter and standout-label selection are unit-testable
 * without a DOM.
 */

/** Years of usable data = span between a cohort member's first and last
 *  usable year (0-12). Cohort members always have >= 2 points, so >= 1. */
export function yearsOfData(member: WealthMember): number {
  const first = member.points[0];
  const last = member.points[member.points.length - 1];
  return last.year - first.year;
}

/**
 * Deterministic horizontal jitter offsets for `n` points sharing one x
 * bucket: evenly spread across `spreadWidth`, centered on 0. Callers sort
 * their points by `bioguideId` first (SSR-safe, no `Math.random`) and zip the
 * result 1:1 — this function only computes the offsets.
 */
export function jitterOffsets(n: number, spreadWidth: number): number[] {
  if (n <= 1) return [0];
  return Array.from({ length: n }, (_, i) => (i / (n - 1) - 0.5) * spreadWidth);
}

/** `min(0.8 * columnWidth, 44)` — the plan's jitter-spread rule. */
export function jitterSpreadWidth(columnWidth: number): number {
  return Math.min(0.8 * columnWidth, 44);
}

export interface StandoutEntry {
  member: WealthMember;
  rate: number;
}

/**
 * Top/bottom `n` cohort members by annualized rate — the scatter's standout
 * labels. Ties broken by `bioguideId` for determinism. `top` and `bottom`
 * never share a member (relevant only when the cohort has fewer than
 * `2n` members).
 */
export function pickStandouts(
  cohort: readonly WealthMember[],
  n = 3,
): { top: StandoutEntry[]; bottom: StandoutEntry[] } {
  const ranked = cohort
    .map((member) => ({ member, rate: annualizedRate(member) }))
    .sort(
      (a, b) => b.rate - a.rate || a.member.bioguideId.localeCompare(b.member.bioguideId),
    );

  const top = ranked.slice(0, n);
  const bottomPool = ranked.slice(Math.max(n, ranked.length - n));
  const bottom = [...bottomPool].sort((a, b) => a.rate - b.rate);

  // A tiny cohort could put the same member in both slices.
  const topIds = new Set(top.map((e) => e.member.bioguideId));
  return { top, bottom: bottom.filter((e) => !topIds.has(e.member.bioguideId)) };
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
