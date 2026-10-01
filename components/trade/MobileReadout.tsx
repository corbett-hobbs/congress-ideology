"use client";

import { useTradeActions, useTradeValues } from "./TradeState";

/**
 * Phones have no hover tooltip, so each time chart prints the active month's reading
 * above it (phones only): the pinned month, or the latest while nothing is pinned.
 */
export function MobileReadout({ line }: { line: string }) {
  const { pin } = useTradeValues();
  const { clearPin } = useTradeActions();
  return (
    <div className="mt-3 sm:hidden">
      <p className="m-0 font-mono text-[0.8rem] leading-snug text-ink" aria-live="off">{line}</p>
      <p className="m-0 mt-0.5 text-[0.75rem] text-ink-muted">
        Tap or drag the chart to pin a month.
        {pin !== null && (
          <>
            {" "}
            <button type="button" onClick={clearPin} className="min-h-6 text-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              Clear
            </button>
          </>
        )}
      </p>
    </div>
  );
}
