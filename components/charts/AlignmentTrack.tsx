const xPct = (v: number) => ((v + 1) / 2) * 100;

export type AlignmentTrackPoint =
  | {
      value: number;
      /** CSS colour value, e.g. `var(--dem)` — matches how other small
       *  inline dots on this site (CommitteeHeader's control dot, roster
       *  rows) take a colour rather than an SVG fill class. */
      color: string;
      faint?: false;
    }
  | {
      value: number;
      /** A dim, neutral reference tick (a committee/subcommittee's blended
       *  position) rather than a solid party-coloured dot (a specific
       *  member's). */
      faint: true;
    };

/**
 * A small inline multi-point comparison on the shared [-1, 1] axis: one or
 * more solid, party-coloured dots against an optional faint reference tick —
 * e.g. a member's own position against a committee's blended position, or a
 * subcommittee's chair and ranking member against the full committee's mean.
 * Points paint in array order, so put faint reference ticks first. New (not
 * reused from `charts/SwarmRows`, which draws a whole shared-axis chart of
 * many rows), but the same dot-on-a-line visual language as the roster/
 * beeswarm tracks elsewhere. Purely informational — not a click target itself.
 */
export function AlignmentTrack({ points }: { points: AlignmentTrackPoint[] }) {
  return (
    <div aria-hidden className="relative h-5">
      <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
      {points.map((p, i) =>
        p.faint ? (
          <span
            key={i}
            className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-faint opacity-55"
            style={{ left: `${xPct(p.value)}%` }}
          />
        ) : (
          <span
            key={i}
            className="absolute top-1/2 size-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface"
            style={{
              left: `${xPct(p.value)}%`,
              background: p.color,
              boxShadow: "0 0 0 1px var(--ink-faint)",
            }}
          />
        ),
      )}
    </div>
  );
}
