"use client";

import { CHAMBER_VIEWS, viewLabel } from "@/lib/chamber";
import { useExplorerUrl } from "@/lib/use-chamber";
import { StateFilter } from "./StateFilter";
import { ordinal, congressYears } from "./format";

interface ExplorerToolbarProps {
  states: string[];
  congress: number;
  min: number;
  max: number;
  playing: boolean;
  onCongressChange: (c: number) => void;
  onTogglePlay: () => void;
}

/**
 * The one sticky toolbar for the explorer: chamber switch, state filter,
 * play/pause, the Congress slider, and the Congress display on a single line.
 * Every chart on the page reads the same Congress value this drives
 * (SenateExplorer owns it) — see spec / session 10.
 */
export function ExplorerToolbar({
  states,
  congress,
  min,
  max,
  playing,
  onCongressChange,
  onTogglePlay,
}: ExplorerToolbarProps) {
  const { view, setView } = useExplorerUrl();

  return (
    <div className="sticky top-0 z-40 border-b border-line-strong bg-surface/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center gap-x-2 gap-y-3 px-4 py-2.5 sm:gap-x-5 sm:px-6">
        <div
          role="group"
          aria-label="Chamber"
          className="flex flex-none overflow-hidden rounded-lg border border-line-strong text-[0.8rem] font-medium"
        >
          {CHAMBER_VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`px-2 py-[0.35rem] transition-colors sm:px-[0.85rem] ${
                view === v
                  ? "bg-accent text-accent-ink"
                  : "bg-surface-raised text-ink-muted hover:text-ink"
              }`}
            >
              {viewLabel(v)}
            </button>
          ))}
        </div>

        <div className="flex flex-none items-center gap-1.5 sm:gap-2">
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-ink-faint">
            State
          </span>
          <StateFilter states={states} compact />
        </div>

        <div className="flex min-w-[220px] flex-1 items-center gap-3">
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={playing ? "Pause" : "Play through every Congress"}
            className="flex size-8 flex-none items-center justify-center rounded-full border border-line-strong bg-surface-raised text-[0.7rem] text-ink transition-colors hover:border-accent"
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <input
            type="range"
            min={min}
            max={max}
            step={1}
            value={congress}
            aria-label="Congress"
            onChange={(e) => onCongressChange(+e.target.value)}
            className="h-6 flex-1 cursor-pointer accent-[var(--accent)]"
          />
          <div className="flex flex-none items-baseline gap-1.5 whitespace-nowrap tabular-nums">
            <span className="font-mono text-[0.95rem] font-semibold text-ink">
              {ordinal(congress)}
            </span>
            <span className="text-[0.76rem] text-ink-muted">
              {congressYears(congress)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
