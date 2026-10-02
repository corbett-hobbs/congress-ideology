"use client";

import { termOptionLabel, termsNewestFirst, type IceTerm } from "@/lib/immigration-derive";

/**
 * The pinned filter bar for /presidency/immigration, directly under the site
 * navigation: one President dropdown. Choosing a president filters the chart to
 * that administration's fiscal years (a time series filters; it never dims).
 */
export function ImmigrationFilterBar({
  terms,
  value,
  onChange,
}: {
  terms: readonly IceTerm[];
  value: string;
  onChange: (selection: string) => void;
}) {
  return (
    <div className="sticky top-0 z-40 border-b border-line-strong bg-surface/95 shadow-[0_2px_6px_rgba(26,34,51,0.08)] backdrop-blur sm:shadow-none">
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-2 pt-2 sm:px-6 sm:py-2.5">
        <label className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-ink-faint">President</span>
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-11 w-full min-w-0 rounded-md border border-line-strong bg-surface-raised px-[0.55rem] text-[0.8rem] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:h-auto sm:w-[15rem] sm:py-[0.42rem]"
          >
            <option value="all">All presidents</option>
            {termsNewestFirst(terms).map((t) => (
              <option key={t.termId} value={t.termId}>
                {termOptionLabel(t)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
