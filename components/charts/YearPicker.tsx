"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A year dropdown with play, for a card whose year is chosen *inside* the card (a map or ranked list) while the pinned
 * bar's two-handle slider only sets the window. It lists the years in `range` (newest first) and sets the page's one
 * selected year, so the chart above highlights the same bar. Play steps one year at a time to the end of the window.
 * Shared by the national security map card and the immigration country card.
 */
export function YearPicker({
  value,
  range,
  onChange,
  format,
  ariaLabel,
  playRange,
}: {
  value: number;
  range: readonly [number, number];
  onChange: (v: number) => void;
  format: (v: number) => string;
  ariaLabel: string;
  /** Years play steps through when narrower than the dropdown's `range` (a card whose data covers only part of the window). Clamped to `range`. */
  playRange?: readonly [number, number];
}) {
  const span: readonly [number, number] = playRange ? [Math.max(range[0], playRange[0]), Math.min(range[1], playRange[1])] : range;
  const [playing, setPlaying] = useState(false);
  const latest = useRef({ value, range: span, onChange });
  useEffect(() => {
    latest.current = { value, range: span, onChange };
  });
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const { value: cur, range: r, onChange: set } = latest.current;
      if (cur >= r[1]) return setPlaying(false);
      set(cur + 1);
      if (cur + 1 >= r[1]) setPlaying(false);
    }, 450);
    return () => clearInterval(t);
  }, [playing]);
  const options: number[] = [];
  for (let v = range[1]; v >= range[0]; v--) options.push(v);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          if (!playing && (value >= span[1] || value < span[0])) onChange(span[0]);
          setPlaying((p) => !p);
        }}
        aria-label={playing ? "Pause" : "Play through the years"}
        className="grid size-8 flex-none place-items-center rounded-full border border-line-strong bg-surface-raised text-ink hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <svg viewBox="0 0 14 14" className="h-3.5 w-3.5 fill-current" aria-hidden>
          {playing ? <path d="M3 2h3v10H3zM8 2h3v10H8z" /> : <path d="M3 1.5v11l9-5.5z" />}
        </svg>
      </button>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => {
          setPlaying(false);
          onChange(Number(e.target.value));
        }}
        className="rounded-md border border-line-strong bg-surface-raised px-[0.55rem] py-[0.42rem] text-[0.8rem] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {options.map((v) => (
          <option key={v} value={v}>
            {format(v)}
          </option>
        ))}
      </select>
    </div>
  );
}
