"use client";

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
}

/**
 * Two-handle range slider for a pinned filter bar: the dual-handle sibling of
 * the single-handle sliders in the Congress and Court toolbars (same row
 * shape: a flexible track, then a mono readout). Controlled and unit-free, so
 * every time-axis page uses the same control and owns one `[from, to]` state.
 * Native range inputs give keyboard and touch drag for free.
 */
export function RangeSelector({ min, max, value, onChange, minSpan = 0, step = 1, format, ariaLabel, className = "" }: Props) {
  const [from, to] = value;
  const range = Math.max(1, max - min);
  const left = ((from - min) / range) * 100;
  const right = ((to - min) / range) * 100;

  return (
    <div role="group" aria-label={ariaLabel} className={`flex min-w-0 items-center gap-3 ${className}`}>
      <div className="range-dual relative mx-[11px] h-6 min-w-0 flex-1">
        <div aria-hidden className="absolute inset-x-[-11px] top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-line" />
        <div aria-hidden className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent" style={{ left: `${left}%`, right: `${100 - right}%` }} />
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
      <span className="flex-none whitespace-nowrap font-mono text-[0.95rem] font-semibold tabular-nums text-ink">
        {from === to ? format(from) : `${format(from)}–${format(to)}`}
      </span>
    </div>
  );
}
