"use client";

import { useMemo } from "react";
import { FILTER_LABEL, FILTER_SELECT, HelpTip } from "@/components/charts/FilterBarParts";
import { RangeReset } from "@/components/charts/RangeReset";
import { RangeSelector } from "@/components/charts/RangeSelector";
import { TermBand } from "@/components/charts/TermBand";
import { presidentBandTerms } from "@/lib/decisions-derive";
import { sameRange } from "@/lib/year-range";
import { useDecisionsActions, useDecisionsValues } from "./DecisionsState";
import { ALL_AREAS_LABEL, OTHER_LABEL } from "@/lib/decisions-derive";
import { OTHER_AREAS } from "@/lib/decisions-types";

const LANDMARK_DEFINITION =
  "A landmark case is a Supreme Court decision that set a major precedent or changed how the law works; this filter uses Wikipedia's list of landmark decisions in the United States.";

/**
 * The pinned filter bar for /supreme-court/decisions, directly under the site navigation: the Issue area dropdown, then
 * the Years-shown slider with the presidential-term band under its track (tinted by each president's party; there is no
 * President dropdown). Phones: Issue area is alone on its row, so its label sits
 * beside it (rule 5a); the slider row follows. The area is the same value a click on a row in card 3 sets.
 */
export function DecisionsFilterBar() {
  const { data, range, area, landmark } = useDecisionsValues();
  const { setRange, setArea, setLandmark } = useDecisionsActions();
  const terms = useMemo(() => presidentBandTerms(data), [data]);
  const lo = data.terms[0];
  const hi = data.terms[data.terms.length - 1];
  const full = sameRange(range, [lo, hi]);
  return (
    <div data-pinned-bar className="sticky top-0 z-40 border-b border-line-strong bg-surface/95 shadow-[0_2px_6px_rgba(26,34,51,0.08)] backdrop-blur sm:shadow-none">
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-2 pt-2 sm:px-6 sm:py-2.5">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-x-5">
          <div className="flex flex-none items-center gap-3 sm:pt-px">
          <label className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
            <span className={FILTER_LABEL}>Issue area</span>
            <select value={area} onChange={(e) => setArea(Number(e.target.value))} aria-label="Issue area" className={`${FILTER_SELECT} min-w-0 flex-1 sm:w-[10.5rem] sm:flex-none`}>
              <option value={-1}>{ALL_AREAS_LABEL}</option>
              {data.areas.map((a, i) => (
                <option key={a.id} value={i}>
                  {a.label}
                </option>
              ))}
              <option value={OTHER_AREAS}>{OTHER_LABEL(data)}</option>
            </select>
          </label>
          <div className="flex flex-none items-center gap-1">
            <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[0.8rem] text-ink">
              <input type="checkbox" checked={landmark} onChange={(e) => setLandmark(e.target.checked)} className="h-4 w-4 cursor-pointer accent-[var(--accent)]" />
              Landmark cases
            </label>
            <HelpTip label="What is a landmark case?" text={LANDMARK_DEFINITION} />
          </div>
          </div>
          <RangeSelector
            min={lo}
            max={hi}
            value={range}
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
