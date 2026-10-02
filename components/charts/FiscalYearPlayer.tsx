"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STEP_MS = 450;

/**
 * Single-year slider with play/pause, for a pinned filter bar (the foreign-aid and immigration pages).
 * Playback advances one year per tick, stops at the end of the range, and restarts from the range
 * start when pressed at the end. Controlled: the page owns the year and the `[first, last]` window.
 */
export function FiscalYearPlayer({
  year,
  range,
  onYear,
  ariaLabel = "Fiscal year",
  valueText,
  note,
  span,
}: {
  year: number;
  range: readonly [number, number];
  onYear: (y: number) => void;
  ariaLabel?: string;
  /** Screen-reader text for the slider's current value. */
  valueText: string;
  /** Small italic line under the year, e.g. "partial year". */
  note?: string;
  /** Wide screens: the date span beside the year, e.g. "Oct 2023 – Sep 2024". */
  span?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const latest = useRef({ year, range, onYear });
  useEffect(() => {
    latest.current = { year, range, onYear };
  });

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setPlaying(false);
  }, []);
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const start = () => {
    const { year: y, range: r, onYear: set } = latest.current;
    if (y >= r[1]) set(r[0]);
    setPlaying(true);
    timer.current = setInterval(() => {
      const { year: cur, range: rg, onYear: s } = latest.current;
      if (cur >= rg[1]) return stop();
      s(cur + 1);
      if (cur + 1 >= rg[1]) stop();
    }, STEP_MS);
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 sm:ml-auto sm:min-w-[14rem] sm:gap-2.5">
      <button
        type="button"
        onClick={() => (playing ? stop() : start())}
        aria-label={playing ? "Pause" : "Play through fiscal years"}
        className="grid size-8 flex-none place-items-center rounded-full border border-line-strong bg-surface-raised text-ink hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <svg viewBox="0 0 14 14" className="h-3.5 w-3.5 fill-current" aria-hidden>
          {playing ? <path d="M3 2h3v10H3zM8 2h3v10H8z" /> : <path d="M3 1.5v11l9-5.5z" />}
        </svg>
      </button>
      <input
        type="range"
        min={range[0]}
        max={range[1]}
        step={1}
        value={year}
        onChange={(e) => onYear(Number(e.target.value))}
        aria-label={ariaLabel}
        aria-valuetext={valueText}
        className="h-6 w-0 min-w-[3rem] flex-1 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      />
      <div className="flex flex-none items-center gap-2 whitespace-nowrap">
        <div className="flex flex-col items-end leading-tight">
          <b className="font-serif text-[0.95rem] font-semibold tabular-nums text-ink sm:text-[1.05rem]">FY{year}</b>
          {note && <em className="text-[0.66rem] not-italic text-ink-muted [font-style:italic]">{note}</em>}
        </div>
        {span && <span className="hidden text-[0.75rem] text-ink-muted lg:inline">{span}</span>}
      </div>
    </div>
  );
}
