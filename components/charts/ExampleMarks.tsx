"use client";

/** One example value on one line of a multi-line chart. */
export interface ExampleMark {
  x: number;
  y: number;
  text: string;
  color: string;
  /** Label above its dot (the highest line) or below it. */
  above: boolean;
}

const CHAR_W = 6.3;
const HALO = { stroke: "var(--surface)", strokeWidth: 3, paintOrder: "stroke" } as const;

/** Where to put each example: the point of `pts` nearest three quarters across the window (clear of the edge and any preliminary stretch). */
export function pickExample<T extends { day: number; value: number | null }>(pts: readonly T[], view: readonly [number, number]): T | null {
  const target = view[0] + (view[1] - view[0]) * 0.75;
  let best: T | null = null;
  for (const p of pts) {
    if (p.value === null || p.day < view[0] || p.day >= view[1]) continue;
    if (best === null || Math.abs(p.day - target) < Math.abs(best.day - target)) best = p;
  }
  return best;
}

/** Marks the highest-valued example as `above`, the rest below. */
export function aboveFlags<T extends { value: number }>(items: readonly T[]): boolean[] {
  const top = Math.max(...items.map((i) => i.value));
  return items.map((i) => i.value === top);
}

/**
 * Multi-line charts have no single peak or low, so each line carries one coloured dot and a short
 * "Mar 2020: 20.4M" label instead (rule 12a). Clamped inside the plot; fades while a date is hovered or pinned.
 */
export function ExampleMarks({ marks, left, right, top, bottom, faded = false }: { marks: readonly ExampleMark[]; left: number; right: number; top: number; bottom: number; faded?: boolean }) {
  return (
    <g pointerEvents="none" opacity={faded ? 0.25 : 1} style={{ transition: "opacity .12s" }}>
      {marks.map((m) => {
        const w = m.text.length * CHAR_W;
        const cx = Math.min(Math.max(m.x, left + w / 2 + 2), right - w / 2 - 2);
        const ty = Math.min(Math.max(m.above ? m.y - 9 : m.y + 17, top + 10), bottom - 4);
        return (
          <g key={`${m.color}-${m.x}-${m.y}`}>
            <circle cx={m.x} cy={m.y} r={3.5} fill={m.color} stroke="var(--surface)" strokeWidth={1.5} />
            <text x={cx} y={ty} textAnchor="middle" className="fill-ink text-[11px] font-medium" style={HALO}>{m.text}</text>
          </g>
        );
      })}
    </g>
  );
}
