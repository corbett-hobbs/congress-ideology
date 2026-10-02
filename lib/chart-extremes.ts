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
