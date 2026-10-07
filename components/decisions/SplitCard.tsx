"use client";

import { useState } from "react";
import { useDecisionsActions } from "./DecisionsState";
import { ChartCard } from "@/components/charts/ChartCard";
import { LegendToggle } from "@/components/charts/LegendToggle";
import { LEGEND_ITEM, LEGEND_ROW } from "@/components/charts/legend";
import { PillGroup } from "@/components/charts/PillGroup";
import { MethodologyNote } from "@/components/MethodologyNote";
import { areaFilterLabel, bandShare, fmtInt, fmtPct, isSmallSample, sumBucket, windowCells, windowSum } from "@/lib/decisions-derive";
import { BAND_COLORS, BAND_LONG, BAND_SHORT, type SplitMode } from "@/lib/decisions-types";
import { SplitChart } from "./SplitChart";
import { useDecisionsValues } from "./DecisionsState";
import { Swatch, TableView } from "./shared";

/**
 * Card 2: how divided the Court is. The stacked area of `SplitChart`, a Share of cases / Number of cases toggle, and a
 * legend whose entries isolate a band (rule 12c): the pick draws that band alone from zero on its own axis and switches to
 * the count view; going back to Share clears it. Few-cases note when the issue area is thin; the chart is never hidden.
 */
export function SplitCard() {
  const { data, range, area } = useDecisionsValues();
  const [mode, setModeRaw] = useState<SplitMode>("share");
  const { band: iso } = useDecisionsValues();
  const { setBand } = useDecisionsActions();
  // The picked band is the page's dissent filter: it also narrows card 1 and the case list (see DecisionsState).
  const setMode = (m: SplitMode) => {
    setModeRaw(m);
    if (m === "share") setBand(null);
  };
  const pick = (k: number) => {
    setBand(iso === k ? null : k);
    setModeRaw("count");
  };

  const w = windowSum(data, area, range);
  const total = sumBucket(w);
  const lo = range[0];
  const hi = range[1];
  const who = areaFilterLabel(data, area);
  const lede = total
    ? `${who}, ${lo === hi ? lo : `${lo}–${hi}`}: ${fmtPct(bandShare(w, 0))} of ${fmtInt(total)} cases were unanimous, ${fmtPct(bandShare(w, 4))} split 5–4.`
    : "No cases in this selection.";
  const { terms, cells } = windowCells(data, area, range);

  return (
    <ChartCard
      title="How divided is the Court?"
      lede={lede}
      action={
        <PillGroup
          ariaLabel="Split measure"
          value={mode}
          onChange={setMode}
          options={[
            { value: "share", label: "Share of cases" },
            { value: "count", label: "Number of cases" },
          ]}
        />
      }
    >
      <SplitChart mode={mode} onIso={pick} />
      <div className={`mt-2 ${LEGEND_ROW}`}>
        {[0, 1, 2, 3, 4].map((k) => (
          <LegendToggle key={k} active={iso === k} dimmed={iso !== null && iso !== k} onClick={() => pick(k)}>
            <span className={LEGEND_ITEM}>
              <Swatch color={BAND_COLORS[k]} />
              {BAND_LONG[k]}
            </span>
          </LegendToggle>
        ))}
      </div>
      {isSmallSample(data, area, range) && (
        <p className="m-0 mt-2 text-[0.78rem] leading-[1.45] text-ink-muted">Few cases per term in this issue area, so single-year shares swing widely. Read the trend, not individual years.</p>
      )}
      <MethodologyNote>
        <p>
          Each band is the number of justices who dissented: none (9–0), one (8–1), two (7–2), three (6–3), four (5–4, or a 4–4 tie). Bands count dissents, not the full tally, so in terms with fewer than nine justices (for example 2016, after Justice Scalia died) a 5–3 decision lands in the 6–3 band. Click a band name or legend entry to see just that band, in cases per term; the stacked bars above and the case list below then show only those cases.
        </p>
        <p>Cases are counted once, in the term they were decided (October to June).</p>
      </MethodologyNote>
      <TableView
        label="Table of cases by number of dissenting justices, per term"
        head={["Term", "Cases", ...BAND_SHORT]}
        rows={terms.map((t, i) => [t, sumBucket(cells[i]), ...cells[i]]).reverse()}
      />
    </ChartCard>
  );
}
