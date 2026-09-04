import type { ChamberMember } from "./congress-types";

/**
 * Nearest ideological neighbours: the closest entities by position in the
 * two-dimensional DW-NOMINATE space the compass plots.
 *
 * Distance is 2D Euclidean over (dim1, dim2) — the delegation chart's gap math
 * is `|dim1 gap|`, but this rings dots on the 2D compass, so a purely dim1
 * metric would ring dots that sit visibly far from the anchor on the vertical
 * (dim2) axis. Both dims, matching what the eye reads off the chart.
 *
 * Generic over the entity: members on a member's profile, committees on a
 * committee's page (their blended position lives in the same `dim1`/`dim2`
 * fields). Pass a single chamber's / chamber-scoped set as `pool`.
 */
export interface Neighbor<T = ChamberMember> {
  member: T;
  /** 2D Euclidean distance from the anchor in (dim1, dim2) space. */
  distance: number;
}

interface Point {
  dim1: number | null;
  dim2: number | null;
}

export function ideologicalDistance(
  a: Point,
  b: Point,
): number {
  return Math.hypot(
    (a.dim1 as number) - (b.dim1 as number),
    (a.dim2 as number) - (b.dim2 as number),
  );
}

/** Default identity: the `bioguideId` field members carry. */
function bioguideIdentity(x: unknown): unknown {
  return (x as { bioguideId?: unknown }).bioguideId;
}

export function nearestNeighbors<T extends Point>(
  anchor: T,
  pool: readonly T[],
  n = 5,
  identity: (x: T) => unknown = bioguideIdentity,
): Neighbor<T>[] {
  if (anchor.dim1 == null || anchor.dim2 == null) return [];
  const anchorId = identity(anchor);
  return pool
    .filter(
      (m) => identity(m) !== anchorId && m.dim1 != null && m.dim2 != null,
    )
    .map((member) => ({ member, distance: ideologicalDistance(anchor, member) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, n);
}
