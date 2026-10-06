"use client";

/**
 * Phones have no hover tooltip, so each time chart prints the active month's reading above it (phones only):
 * the pinned month, or the latest while nothing is pinned. Page-state-agnostic: the caller passes the line and
 * whether a date is pinned (Trade and Energy each wrap it with their own state).
 */
export function PinReadout({ line, pinned, onClear }: { line: string; pinned: boolean; onClear: () => void }) {
  return (
    <div className="mt-3 sm:hidden">
      <p className="m-0 font-mono text-[0.8rem] leading-snug text-ink" aria-live="off">{line}</p>
      <p className="m-0 mt-0.5 text-[0.75rem] text-ink-muted">
        Tap or drag the chart to pin a month.
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
