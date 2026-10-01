"use client";

import type { EconomyTerm } from "@/lib/economy-presidents";

/**
 * The pinned filter bar for /presidency/economy, same shell as the Congress,
 * Wealth and Court toolbars: a President dropdown and a Congress-control
 * checkbox. Both are read by every chart; there is no per-chart state.
 * Presidential terms and recession shading are always on, so they have no toggle.
 */
export function EconomyFilterBar({
  terms,
  term,
  onTerm,
  showCong,
  onShowCong,
}: {
  terms: readonly EconomyTerm[];
  term: number | null;
  onTerm: (i: number | null) => void;
  showCong: boolean;
  onShowCong: (on: boolean) => void;
}) {
  const order = terms.map((_, i) => i).reverse(); // newest first
  return (
    <div className="sticky top-0 z-40 border-b border-line-strong bg-surface/95 backdrop-blur">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-2.5 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-5">
          <label className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none sm:gap-2">
            <span className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-ink-faint">President</span>
            <select
              value={term === null ? "" : String(term)}
              onChange={(e) => onTerm(e.target.value === "" ? null : Number(e.target.value))}
              className="min-w-0 flex-1 rounded-md border border-line-strong bg-surface-raised px-[0.55rem] py-[0.42rem] text-[0.8rem] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:w-[15rem] sm:flex-none"
            >
              <option value="">All presidents</option>
              {order.map((i) => {
                const t = terms[i];
                return (
                  <option key={t.termId} value={i}>
                    {`${t.full}, ${t.startYear}–${t.endYear ?? "present"}`}
                  </option>
                );
              })}
            </select>
          </label>
          <label className="flex flex-none cursor-pointer items-center gap-2 rounded-md border border-line-strong bg-surface-raised px-[0.65rem] py-[0.42rem] text-[0.8rem] text-ink">
            <input
              type="checkbox"
              checked={showCong}
              onChange={(e) => onShowCong(e.target.checked)}
              className="m-0 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            />
            Congress control
          </label>
        </div>
      </div>
    </div>
  );
}
