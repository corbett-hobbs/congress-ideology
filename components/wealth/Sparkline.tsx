import { sparklineData } from "@/lib/wealth-sparkline";

const W = 96;
const H = 28;
const PAD = 3;

/**
 * A member's own 2013-2025 net worth midpoint series, tiny and self-scaled:
 * shares one x-axis across every row (so newer members visibly start
 * partway across) but each row's y-axis is scaled to that member's own
 * min/max, since the whole point is shape (up/down), not cross-member
 * comparison (the bold dollar figure next to it does that).
 */
export function Sparkline({ series }: { series: readonly (number | null)[] }) {
  const years = SERIES_YEARS;
  const d = sparklineData(series, years);

  const px = (x: number) => PAD + x * (W - 2 * PAD);
  const py = (y: number) => H - PAD - y * (H - 2 * PAD);

  if (d.points.length === 0) {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="flex-none opacity-40">
        <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} className="grid-line" />
      </svg>
    );
  }

  if (d.singleYear) {
    const p = d.points[0];
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="flex-none">
        <circle cx={px(p.x)} cy={py(p.y)} r={2.5} className="fill-accent" />
      </svg>
    );
  }

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="flex-none">
      {d.segments.map((s) => {
        const a = d.points[s.from];
        const b = d.points[s.to];
        return (
          <line
            key={`${s.from}-${s.to}`}
            x1={px(a.x)}
            y1={py(a.y)}
            x2={px(b.x)}
            y2={py(b.y)}
            className="stroke-accent"
            strokeWidth={1.4}
            strokeDasharray={s.dashed ? "2 2" : undefined}
            opacity={s.dashed ? 0.6 : 1}
          />
        );
      })}
      <circle
        cx={px(d.points[d.points.length - 1].x)}
        cy={py(d.points[d.points.length - 1].y)}
        r={2}
        className="fill-accent"
      />
    </svg>
  );
}

/** `series[i]` <-> this calendar year + i — mirrors lib/wealth-derive.ts's
 *  SERIES_YEARS without importing the server-only-adjacent module graph. */
const SERIES_YEARS = Array.from({ length: 13 }, (_, i) => 2013 + i);
