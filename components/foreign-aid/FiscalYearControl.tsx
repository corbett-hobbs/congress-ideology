"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fiscalYearSpan } from "@/lib/foreign-aid-derive";
import { useAidState } from "./ForeignAidState";

const STEP_MS = 450;

/**
 * Fiscal-year slider with play/pause, for the pinned filter bar. Playback advances one year per
 * tick, stops at the end of the range, and restarts from the range start when pressed at the end.
 * The range is the President filter's window.
 */
export function FiscalYearControl() {
  const { year, range, setYear, isPartial } = useAidState();
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const latest = useRef({ year, range, setYear });
  useEffect(() => {
    latest.current = { year, range, setYear };
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
    const { year: y, range: r, setYear: set } = latest.current;
    if (y >= r[1]) set(r[0]);
    setPlaying(true);
    timer.current = setInterval(() => {
      const { year: cur, range: rg, setYear: s } = latest.current;
      if (cur >= rg[1]) return stop();
      s(cur + 1);
      if (cur + 1 >= rg[1]) stop();
    }, STEP_MS);
  };

  return (
    <div className="col-span-2 flex min-w-0 flex-1 items-center gap-2.5 sm:col-auto sm:min-w-[19rem]">
      <button
        type="button"
        onClick={() => (playing ? stop() : start())}
        aria-label={playing ? "Pause" : "Play through fiscal years"}
        className="grid h-11 w-11 flex-none place-items-center rounded-md border border-line-strong bg-surface-raised text-ink hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:h-8 sm:w-8"
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
        onChange={(e) => setYear(Number(e.target.value))}
        aria-label="Fiscal year"
        aria-valuetext={`FY${year}, ${fiscalYearSpan(year)}${isPartial(year) ? ", partial year" : ""}`}
        className="h-6 min-w-[5rem] flex-1 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      />
      <div className="flex min-w-0 items-baseline gap-2 whitespace-nowrap">
        <b className="font-serif text-[1.05rem] font-semibold tabular-nums text-ink">FY{year}</b>
        <span className="hidden text-[0.75rem] text-ink-muted sm:inline">{fiscalYearSpan(year)}</span>
        {isPartial(year) && <em className="rounded border border-line-strong px-1.5 text-[0.7rem] not-italic text-ink-muted">partial</em>}
      </div>
    </div>
  );
}
