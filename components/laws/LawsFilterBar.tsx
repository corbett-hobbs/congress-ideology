"use client";

import { useMemo } from "react";
import { FILTER_LABEL, FILTER_SELECT, HelpTip } from "@/components/charts/FilterBarParts";
import { RangeReset } from "@/components/charts/RangeReset";
import { RangeSelector } from "@/components/charts/RangeSelector";
import { TermBand } from "@/components/charts/TermBand";
import { ALL_GROUPS, OTHER_GROUPS, filterLabel, presidentBand, seriesOf, yearSpan } from "@/lib/laws-derive";
import { sameRange } from "@/lib/year-range";
import { useLawsActions, useLawsValues } from "./LawsState";

const MAJOR_DEFINITION =
  "A major law is one that political scientist David Mayhew's lists of important enactments name, judged from the press at the time and later policy studies. His lists run through the 118th Congress.";

/**
 * The pinned filter bar for /congress/laws, directly under the site navigation: the Policy area dropdown, the Major laws
 * checkbox with its "?", then the Years-shown slider with the presidential-term band under its track (the Decisions bar's
 * shape; the dropdown holds the topic groups, in the order of the legend). Phones: Policy area is alone on its row, so its
 * label sits beside it (rule 5a); the slider row follows.
 */
export function LawsFilterBar() {
  const { data, range, group, major } = useLawsValues();
  const { setRange, setGroup, setMajor } = useLawsActions();
  const terms = useMemo(() => presidentBand(data), [data]);
  const series = useMemo(() => seriesOf(data), [data]);
  const [lo, hi] = yearSpan(data);
  const full = sameRange(range, [lo, hi]);
  // The legend's order: the five coloured groups, the groups behind "Other topics", Not classified; then "Other topics" itself.
  const other = series.find((s) => s.id === OTHER_GROUPS)!;
  const ordered = [...series.slice(0, other ? series.indexOf(other) : 0).flatMap((s) => s.groups), ...other.groups, ...series[series.length - 1]!.groups];
  return (
    <div data-pinned-bar className="sticky top-0 z-40 border-b border-line-strong bg-surface/95 shadow-[0_2px_6px_rgba(26,34,51,0.08)] backdrop-blur sm:shadow-none">
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-2 pt-2 sm:px-6 sm:py-2.5">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-x-5">
          <div className="flex flex-none items-center gap-3 sm:pt-px">
            <label className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
              <span className={FILTER_LABEL}>Policy area</span>
              <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Policy area" className={`${FILTER_SELECT} min-w-0 flex-1 sm:w-[12.5rem] sm:flex-none`}>
                <option value={ALL_GROUPS}>{filterLabel(data, ALL_GROUPS)}</option>
                {ordered.map((g) => (
                  <option key={g} value={g}>
                    {filterLabel(data, g)}
                  </option>
                ))}
                <option value={OTHER_GROUPS}>{other.label}</option>
              </select>
            </label>
            <div className="flex flex-none items-center gap-1">
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
