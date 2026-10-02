"use client";

/**
 * "Reset" link that sits beside a `RangeSelector` and puts the year window back to its
 * full range. Renders nothing while the window is already full, so it only appears when
 * there is something to reset. Used by every Presidency page's pinned filter bar.
 */
export function RangeReset({ show, onReset, className = "" }: { show: boolean; onReset: () => void; className?: string }) {
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={onReset}
      aria-label="Reset years shown to the full range"
      className={`flex-none text-[0.8rem] font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${className}`}
    >
      Reset
    </button>
  );
}
