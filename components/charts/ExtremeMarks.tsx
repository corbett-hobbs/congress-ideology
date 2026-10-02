"use client";

/** One labelled point on a line chart: its pixel position, the text, and whether it is the peak or the low. */
export interface ExtremeMark {
  x: number;
  y: number;
  text: string;
  kind: "peak" | "low";
}

const CHAR_W = 6.3;
const HALO = { stroke: "var(--surface)", strokeWidth: 3, paintOrder: "stroke" } as const;

/**
 * The peak and low of a line chart, marked on the line: a dot and a short "Mar 2020: 14.8%" label
 * (peak above its point, low below). Labels are clamped inside the plot so they never run off a
 * phone, and fade while a date is hovered or pinned so they don't fight the crosshair readout.
 * Callers compute the marks (see `lib/chart-extremes.ts`) from the points in the visible window.
 */
export function ExtremeMarks({ marks, left, right, top, bottom, faded = false }: { marks: readonly ExtremeMark[]; left: number; right: number; top: number; bottom: number; faded?: boolean }) {
  return (
    <g pointerEvents="none" opacity={faded ? 0.25 : 1} style={{ transition: "opacity .12s" }}>
      {marks.map((m) => {
        const w = m.text.length * CHAR_W;
        const cx = Math.min(Math.max(m.x, left + w / 2 + 2), right - w / 2 - 2);
        const raw = m.kind === "peak" ? m.y - 9 : m.y + 17;
        const ty = Math.min(Math.max(raw, top + 10), bottom - 4);
        return (
          <g key={`${m.kind}-${m.x}`}>
            <circle cx={m.x} cy={m.y} r={3.5} fill="var(--ink)" stroke="var(--surface)" strokeWidth={1.5} />
            <text x={cx} y={ty} textAnchor="middle" className="fill-ink text-[11px] font-medium" style={HALO}>
              {m.text}
            </text>
          </g>
        );
      })}
    </g>
  );
}
