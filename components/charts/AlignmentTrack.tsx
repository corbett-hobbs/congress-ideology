const xPct = (v: number) => ((v + 1) / 2) * 100;

/**
 * A small inline two-point comparison on the shared [-1, 1] axis: one
 * member's own position (solid, party-coloured) against a reference point
 * (faint, neutral) — e.g. a committee's blended position. New (not reused
 * from `charts/SwarmRows`, which draws a whole shared-axis chart of many
 * rows), but the same dot-on-a-line visual language as the roster/beeswarm
 * tracks elsewhere. Purely informational — not a click target itself.
 */
export function AlignmentTrack({
  primaryValue,
  primaryColor,
  referenceValue,
}: {
  primaryValue: number;
  /** CSS colour value, e.g. `var(--dem)` — matches how other small inline
   *  dots on this site (CommitteeHeader's control dot, roster rows) take a
   *  colour rather than an SVG fill class. */
  primaryColor: string;
  referenceValue: number;
}) {
  return (
    <div aria-hidden className="relative h-5">
      <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
      <span
        className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-faint opacity-55"
        style={{ left: `${xPct(referenceValue)}%` }}
      />
      <span
        className="absolute top-1/2 size-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface"
        style={{
          left: `${xPct(primaryValue)}%`,
          background: primaryColor,
          boxShadow: "0 0 0 1px var(--ink-faint)",
        }}
      />
    </div>
  );
}
