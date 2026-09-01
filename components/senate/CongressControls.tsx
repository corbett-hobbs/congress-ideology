"use client";

import { ordinal, congressYears } from "./format";

interface CongressControlsProps {
  congress: number;
  min: number;
  max: number;
  latest: number;
  playing: boolean;
  onCongressChange: (c: number) => void;
  onTogglePlay: () => void;
  onToday: () => void;
  children?: React.ReactNode;
}

export function CongressControls({
  congress,
  min,
  max,
  latest,
  playing,
  onCongressChange,
  onTogglePlay,
  onToday,
  children,
}: CongressControlsProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-4 rounded-[10px] border border-line bg-surface px-[1.1rem] py-[0.85rem]"
      aria-label="Congress selector"
    >
      <button
        type="button"
        onClick={onTogglePlay}
        aria-label={playing ? "Pause" : "Play through history"}
        className="flex size-9 flex-none items-center justify-center rounded-full border border-line-strong bg-surface-raised text-sm text-ink transition-colors hover:border-accent"
      >
        {playing ? "❚❚" : "▶"}
      </button>

      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={congress}
        aria-label="Congress number"
        onChange={(e) => onCongressChange(+e.target.value)}
        className="h-6 min-w-[140px] flex-1 cursor-pointer accent-[var(--accent)]"
      />

      <div className="flex flex-none flex-col items-end leading-tight tabular-nums">
        <span className="font-mono text-[0.95rem] font-semibold">
          {ordinal(congress)}
        </span>
        <span className="text-[0.76rem] text-ink-muted">
          {congressYears(congress)}
        </span>
      </div>

      <button
        type="button"
        onClick={onToday}
        disabled={congress === latest}
        className="flex-none rounded-md border border-line-strong bg-surface-raised px-3 py-[0.45rem] text-[0.8rem] font-medium text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-40 disabled:hover:border-line-strong disabled:hover:text-ink"
      >
        Jump to today
      </button>

      {children}
    </div>
  );
}
