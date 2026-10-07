import { SEGMENT_LABEL_STYLE, segmentLabelFits } from "@/lib/chart-bars";

/**
 * A stacked-bar segment's value, centred on (x, y): flat where the segment is wide enough and nothing where it doesn't fit. Recomputed on every render, so
 * narrowing the window or a filter (wider bars) brings labels in.
 */
export function SegmentLabel({ x, y, h, w, text }: { x: number; y: number; h: number; w: number; text: string }) {
  if (segmentLabelFits(h, w, text)) {
    return <text x={x} y={y} dy="0.35em" textAnchor="middle" style={SEGMENT_LABEL_STYLE}>{text}</text>;
  }
  return null;
}
