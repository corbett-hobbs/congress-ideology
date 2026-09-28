"use client";

import { ChamberSwitch } from "@/components/ChamberSwitch";
import { StateFilter } from "@/components/senate/StateFilter";
import { stateName } from "@/lib/states";
import type { ChamberView } from "@/lib/chamber";

/** "members" / "senators" / "House members" — the wealth page's own copy,
 *  distinct from lib/chamber.ts's `viewNoun` ("member(s) of Congress" for
 *  "both", used elsewhere for chamber-neutral prose). */
function countNoun(view: ChamberView): string {
  if (view === "senate") return "senators";
  if (view === "house") return "House members";
  return "members";
}

/**
 * The pinned filter bar for /congress/wealth: chamber switch + state dropdown
 * (reusing the same controls as the homepage explorer's toolbar), plus a
 * right-aligned summary count. Every chart/list on the page reads the same
 * `view`/`stateFilter` pair — there is no independent per-chart filter state.
 */
export function WealthFilterBar({
  view,
  onViewChange,
  states,
  stateFilter,
  onStateFilterChange,
  count,
}: {
  view: ChamberView;
  onViewChange: (v: ChamberView) => void;
  states: string[];
  stateFilter: string | null;
  onStateFilterChange: (s: string | null) => void;
  count: number;
}) {
  const summary = `${count.toLocaleString("en-US")} ${countNoun(view)} with net worth data${
    stateFilter ? ` in ${stateName(stateFilter)}` : ""
  }`;

  return (
    <div className="sticky top-0 z-40 border-b border-line-strong bg-surface/95 backdrop-blur">
      <div className="mx-auto w-full max-w-[1120px] px-4 py-2.5 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-5">
          <ChamberSwitch value={view} onChange={onViewChange} />

          <div className="flex flex-none items-center gap-1.5 sm:gap-2">
            <span className="hidden font-mono text-[0.62rem] uppercase tracking-[0.08em] text-ink-faint sm:inline">
              State
            </span>
            <StateFilter
              states={states}
              value={stateFilter}
              onChange={onStateFilterChange}
              compact
            />
          </div>

          <p className="ml-auto min-w-0 text-right font-mono text-[0.72rem] leading-snug text-ink-muted">
            {summary}
          </p>
        </div>
      </div>
    </div>
  );
}
