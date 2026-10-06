export interface TermSegment {
  id: string;
  /** Last name, shown when it fits; then four letters, then initials, then the last initial. */
  last: string;
  /** Full name, for the initials ("Barack Obama" -> "BO"). */
  president: string;
  party: "D" | "R";
  /** First and last slot index the term covers inside the plot (inclusive). */
  s: number;
  e: number;
}

export const TERM_BAND_H = 20;

/** Runs of consecutive slots that share a term id, as segments. `termAt` returns the slot's term (or null for none). */
export function termSegments<T extends { id: string; last: string; president: string; party: "D" | "R" }>(
  slots: number,
  termAt: (slot: number) => T | null,
): TermSegment[] {
  const out: TermSegment[] = [];
  for (let i = 0; i < slots; i++) {
    const t = termAt(i);
    if (!t) continue;
    const prev = out[out.length - 1];
    if (prev && prev.id === t.id && prev.e === i - 1) prev.e = i;
    else out.push({ id: t.id, last: t.last, president: t.president, party: t.party, s: i, e: i });
  }
  return out;
}

/**
 * The presidential-term band under a slot-based SVG chart (the "Who's been No. 1" / "Who's hosted the most" cards):
 * the same light party tint, 2.5px party rule and `var(--ink)` label as every other term band (ARCHITECTURE_MAP rule
 * 10b), each label centred in its segment and shortened (last name, four letters, initials, last initial) rather than
 * dropped (rule 10). Render inside the chart's `<svg>`; `y` is the band's top edge.
 */
export function TermBandSvg({ segments, x0, step, y }: { segments: readonly TermSegment[]; x0: number; step: number; y: number }) {
  return (
    <g transform={`translate(0,${y})`} aria-hidden>
      {segments.map((g) => {
        const x = x0 + g.s * step;
        const w = (g.e - g.s + 1) * step;
        const c = g.party === "R" ? "--rep" : "--dem";
        const initials = g.president.split(" ").map((p) => p[0]).join("");
        const text = [g.last, `${g.last.slice(0, 4)}.`, initials, initials.slice(-1)].find((t) => t.length * 6.4 + (t.length > 1 ? 4 : 1) <= w) ?? "";
        return (
          <g key={`${g.id}-${g.s}`}>
            <rect x={x + 0.5} y={0} width={Math.max(0, w - 1)} height={TERM_BAND_H} rx={2} style={{ fill: `color-mix(in oklab, var(${c}) 20%, var(--surface))` }} />
            <rect x={x + 0.5} y={0} width={Math.max(0, w - 1)} height={2.5} style={{ fill: `var(${c})` }} />
            {text && (
              <text x={x + w / 2} y={TERM_BAND_H - 5} textAnchor="middle" style={{ fontSize: 11, fill: "var(--ink)" }}>
                {text}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
