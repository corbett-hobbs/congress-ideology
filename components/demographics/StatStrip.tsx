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
 * from the payload. On phones the tiles share one row (the detail line is dropped) and the strip sticks under the pinned
 * filter bar once scrolled past, so the pinned Congress's numbers stay in view while you use the charts; from `sm` it is
 * an ordinary block.
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
    <div style={{ top: barH }} className="z-30 -mx-4 border-b border-line bg-bg px-4 pb-2 pt-1.5 max-sm:sticky sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
      <p className="m-0 mb-1.5 text-[0.75rem] text-ink-muted sm:mb-2 sm:text-[0.8rem]">
        {ordinal(row.congress)} Congress, {row.year}–{row.year + 1}
      </p>
      <dl className="m-0 grid grid-cols-3 gap-2 sm:gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="min-w-0 rounded-[10px] border border-line bg-surface px-2.5 py-2 sm:px-4 sm:py-3">
            <dt className="truncate text-[0.62rem] font-medium uppercase tracking-[0.04em] text-ink-muted sm:text-[0.72rem] sm:tracking-[0.06em]">
              <span className="sm:hidden">{t.short}</span>
              <span className="max-sm:hidden">{t.label}</span>
            </dt>
            <dd className="m-0 mt-1 font-serif text-[1.2rem] font-medium leading-none tabular-nums text-ink sm:text-[1.9rem]">{t.value}</dd>
            <dd className="m-0 mt-1.5 text-[0.78rem] text-ink-muted max-sm:hidden">{t.sub}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
