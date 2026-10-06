"use client";

import type { ReactNode } from "react";

interface Props {
  /** Full extent the handles can span (inclusive). */
  min: number;
  max: number;
  /** Current window `[from, to]`, within `[min, max]`. */
  value: readonly [number, number];
  onChange: (next: [number, number]) => void;
  /** Smallest allowed window, in the same units as `min`/`max`. */
  minSpan?: number;
  step?: number;
  /** Text for one end of the window, e.g. a year. */
  format: (v: number) => string;
  ariaLabel: string;
  className?: string;
  /** Optional strip drawn under the track, inset like the track so it lines up with the handles' travel (the term band). */
  below?: ReactNode;
  /** Rendered under the years (the Reset link), inside the readout column so it never narrows the track. */
  action?: ReactNode;
}

/**
 * Two-handle range slider for a pinned filter bar: the dual-handle sibling of
 * the single-handle sliders in the Congress and Court toolbars (same row
 * shape: a flexible track, then a mono readout). Controlled and unit-free, so
 * every time-axis page uses the same control and owns one `[from, to]` state.
 * Native range inputs give keyboard and touch drag for free. With a term band (`below`), phones put the readout on a line
 * above the track (years left, Reset right) so the track runs the full width; from `sm` the readout sits to its right.
 */
export function RangeSelector({ min, max, value, onChange, minSpan = 0, step = 1, format, ariaLabel, className = "", below, action }: Props) {
  const [from, to] = value;
  const range = Math.max(1, max - min);
  const left = ((from - min) / range) * 100;
  const right = ((to - min) / range) * 100;

  return (
    <div role="group" aria-label={ariaLabel} className={`flex min-w-0 gap-2 ${below ? "flex-col gap-0.5 sm:flex-row sm:items-start sm:gap-2" : "items-center"} ${className}`}>
      <div className="min-w-0 flex-1">
      {/* The inputs span the full width; a native thumb's centre only travels the inner width minus one thumb (22px),
          so the visible track is inset by half a thumb to end exactly where the handles do. */}
      <div className="range-dual relative h-6 min-w-0">
        <div aria-hidden className="absolute inset-x-[11px] top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-line">
          <div aria-hidden className="absolute inset-y-0 rounded-full bg-accent" style={{ left: `${left}%`, right: `${100 - right}%` }} />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={from}
          aria-label={`${ariaLabel}, start`}
          aria-valuetext={format(from)}
          onChange={(e) => onChange([Math.min(+e.target.value, to - minSpan), to])}
          // When both handles sit at the right end, the start handle must be the grabbable one.
          style={{ zIndex: from >= max - step ? 2 : 1 }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={to}
          aria-label={`${ariaLabel}, end`}
          aria-valuetext={format(to)}
          onChange={(e) => onChange([from, Math.max(+e.target.value, from + minSpan)])}
        />
      </div>
      {below}
      </div>
      <span className={`flex min-w-0 flex-none flex-col items-end whitespace-nowrap font-mono tabular-nums text-ink ${below ? "order-first w-full flex-row items-baseline justify-between sm:order-none sm:min-h-6 sm:w-[5.25rem] sm:flex-col sm:items-end sm:justify-start" : ""}`}>
        <span className={`text-[0.95rem] font-semibold ${below ? "leading-6" : ""}`}>
          {from === to ? format(from) : `${format(from)}–${format(to)}`}
        </span>
        {action}
      </span>
    </div>
  );
}
