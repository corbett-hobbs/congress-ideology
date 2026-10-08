"use client";

import { RangeReset } from "@/components/charts/RangeReset";
import { PillGroup } from "@/components/charts/PillGroup";
import {
  termLabel,
  type CourtFilter,
  type CourtPresident,
} from "@/lib/court-types";

const APPOINTED = [
  { value: "all", label: "All" },
  { value: "D", label: "Democratic" },
  { value: "R", label: "Republican" },
] as const;

interface CourtToolbarProps {
  appointed: CourtFilter["appointed"];
  onAppointed: (v: CourtFilter["appointed"]) => void;
  president: string | null;
  onPresident: (key: string | null) => void;
  /** Already narrowed to the active party and ordered latest-first. */
  presidentOptions: CourtPresident[];
  term: number;
  min: number;
  max: number;
  playing: boolean;
  onTermChange: (t: number) => void;
  onTogglePlay: () => void;
}

/**
 * The one sticky toolbar for the Court explorer, stacked like the Congress
 * one (components/senate/ExplorerToolbar.tsx): "Appointed by" filters on the
 * left, the term slider on the right. Below `sm` the party pills and the
 * president dropdown share one line (the visible "Appointed by" label drops,
 * its accessible name stays) with the slider row beneath.
 */
export function CourtToolbar({
  appointed,
  onAppointed,
  president,
  onPresident,
  presidentOptions,
  term,
  min,
  max,
  playing,
  onTermChange,
  onTogglePlay,
}: CourtToolbarProps) {
  const label = termLabel(term);

  return (
    <div className="sticky top-0 z-40 border-b border-line-strong bg-surface/95 backdrop-blur">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-2.5 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-3 sm:gap-x-5">
          <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-none">
            <span
              id="court-appointed-label"
              className="hidden font-mono text-[0.62rem] uppercase tracking-[0.08em] text-ink-faint sm:inline"
            >
              Appointed by
            </span>
            <PillGroup
              options={APPOINTED}
              value={appointed}
              onChange={onAppointed}
              ariaLabel="Appointed by"
            />
            <select
              aria-label="Appointing president"
              value={president ?? ""}
              onChange={(e) => onPresident(e.target.value || null)}
              className="min-w-0 flex-1 rounded-md border border-line-strong bg-surface-raised px-[0.5rem] py-[0.42rem] text-[0.8rem] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:w-[9.5rem] sm:flex-none sm:px-[0.55rem]"
            >
              <option value="">All presidents</option>
              {presidentOptions.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.key}
                </option>
              ))}
            </select>
          </div>

          <div className="flex w-full min-w-0 items-center gap-3 sm:ml-auto sm:w-auto sm:min-w-[300px] sm:flex-1">
            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={playing ? "Pause" : "Play through every term"}
              className="flex size-8 flex-none items-center justify-center rounded-full border border-line-strong bg-surface-raised text-[0.7rem] text-ink transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <input
              type="range"
              min={min}
              max={max}
              step={1}
              value={term}
              aria-label="Supreme Court term"
              aria-valuetext={label}
              onChange={(e) => onTermChange(+e.target.value)}
              className="h-6 min-w-0 flex-1 cursor-pointer accent-[var(--accent)]"
            />
            <span className="relative flex-none whitespace-nowrap font-mono text-[0.95rem] font-semibold tabular-nums text-ink">
              <span className={`inline-block transition-transform ${term !== max ? "-translate-y-[0.4rem]" : ""}`}>{label}</span>
              <RangeReset
                show={term !== max}
                onReset={() => onTermChange(max)}
                ariaLabel="Reset to the latest term"
                className="absolute right-0 top-full -mt-[0.35rem] font-sans leading-none"
              />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
