"use client";

import { useId } from "react";

export interface RangePreset {
  label: string;
  from: number;
  to: number;
}

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
  /** Text for one end of the window, e.g. a year or a month name. */
  format: (v: number) => string;
  /** Quick windows ("Last 10 years"); the active one is pressed. */
  presets?: readonly RangePreset[];
  ariaLabel?: string;
  className?: string;
}

/**
 * Two-handle range control that sets which stretch of a time axis a chart
 * shows. Controlled and unit-free: it knows nothing about days, years or
 * charts, so every time-axis chart uses the same control and each page owns
 * one `[from, to]` state. Native range inputs give keyboard and touch drag
 * for free; "Show all" appears once the window is narrower than the extent.
 */
export function RangeSelector({
  min,
  max,
  value,
  onChange,
  minSpan = 1,
  step = 1,
  format,
  presets = [],
  ariaLabel = "Time range",
  className = "",
}: Props) {
  const id = useId();
  const [from, to] = value;
  const full = from <= min && to >= max;
  const range = Math.max(1, max - min);
  const left = ((from - min) / range) * 100;
  const right = ((to - min) / range) * 100;

  return (
    <div role="group" aria-label={ariaLabel} className={`mt-3 ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-ink-faint">Years shown</span>
        <span className="font-mono text-[0.8rem] font-semibold tabular-nums text-ink">
          {format(from)} – {format(to)}
        </span>
      </div>
      <div className="range-dual relative mx-[11px] mt-1 h-7">
        <div aria-hidden className="absolute inset-x-[-11px] top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-line" />
        <div
          aria-hidden
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent"
          style={{ left: `${left}%`, right: `${100 - right}%` }}
        />
        <input
          id={`${id}-from`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={from}
          aria-label={`${ariaLabel}, start`}
          aria-valuetext={format(from)}
          onChange={(e) => onChange([Math.min(+e.target.value, to - minSpan), to])}
          style={{ zIndex: from > max - minSpan * 2 ? 2 : 1 }}
        />
        <input
          id={`${id}-to`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={to}
          aria-label={`${ariaLabel}, end`}
          aria-valuetext={format(to)}
          onChange={(e) => onChange([from, Math.max(+e.target.value, from + minSpan)])}
          style={{ zIndex: 1 }}
        />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {presets.map((p) => {
          const on = from === p.from && to === p.to;
          return (
            <button
              key={p.label}
              type="button"
              aria-pressed={on}
              onClick={() => onChange([p.from, p.to])}
              className={`rounded-md border px-2 py-1 text-[0.72rem] transition-colors ${
                on ? "border-accent bg-surface-raised text-ink" : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
              }`}
            >
              {p.label}
            </button>
          );
        })}
        {!full && (
          <button type="button" onClick={() => onChange([min, max])} className="text-[0.72rem] font-medium text-accent hover:underline">
            Show all
          </button>
        )}
      </div>
    </div>
  );
}
