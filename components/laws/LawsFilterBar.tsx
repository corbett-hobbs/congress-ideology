"use client";

import { useMemo } from "react";
import { FILTER_LABEL, FILTER_SELECT, HelpTip } from "@/components/charts/FilterBarParts";
import { RangeReset } from "@/components/charts/RangeReset";
import { RangeSelector } from "@/components/charts/RangeSelector";
import { TermBand } from "@/components/charts/TermBand";
import { Swatch } from "@/components/decisions/shared";
import { ALL_GROUPS, SUPPORT_COLORS, SUPPORT_LABELS, SUPPORT_ORDER, SUPPORT_SHORT, filterLabel, presidentBand, seriesOf, yearSpan } from "@/lib/laws-derive";
import { sameRange } from "@/lib/year-range";
import { useLawsActions, useLawsValues } from "./LawsState";

const MAJOR_DEFINITION =
  "A major law is one that political scientist David Mayhew's lists of important enactments name, judged from the press at the time and later policy studies. His lists run through the 118th Congress.";

/**
 * The pinned filter bar for /congress/laws, directly under the site navigation: the Policy area dropdown, the Major laws
 * checkbox with its "?", then the Years-shown slider with the presidential-term band under its track (the Decisions bar's
 * shape; the dropdown holds the topic groups, in the order of the legend). Vote sets the support band the legend and the list pills also set, and
 * carries a chip (with a ×, from `sm`: on a phone the select already says it) while one is picked. Phones: Policy area and Vote share a row (labels read by screen readers only), then Major laws, then the slider.
 */
export function LawsFilterBar() {
  const { data, range, group, major, band } = useLawsValues();
  const { setRange, setGroup, setMajor, setBand } = useLawsActions();
  const terms = useMemo(() => presidentBand(data), [data]);
  const series = useMemo(() => seriesOf(data), [data]);
  const [lo, hi] = yearSpan(data);
  const full = sameRange(range, [lo, hi]);
  // The legend's order: one entry per topic group, largest first.
  const ordered = series.flatMap((s) => s.groups);
  return (
    <div data-pinned-bar className="sticky top-0 z-40 border-b border-line-strong bg-surface/95 shadow-[0_2px_6px_rgba(26,34,51,0.08)] backdrop-blur sm:shadow-none">
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-2 pt-2 sm:px-6 sm:py-2.5">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-x-5">
          <div className="flex flex-none flex-wrap items-center gap-x-3 gap-y-1.5 sm:flex-nowrap sm:pt-px">
            <label className="flex min-w-0 basis-[calc(50%-0.375rem)] items-center gap-2 sm:flex-none sm:basis-auto">
              <span className={`${FILTER_LABEL} max-sm:sr-only`}>Policy area</span>
              <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Policy area" className={`${FILTER_SELECT} min-w-0 flex-1 sm:w-[12.5rem] sm:flex-none`}>
                <option value={ALL_GROUPS}>{filterLabel(data, ALL_GROUPS)}</option>
                {ordered.map((g) => (
                  <option key={g} value={g}>
                    {filterLabel(data, g)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 basis-[calc(50%-0.375rem)] items-center gap-2 sm:flex-none sm:basis-auto">
              <span className={`${FILTER_LABEL} max-sm:sr-only`}>Vote</span>
              <select value={band === null ? "" : String(band)} onChange={(e) => setBand(e.target.value === "" ? null : Number(e.target.value))} aria-label="Vote: the closest recorded final-passage vote" className={`${FILTER_SELECT} min-w-0 flex-1 sm:w-[9.5rem] sm:flex-none`}>
                <option value="">Any vote</option>
                {SUPPORT_ORDER.map((k) => (
                  <option key={k} value={k}>
                    {SUPPORT_SHORT[k]}
                  </option>
                ))}
              </select>
            </label>
            {band !== null && (
              <button
                type="button"
                onClick={() => setBand(null)}
                aria-label={`Clear the vote filter (${SUPPORT_LABELS[band]})`}
                title="Applies to the charts and the list. Click to clear."
                className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full max-sm:hidden border border-line-strong bg-surface-raised px-2 py-0.5 text-[0.75rem] text-ink hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <Swatch color={SUPPORT_COLORS[band]!} />
                {SUPPORT_SHORT[band]}
                <span aria-hidden className="text-ink-muted">
                  ×
                </span>
              </button>
            )}
            <div className="flex flex-none items-center gap-1 max-sm:basis-full">
              <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[0.8rem] text-ink">
                <input type="checkbox" checked={major} onChange={(e) => setMajor(e.target.checked)} className="h-4 w-4 cursor-pointer accent-[var(--accent)]" />
                Major laws
              </label>
              <HelpTip label="What is a major law?" text={MAJOR_DEFINITION} />
            </div>
          </div>
          <RangeSelector
            min={lo}
            max={hi}
            value={range}
            minSpan={1}
            onChange={(r) => setRange(r)}
            format={String}
            ariaLabel="Years shown"
            below={<TermBand terms={terms} min={lo} max={hi} value={range} onChange={(r) => setRange(r)} />}
            action={<RangeReset show={!full} onReset={() => setRange([lo, hi])} className="mt-0.5 font-sans leading-none" />}
            className="min-w-0 sm:flex-1"
          />
        </div>
      </div>
    </div>
  );
}
