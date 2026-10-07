"use client";

import { useLayoutEffect, useState } from "react";
import { fmtShare } from "@/lib/chart-bars";
import { fmtAge, ordinal } from "@/lib/demographics-chart";
import type { DemoCongress } from "@/lib/demographics-types";

/** Height of the pinned filter bar, so the strip can stick just under it on phones. */
function usePinnedBarHeight(): number {
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const bar = document.querySelector<HTMLElement>("[data-pinned-bar]");
    if (!bar) return;
    const measure = () => setH(bar.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);
  return h;
}

/**
 * Three headline numbers for one Congress in the chosen chamber view: the pinned one, else the latest. Every value comes
 * from the payload. The tiles share one row (phones drop the detail line) and the strip sticks under the pinned
 * filter bar once scrolled past, so the pinned Congress's numbers stay in view while you use the charts; the same on desktop, where the detail lines stay.
 */
export function StatStrip({ row }: { row: DemoCongress }) {
  const barH = usePinnedBarHeight();
  const women = row.women.D + row.women.R + row.women.O;
  const tiles = [
    { label: "Median age", short: "Median age", value: fmtAge(row.ageAll.median), sub: `Democrats ${fmtAge(row.age.D.median)} · Republicans ${fmtAge(row.age.R.median)}` },
    { label: "Women", short: "Women", value: fmtShare(women / (row.seats || 1)), sub: `${women} of ${row.seats} members` },
    { label: "Average time in Congress", short: "Avg. time", value: `${Math.round((row.servedSum / (row.seats || 1)) * 2)} years`, sub: `${fmtShare(row.tenure[0] / (row.seats || 1))} have served up to 2 years` },
  ];
  return (
    <div style={{ top: barH }} className="sticky z-30 -mx-4 border-b border-line bg-bg px-4 pb-2 pt-1.5 sm:-mx-6 sm:px-6 sm:pb-3 sm:pt-2">
      <p className="m-0 mb-1.5 text-[0.75rem] text-ink-muted sm:mb-2 sm:text-[0.8rem]">
        {ordinal(row.congress)} Congress, {row.year}–{row.year + 1}
      </p>
      <dl className="m-0 grid grid-cols-3 gap-2 sm:gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="min-w-0 rounded-[10px] border border-line bg-surface px-2.5 py-2 sm:px-4 sm:py-2">
            <dt className="truncate text-[0.62rem] font-medium uppercase tracking-[0.04em] text-ink-muted sm:text-[0.72rem] sm:tracking-[0.06em]">
              <span className="sm:hidden">{t.short}</span>
              <span className="max-sm:hidden">{t.label}</span>
            </dt>
            <div className="mt-1 sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-2.5">
              <dd className="m-0 font-serif text-[1.2rem] font-medium leading-none tabular-nums text-ink sm:text-[1.6rem]">{t.value}</dd>
              <dd className="m-0 text-[0.78rem] text-ink-muted max-sm:hidden">{t.sub}</dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}
