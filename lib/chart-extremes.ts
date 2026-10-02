/** One plotted value, on the page's shared day axis. */
export interface ExtremePoint {
  day: number;
  value: number | null;
}

export interface Extremes<T extends ExtremePoint> {
  peak: T | null;
  low: T | null;
}

/**
 * The highest and lowest value among the points (nulls are gaps and skipped). Ties go to the earliest
 * point. A flat or single-value series has no meaningful peak or low, so it returns neither; and when
 * the peak and low are the same point only the peak is returned. Callers pass the points inside the
 * visible window, so the marks describe what is on screen.
 */
export function findExtremes<T extends ExtremePoint>(points: readonly T[]): Extremes<T> {
  let peak: T | null = null;
  let low: T | null = null;
  for (const p of points) {
    if (p.value === null) continue;
    if (peak === null || p.value > (peak.value as number)) peak = p;
    if (low === null || p.value < (low.value as number)) low = p;
  }
  if (peak === null || low === null || peak.value === low.value) return { peak: null, low: null };
  return { peak, low };
}

/**
 * One representative item per group, for labelling a scatter's legend categories (one Democrat, one
 * Republican; one House, one Senate, one joint committee). The representative is the item with the
 * highest `score` in its group (callers pass the distance from the centre so the pick is the most
 * extreme, hence most salient, dot). Groups are returned largest first and capped at `max`; ties go to
 * the earliest item. Items whose `score` is null are skipped.
 */
export function pickPerGroup<T>(items: readonly T[], group: (t: T) => string, score: (t: T) => number | null, max = 3): T[] {
  const best = new Map<string, { item: T; score: number }>();
  const size = new Map<string, number>();
  for (const it of items) {
    const sc = score(it);
    if (sc === null) continue;
    const g = group(it);
    size.set(g, (size.get(g) ?? 0) + 1);
    const cur = best.get(g);
    if (!cur || sc > cur.score) best.set(g, { item: it, score: sc });
  }
  return [...best.entries()]
    .sort((a, b) => (size.get(b[0]) ?? 0) - (size.get(a[0]) ?? 0))
    .slice(0, max)
    .map(([, v]) => v.item);
}
