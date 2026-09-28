/**
 * Pure geometry for the highest/lowest lists' per-member sparkline
 * (components/wealth/Sparkline.tsx) -- a member's own 2013-2025 midpoint
 * series, normalized to [0, 1] on both axes so the component only has to
 * scale by its own pixel width/height. No DOM, so it's unit-testable.
 */

export interface SparklinePoint {
  /** 0 (2013) .. 1 (2025), independent of how many years are actually known. */
  x: number;
  /** 0 (this member's own minimum) .. 1 (this member's own maximum). */
  y: number;
  year: number;
}

export interface SparklineSegment {
  from: number;
  to: number;
  /** True when the two points aren't adjacent years -- a bridge across a gap. */
  dashed: boolean;
}

export interface SparklineData {
  points: SparklinePoint[];
  segments: SparklineSegment[];
  /** Only one usable year at all -- draw a dot, not a line. */
  singleYear: boolean;
  firstYear: number | null;
  lastYear: number | null;
}

export function sparklineData(
  series: readonly (number | null)[],
  years: readonly number[],
): SparklineData {
  const known = years
    .map((year, i) => ({ year, value: series[i] }))
    .filter((d): d is { year: number; value: number } => d.value != null);

  if (known.length === 0) {
    return { points: [], segments: [], singleYear: false, firstYear: null, lastYear: null };
  }

  const xSpan = years[years.length - 1] - years[0] || 1;
  const values = known.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  const points: SparklinePoint[] = known.map((d) => ({
    x: (d.year - years[0]) / xSpan,
    y: span === 0 ? 0.5 : (d.value - min) / span,
    year: d.year,
  }));

  const segments: SparklineSegment[] = [];
  for (let i = 1; i < points.length; i++) {
    segments.push({
      from: i - 1,
      to: i,
      dashed: points[i].year - points[i - 1].year > 1,
    });
  }

  return {
    points,
    segments,
    singleYear: points.length === 1,
    firstYear: known[0].year,
    lastYear: known[known.length - 1].year,
  };
}
