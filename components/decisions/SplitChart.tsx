"use client";

import { useMemo } from "react";
import { StackedArea } from "@/components/charts/StackedArea";
import { buildStacks, presidentSegments, sumBucket, windowCells, fmtPct, bandShare } from "@/lib/decisions-derive";
import { BAND_COLORS, BAND_LONG, BAND_SHORT, type SplitMode } from "@/lib/decisions-types";
import { useDecisionsActions, useDecisionsValues } from "./DecisionsState";
import { Swatch, TooltipCard, chiefLine } from "./shared";

const CAPTIONS: Record<SplitMode, readonly string[]> = {
  share: ["Share of cases by number of justices dissenting, percent", "Share of cases by dissents, percent", "Share of cases, %"],
  count: ["Cases per term by number of justices dissenting", "Cases by dissents", "Cases"],
};

/**
 * The stacked area of card 2: five dissent bands (unanimous at the bottom, 5-4 on top) over the terms in the window, as a
 * share of the term's cases or as a count. The drawing, hover, pin and band labels are the shared `StackedArea`; this binds it to
 * the Decisions state. `iso` draws one band alone from zero on its own axis.
 */
export function SplitChart({ mode, onIso }: { mode: SplitMode; onIso: (k: number) => void }) {
  const { data, range, area, band: iso, hover, pin } = useDecisionsValues();
  const { moveHover, leaveHover, togglePin, pinTerm, clearPin } = useDecisionsActions();
  const eff: SplitMode = iso !== null ? "count" : mode;

  const { terms, cells } = useMemo(() => windowCells(data, area, range), [data, area, range]);
  const segs = useMemo(() => presidentSegments(data, terms), [data, terms]);
  const vis = useMemo(() => (iso === null ? [0, 1, 2, 3, 4] : [iso]), [iso]);
  const stacks = useMemo(() => buildStacks(cells, eff, vis), [cells, eff, vis]);

  return (
    <StackedArea
      slots={terms}
      stacks={stacks}
      vis={vis}
      mode={eff}
      colors={BAND_COLORS}
      shortLabels={BAND_SHORT}
      longLabels={BAND_LONG}
      captions={CAPTIONS[eff]}
      segments={segs}
      hover={hover}
      pin={pin}
      moveHover={moveHover}
      leaveHover={leaveHover}
      togglePin={togglePin}
      pinTerm={pinTerm}
      clearPin={clearPin}
      iso={iso}
      onIso={onIso}
      ariaLabel="Stacked area chart of Supreme Court cases by number of dissenting justices, one slot per term"
      pickLabel="Pick a term: arrow keys move the pin, Escape clears it"
      renderTooltip={(t) => {
        const i = terms.indexOf(t);
        const b = cells[i] ?? [0, 0, 0, 0, 0];
        const total = sumBucket(b);
        return (
          <TooltipCard title={`${t} term`} sub={chiefLine(data, t)}>
            <div>{total} cases</div>
            {[4, 3, 2, 1, 0].map((k) => (
              <div key={k}>
                <Swatch color={BAND_COLORS[k]} /> {BAND_SHORT[k]}: {b[k]}
                {total ? ` (${fmtPct(bandShare(b, k))})` : ""}
              </div>
            ))}
          </TooltipCard>
        );
      }}
    />
  );
}
