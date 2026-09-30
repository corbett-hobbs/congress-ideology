export type AlignmentTrackPoint =
  | {
      value: number;
      /** CSS colour value, e.g. `var(--dem)` — matches how other small
       *  inline dots on this site (CommitteeHeader's control dot, roster
       *  rows) take a colour rather than an SVG fill class. */
      color: string;
      faint?: false;
      ring?: false;
    }
  | {
      value: number;
      /** A hollow ring in `color`: the anchor the other dots are compared to
       *  (the justice page's subject), rather than one of the compared dots. */
      color: string;
      ring: true;
      faint?: false;
    }
  | {
      value: number;
      /** A dim, neutral reference tick (a committee/subcommittee's blended
       *  position) rather than a solid party-coloured dot (a specific
       *  member's). */
      faint: true;
    };

interface AlignmentTrackProps {
  points: AlignmentTrackPoint[];
  /** Value range the track spans. Defaults to DW-NOMINATE's [-1, 1]; the
   *  justice pages pass the shared Martin-Quinn domain. */
  domain?: readonly [number, number];
  /** Faint line joining a ring to the solid dot(s), so the gap reads as a span. */
  connect?: boolean;
  /** A small tick at 0 when 0 is inside the domain. */
  zeroTick?: boolean;
}

/**
 * A small inline multi-point comparison on a shared axis: one or more solid,
 * party-coloured dots against an optional faint reference tick — e.g. a
 * member's own position against a committee's blended position, or a
 * subcommittee's chair and ranking member against the full committee's mean.
 * Points paint in array order, so put faint reference ticks first. Also draws
 * a hollow ring (a fixed anchor) with an optional connector and zero tick, for
 * the justice roster: the ring is the subject, the filled dot the peer, at the
 * SAME x in every row. New (not reused from `charts/SwarmRows`, which draws a
 * whole shared-axis chart of many rows), but the same dot-on-a-line visual
 * language as the roster/beeswarm tracks elsewhere. Purely informational — not
 * a click target itself.
 */
export function AlignmentTrack({
  points,
  domain = [-1, 1],
  connect = false,
  zeroTick = false,
}: AlignmentTrackProps) {
  const [lo, hi] = domain;
  const xPct = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const ring = points.find((p) => "ring" in p && p.ring);
  const solid = points.find((p) => !p.faint && !("ring" in p && p.ring));

  return (
    <div aria-hidden className="relative h-5">
      <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
      {zeroTick && lo < 0 && hi > 0 && (
        <span
          className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-line-strong"
          style={{ left: `${xPct(0)}%` }}
        />
      )}
      {connect && ring && solid && (
        <span
          className="absolute top-1/2 h-px -translate-y-1/2 bg-ink-faint opacity-60"
          style={{
            left: `${Math.min(xPct(ring.value), xPct(solid.value))}%`,
            width: `${Math.abs(xPct(ring.value) - xPct(solid.value))}%`,
          }}
        />
      )}
      {points.map((p, i) =>
        p.faint ? (
          <span
            key={i}
            className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-faint opacity-55"
            style={{ left: `${xPct(p.value)}%` }}
          />
        ) : p.ring ? (
          <span
            key={i}
            className="absolute top-1/2 size-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-transparent"
            style={{ left: `${xPct(p.value)}%`, borderColor: p.color }}
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
