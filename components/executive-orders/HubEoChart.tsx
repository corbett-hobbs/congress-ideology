import { scaleLinear } from "d3-scale";
import { EO_TOPICS, topicFill, type EoPayload } from "@/lib/executive-orders-types";

const W = 320;
const H = 200;
const M = { top: 6, right: 4, bottom: 4, left: 4 };

/**
 * Static snapshot of the executive-orders explorer: orders per year, stacked by
 * topic (count mode, no axes or interaction). Needs `TopicPatternDefs` once on
 * the page for the hatched / dotted topic fills. Server-rendered.
 */
export function HubEoChart({ data }: { data: EoPayload }) {
  const n = data.years.length;
  const max = Math.max(...data.years.map((y) => y.total));
  const y = scaleLinear().domain([0, max]).range([H - M.bottom, M.top]);
  const slot = (W - M.left - M.right) / n;
  const bw = slot * 0.8;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Executive orders signed per year, ${data.years[0].year} to ${data.years[n - 1].year}, stacked by topic`}
    >
      {data.years.map((yr, i) => {
        let acc = 0;
        return (
          <g key={yr.year}>
            {EO_TOPICS.map((t) => {
              const v = yr.counts[t] ?? 0;
              if (!v) return null;
              const top = y(acc + v);
              const h = y(acc) - top;
              acc += v;
              return (
                <rect
                  key={t}
                  x={M.left + i * slot + (slot - bw) / 2}
                  y={top}
                  width={bw}
                  height={h}
                  style={{ fill: topicFill(t) }}
                />
              );
            })}
          </g>
        );
      })}
      <line x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} stroke="var(--line-strong)" />
    </svg>
  );
}
