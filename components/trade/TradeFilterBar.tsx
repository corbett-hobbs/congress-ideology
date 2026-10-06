"use client";

import { CountryCombobox } from "./CountryCombobox";
import { RangeReset } from "@/components/charts/RangeReset";
import { RangeSelector } from "@/components/charts/RangeSelector";
import { TermBand, type BandTerm } from "@/components/charts/TermBand";
import { useMemo } from "react";
import type { EconomyTerm } from "@/lib/economy-presidents";
import type { TradeCountryRef } from "@/lib/trade-types";
import { sameRange, termYearRange, type YearRange } from "@/lib/year-range";

const LABEL = "font-mono text-[0.62rem] uppercase tracking-[0.08em] text-ink-faint";

/**
 * The pinned filter bar for /presidency/trade, same shell as the Economy, Congress and Court bars: a Country dropdown
 * and a Years-shown slider with the presidential-term band under its track (tap a term to add or drop it; there is no
 * President dropdown). The Congress-control option is a chart option, so it sits above Chart 1 (TradePageClient), not
 * here. (The partners chart picks its own year in its card.) Every control writes the shared `TradeState`.
 */
export function TradeFilterBar({
  terms,
  countries,
  country,
  onCountry,
  range,
  firstYear,
  lastYear,
  onRange,
  canClear,
  onClear,
}: {
  terms: readonly EconomyTerm[];
  countries: readonly TradeCountryRef[];
  country: string | null;
  onCountry: (code: string | null) => void;
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
        {/* Phones: Country alone on its row, so its label sits beside it (rule 5a); the slider and term band below.
            From sm up: one row. */}
        <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className={LABEL}>Country</span>
            <CountryCombobox countries={countries} value={country} onChange={onCountry} className="w-full sm:w-[12rem]" />
          </div>
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
