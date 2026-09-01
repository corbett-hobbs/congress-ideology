"use client";

import { useExplorerUrl } from "@/lib/use-chamber";
import { stateName } from "@/lib/states";

/**
 * State dropdown, next to the member search. Writes `?state=` — selecting a
 * state narrows the compass panel to that state's delegation. See
 * lib/use-chamber.ts.
 */
export function StateFilter({ states }: { states: string[] }) {
  const { stateFilter, setStateFilter } = useExplorerUrl();

  return (
    <select
      aria-label="Filter by state"
      value={stateFilter ?? ""}
      onChange={(e) => setStateFilter(e.target.value || null)}
      className="flex-none rounded-md border border-line-strong bg-surface-raised px-[0.6rem] py-[0.48rem] text-[0.8rem] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
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
