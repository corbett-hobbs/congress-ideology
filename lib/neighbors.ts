import type { ChamberMember } from "./congress-types";

/**
 * A member's nearest ideological neighbors: the closest colleagues by
 * position in the two-dimensional DW-NOMINATE space the compass plots.
 *
 * Distance is 2D Euclidean over (dim1, dim2) — the delegation chart's gap math
 * is `|dim1 gap|`, but this feature rings dots on the 2D compass, so a purely
 * dim1 metric would ring dots that sit visibly far from the anchor on the
 * vertical (dim2) axis. Both dims, matching what the eye reads off the chart.
 *
 * Chamber-scoped: pass a single chamber's members as `pool`.
 */
export interface Neighbor {
  member: ChamberMember;
  /** 2D Euclidean distance from the anchor in (dim1, dim2) space. */
  distance: number;
}

export function ideologicalDistance(
  a: Pick<ChamberMember, "dim1" | "dim2">,
  b: Pick<ChamberMember, "dim1" | "dim2">,
): number {
  return Math.hypot(
    (a.dim1 as number) - (b.dim1 as number),
    (a.dim2 as number) - (b.dim2 as number),
  );
}

export function nearestNeighbors(
  anchor: ChamberMember,
  pool: readonly ChamberMember[],
  n = 5,
): Neighbor[] {
  if (anchor.dim1 == null || anchor.dim2 == null) return [];
  return pool
    .filter(
      (m) =>
        m.bioguideId !== anchor.bioguideId &&
        m.dim1 != null &&
        m.dim2 != null,
    )
    .map((member) => ({ member, distance: ideologicalDistance(anchor, member) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, n);
}
