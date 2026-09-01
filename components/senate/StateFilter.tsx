"use client";

import { useExplorerUrl } from "@/lib/use-chamber";
import { stateName } from "@/lib/states";

const BASE_CLASS =
  "rounded-md border border-line-strong bg-surface-raised text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/**
 * State dropdown — lives in the persistent site header, alongside the
 * chamber switcher (see components/SiteHeader.tsx). Writes `?state=`, which
 * every view reads from the same shared URL state (lib/use-chamber.ts):
 * narrows the explorer's compass panel to that state's delegation and adds
 * its trend as an overlay on the party-means chart.
 */
export function StateFilter({
  states,
  compact = false,
}: {
  states: string[];
  /** Smaller footprint for the site header vs. the explorer's own controls. */
  compact?: boolean;
}) {
  const { stateFilter, setStateFilter } = useExplorerUrl();

  return (
    <select
      aria-label="Filter by state"
      value={stateFilter ?? ""}
      onChange={(e) => setStateFilter(e.target.value || null)}
      className={`${BASE_CLASS} ${
        compact
          ? "max-w-[7rem] px-[0.5rem] py-[0.42rem] text-[0.8rem] sm:max-w-[8.5rem] sm:px-[0.55rem]"
          : "w-full px-[0.6rem] py-[0.48rem] text-[0.8rem] sm:w-auto"
      }`}
    >
      <option value="">All states</option>
      {states.map((s) => (
        <option key={s} value={s}>
          {stateName(s)}
        </option>
      ))}
    </select>
  );
}
