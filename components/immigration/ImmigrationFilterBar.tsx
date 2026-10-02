"use client";

import { FiscalYearPlayer } from "@/components/charts/FiscalYearPlayer";
import { termOptionLabel, termsNewestFirst, type IceTerm } from "@/lib/immigration-derive";

/**
 * The pinned filter bar for /presidency/immigration, directly under the site
 * navigation: a President dropdown and a fiscal-year slider with play/pause (the foreign-aid pattern).
 * Choosing a president filters the timeline to that administration's fiscal years (a time series
 * filters; it never dims) and clamps the slider to them; the slider picks the one year the country
 * list below shows, and is marked on the timeline.
 */
export function ImmigrationFilterBar({
  terms,
  value,
  onChange,
  fy,
  fyRange,
  onFy,
}: {
  terms: readonly IceTerm[];
  value: string;
  onChange: (selection: string) => void;
  fy: number;
  /** The fiscal years the timeline shows (the President selection's window). */
  fyRange: readonly [number, number];
  onFy: (fy: number) => void;
}) {
  return (
    <div className="sticky top-0 z-40 border-b border-line-strong bg-surface/95 shadow-[0_2px_6px_rgba(26,34,51,0.08)] backdrop-blur sm:shadow-none">
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-2 pt-2 sm:px-6 sm:py-2.5">
        {/* Phones: the dropdown and the slider share one row (two controls per row; the label is dropped, "All presidents" says it). */}
        <div className="flex items-center gap-2 sm:gap-x-5">
        <label className="flex flex-none items-center gap-2">
          <span className="hidden font-mono text-[0.62rem] uppercase tracking-[0.08em] text-ink-faint sm:inline">President</span>
          <select
            aria-label="President"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-11 w-[8.25rem] min-w-0 rounded-md border border-line-strong bg-surface-raised px-[0.55rem] text-[0.8rem] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:h-auto sm:w-[15rem] sm:py-[0.42rem]"
          >
            <option value="all">All presidents</option>
            {termsNewestFirst(terms).map((t) => (
              <option key={t.termId} value={t.termId}>
                {termOptionLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <FiscalYearPlayer year={fy} range={fyRange} onYear={onFy} valueText={`FY${fy}, October ${fy - 1} to September ${fy}`} span={`Oct ${fy - 1} – Sep ${fy}`} />
        </div>
      </div>
    </div>
  );
}
