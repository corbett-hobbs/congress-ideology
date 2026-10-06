"use client";

import { useMemo } from "react";
import { RangeReset } from "@/components/charts/RangeReset";
import { RangeSelector } from "@/components/charts/RangeSelector";
import { TermBand, type BandTerm } from "@/components/charts/TermBand";
import type { EconomyTerm } from "@/lib/economy-presidents";
import { sameRange, termYearRange, type YearRange } from "@/lib/year-range";

/**
 * The pinned filter bar for /presidency/energy: one Years-shown slider with the presidential-term band under its
 * track (tap a term to add or drop it; there is no President dropdown and no other filter). The slider and the band
 * are two views of one year window that every card draws. Same shell as the Economy and Trade bars.
 */
export function EnergyFilterBar({
  terms,
  range,
  firstYear,
  lastYear,
  onRange,
  canClear,
  onClear,
}: {
  terms: readonly EconomyTerm[];
  range: YearRange;
  firstYear: number;
  lastYear: number;
  onRange: (r: YearRange | null) => void;
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
  const setWindow = (r: YearRange) => onRange(sameRange(r, full) ? null : r);
  return (
    <div className="sticky top-0 z-40 border-b border-line-strong bg-surface/95 shadow-[0_2px_6px_rgba(26,34,51,0.08)] backdrop-blur sm:shadow-none">
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-2 pt-2 sm:px-6 sm:py-2.5">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-2">
          <RangeSelector
            min={firstYear}
            max={lastYear}
            value={range}
            onChange={setWindow}
            format={String}
            ariaLabel="Years shown"
            below={<TermBand terms={bandTerms} min={firstYear} max={lastYear} value={range} onChange={setWindow} />}
            action={<RangeReset show={!isFull} onReset={() => onRange(null)} className="mt-0.5 font-sans leading-none" />}
            className="min-w-0 sm:min-w-[260px] sm:flex-1"
          />
          {canClear && (
            <button
              type="button"
              onClick={onClear}
              className="hidden flex-none rounded-md border border-line-strong bg-surface px-[0.65rem] py-[0.42rem] text-[0.8rem] text-ink transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:block"
            >
              Clear date
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
