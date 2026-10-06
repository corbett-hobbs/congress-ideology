"use client";

import { useMemo } from "react";
import { RangeReset } from "@/components/charts/RangeReset";
import { RangeSelector } from "@/components/charts/RangeSelector";
import { TermBand, type BandTerm } from "@/components/charts/TermBand";
import type { IceTerm, IceYear } from "@/lib/immigration-derive";

/**
 * The pinned filter bar for /presidency/immigration, directly under the site navigation: one two-handle fiscal-year
 * slider with the presidential-term band under its track (tap a term to add or drop it; there is no President
 * dropdown). The slider sets the window the timeline shows (a time series filters; it never dims). The one selected
 * year the country list shows is chosen on a timeline bar or in the country card's year menu, not here.
 */
export function ImmigrationFilterBar({
  terms,
  years,
  bounds,
  range,
  onRange,
}: {
  terms: readonly IceTerm[];
  years: readonly IceYear[];
  /** First and last fiscal year in the data. */
  bounds: readonly [number, number];
  range: readonly [number, number];
  onRange: (r: [number, number]) => void;
}) {
  // A term's fiscal years are the ones assigned to it (the administration in office for most of the year), so
  // consecutive terms never share a year.
  const bandTerms = useMemo<BandTerm[]>(
    () =>
      terms.flatMap((t) => {
        const fys = years.filter((y) => y.termId === t.termId).map((y) => y.fy);
        return fys.length === 0
          ? []
          : [{ id: t.termId, label: `${t.president} (${t.startYear}–${t.endYear ?? ""})`, last: t.last, initials: t.president.split(" ").map((w) => w[0]).join(""), party: t.party, from: Math.min(...fys), to: Math.max(...fys) }];
      }),
    [terms, years],
  );
  const full = range[0] === bounds[0] && range[1] === bounds[1];
  return (
    <div className="sticky top-0 z-40 border-b border-line-strong bg-surface/95 shadow-[0_2px_6px_rgba(26,34,51,0.08)] backdrop-blur sm:shadow-none">
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-2 pt-2 sm:px-6 sm:py-2.5">
        <RangeSelector
          min={bounds[0]}
          max={bounds[1]}
          value={range}
          onChange={(r) => onRange(r)}
          format={(v) => `FY${String(v).slice(2)}`}
          ariaLabel="Fiscal years shown"
          below={<TermBand terms={bandTerms} min={bounds[0]} max={bounds[1]} value={range} onChange={(r) => onRange(r)} />}
          action={<RangeReset show={!full} onReset={() => onRange([bounds[0], bounds[1]])} className="mt-0.5 font-sans leading-none" />}
          className="min-w-0"
        />
      </div>
    </div>
  );
}
