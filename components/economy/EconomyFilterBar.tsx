"use client";

import { useMemo } from "react";
import { RangeReset } from "@/components/charts/RangeReset";
import { RangeSelector } from "@/components/charts/RangeSelector";
import { TermBand, type BandTerm } from "@/components/charts/TermBand";
import type { EconomyTerm } from "@/lib/economy-presidents";
import { sameRange, termYearRange, type YearRange } from "@/lib/year-range";

/**
 * The pinned filter bar for /presidency/economy: a Years-shown range slider with the presidential-term band under its
 * track (tap a term to add or drop it; there is no President dropdown) and the date status. The slider and the band are
 * two views of one year window, read by every chart; there is no per-chart state. Presidential terms and recession
 * shading are always on, so they have no toggle. The Congress-control option is a chart option, not a filter, so it sits
 * above the cards (EconomyPageClient), not here.
 */
export function EconomyFilterBar({
  terms,
  range,
  firstYear,
  lastYear,
  onRange,
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
  /** Month, year and president for the active date, or a hover/click hint. */
  status: string;
  canClear: boolean;
  onClear: () => void;
}) {
  const full: YearRange = [firstYear, lastYear];
  const isFull = sameRange(range, full);
  const bandTerms = useMemo<BandTerm[]>(
    () =>
      terms.map((t) => {
        const [from, to] = termYearRange(t.startYear, t.endYear, firstYear, lastYear);
        return { id: t.termId, label: `${t.full}, ${t.startYear}–${t.endYear ?? "present"}`, last: t.last, initials: t.full.split(" ").map((w) => w[0]).join(""), party: t.party, from, to };
      }),
    [terms, firstYear, lastYear],
  );
  return (
    <div className="sticky top-0 z-40 border-b border-line-strong bg-surface/95 backdrop-blur">
      <div className="mx-auto w-full max-w-[1180px] px-4 py-2.5 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-5">
          <RangeSelector
            min={firstYear}
            max={lastYear}
            value={range}
            onChange={(r) => onRange(sameRange(r, full) ? null : r)}
            format={String}
            ariaLabel="Years shown"
            below={<TermBand terms={bandTerms} min={firstYear} max={lastYear} value={range} onChange={(r) => onRange(sameRange(r, full) ? null : r)} />}
            action={<RangeReset show={!isFull} onReset={() => onRange(null)} className="mt-0.5 font-sans leading-none" />}
            className="w-full sm:w-auto sm:min-w-[220px] sm:flex-1"
          />
          <div className="flex min-w-0 items-center gap-2.5 sm:ml-auto">
            <span className="text-[0.8rem] leading-snug text-ink sm:w-[17rem] sm:truncate sm:text-right">{status}</span>
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
