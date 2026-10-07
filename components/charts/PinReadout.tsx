"use client";

/**
 * Phones have no hover tooltip, so each time chart prints the active month's reading above it (phones only):
 * the pinned month, or the latest while nothing is pinned. Page-state-agnostic: the caller passes the line and
 * whether a date is pinned (Trade and Energy each wrap it with their own state).
 */
export interface PinLine {
  /** Values shown together on one line, divided by " · ", e.g. "Produced 21.7M b/d". */
  values: string[];
  /** The month (and any "preliminary" note), then the president's term on the same last line. */
  date: string;
  term?: string;
}

export function PinReadout({ line, pinned, onClear, hint = "Tap or drag the chart to pin a month." }: { line: PinLine | null; pinned: boolean; onClear: () => void; hint?: string }) {
  return (
    <div className="mt-3 sm:hidden">
      {line && (
        <div aria-live="off">
          <p className="m-0 text-[0.82rem] font-medium leading-snug tabular-nums text-ink">{line.values.join(" · ")}</p>
          <p className="m-0 mt-0.5 text-[0.78rem] leading-snug text-ink-muted">
            {line.date}
            {line.term ? ` · ${line.term}` : ""}
          </p>
        </div>
      )}
      <p className="m-0 mt-1.5 text-[0.75rem] text-ink-muted">
        {hint}
        {pinned && (
          <>
            {" "}
            <button type="button" onClick={onClear} className="min-h-6 text-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              Clear
            </button>
          </>
        )}
      </p>
    </div>
  );
}
