"use client";

import { RangeSelector } from "@/components/charts/RangeSelector";
import type { EconomyTerm } from "@/lib/economy-presidents";
import { sameRange, termYearRange, type YearRange } from "@/lib/year-range";

/**
 * The pinned filter bar for /presidency/economy, same shell as the Congress,
 * Wealth and Court toolbars: a President dropdown, a Years-shown range slider
 * and a Congress-control checkbox. The dropdown and the slider are two views of
 * one year window (picking a president sets it to that term's years), read by
 * every chart; there is no per-chart state.
 * Presidential terms and recession shading are always on, so they have no toggle.
 */
export function EconomyFilterBar({
  terms,
  range,
  firstYear,
  lastYear,
  onRange,
  showCong,
  onShowCong,
  status,
  canClear,
  onClear,
}: {
  terms: readonly EconomyTerm[];
  /** The visible year window. */
  range: YearRange;
  firstYear: number;
  lastYear: number;
  onRange: (r: YearRange | null) => void;
  showCong: boolean;
  onShowCong: (on: boolean) => void;
  /** Month, year and president for the active date, or a hover/click hint. */
  status: string;
  canClear: boolean;
  onClear: () => void;
}) {
  const order = terms.map((_, i) => i).reverse(); // newest first
  const full: YearRange = [firstYear, lastYear];
  const isFull = sameRange(range, full);
  // The dropdown reads the window back: a president when it is exactly their years, otherwise all or custom.
  const termIdx = terms.findIndex((t) => sameRange(termYearRange(t.startYear, t.endYear, firstYear, lastYear), range));
  const selectValue = isFull ? "" : termIdx >= 0 ? String(termIdx) : "custom";
  return (
    <div className="sticky top-0 z-40 border-b border-line-strong bg-surface/95 backdrop-blur">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-2.5 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-5">
          <label className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none sm:gap-2">
            <span className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-ink-faint">President</span>
            <select
              value={selectValue}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "custom") return;
                if (v === "") return onRange(null);
                const t = terms[Number(v)];
                onRange(termYearRange(t.startYear, t.endYear, firstYear, lastYear));
              }}
              className="min-w-0 flex-1 rounded-md border border-line-strong bg-surface-raised px-[0.55rem] py-[0.42rem] text-[0.8rem] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:w-[15rem] sm:flex-none"
            >
              <option value="">All presidents</option>
              {selectValue === "custom" && <option value="custom">Custom years</option>}
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
          <RangeSelector
            min={firstYear}
            max={lastYear}
            value={range}
            onChange={(r) => onRange(sameRange(r, full) ? null : r)}
            format={String}
            ariaLabel="Years shown"
            className="order-last w-full sm:order-none sm:w-auto sm:min-w-[220px] sm:flex-1"
          />
          <div className="flex min-w-0 items-center gap-2.5 sm:ml-auto">
            <span className="text-[0.8rem] leading-snug text-ink">{status}</span>
            {canClear && (
              <button
                type="button"
                onClick={onClear}
                className="flex-none rounded-md border border-line-strong bg-surface px-[0.65rem] py-[0.42rem] text-[0.8rem] text-ink transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                Clear date
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
