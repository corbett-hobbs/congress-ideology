"use client";

import { useMemo } from "react";
import { ChamberSwitch } from "@/components/ChamberSwitch";
import { RangeReset } from "@/components/charts/RangeReset";
import { RangeSelector } from "@/components/charts/RangeSelector";
import { TermBand } from "@/components/charts/TermBand";
import type { ChamberView } from "@/lib/chamber";
import { bandTerms, SLIDER_BOUNDS } from "@/lib/demographics-chart";
import type { DemoCongress, DemoPresident } from "@/lib/demographics-types";
import { sameRange, type YearRange } from "@/lib/year-range";

/**
 * The pinned filter bar for /congress/demographics, directly under the site navigation: the Chamber switch, then the
 * Years-shown slider with the presidential-term band under its track (no President dropdown). On a phone Chamber has its
 * own row and the slider row follows. The slider is the window every chart draws.
 */
export function DemographicsFilterBar({
  view,
  onView,
  rows,
  presidents,
  range,
  onRange,
}: {
  view: ChamberView;
  onView: (v: ChamberView) => void;
  /** Every Congress (the term band shows all of them regardless of the window). */
  rows: readonly DemoCongress[];
  presidents: readonly DemoPresident[];
  range: YearRange;
  onRange: (r: YearRange) => void;
}) {
  const terms = useMemo(() => bandTerms(rows, presidents), [rows, presidents]);
  const [lo, hi] = SLIDER_BOUNDS;
  const full = sameRange(range, SLIDER_BOUNDS);
  return (
    <div data-pinned-bar className="sticky top-0 z-40 border-b border-line-strong bg-surface/95 shadow-[0_2px_6px_rgba(26,34,51,0.08)] backdrop-blur sm:shadow-none">
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-2 pt-2 sm:px-6 sm:py-2.5">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-x-5">
          <div className="flex flex-none items-center gap-2 sm:pt-px">
            <span className="text-[0.72rem] font-medium uppercase tracking-[0.06em] text-ink-muted sm:hidden">Chamber</span>
            <ChamberSwitch value={view} onChange={onView} />
          </div>
          <RangeSelector
            min={lo}
            max={hi}
            value={range}
            onChange={(r) => onRange(r)}
            format={String}
            ariaLabel="Years shown"
            below={<TermBand terms={terms} min={lo} max={hi} value={range} onChange={(r) => onRange(r)} />}
            action={<RangeReset show={!full} onReset={() => onRange([lo, hi])} className="mt-0.5 font-sans leading-none" />}
            className="min-w-0 sm:flex-1"
          />
        </div>
      </div>
    </div>
  );
}
