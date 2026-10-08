"use client";

import { useState } from "react";
import { useDecisionsActions } from "./DecisionsState";
import { ChartCard } from "@/components/charts/ChartCard";
import { LegendToggle } from "@/components/charts/LegendToggle";
import { LEGEND_ITEM, LEGEND_ROW } from "@/components/charts/legend";
import { PillGroup } from "@/components/charts/PillGroup";
import { MethodologyNote } from "@/components/MethodologyNote";
import { areaFilterLabel, bandShare, binByDecade, fmtInt, fmtPct, isSmallSample, splitGrain, sumBucket, windowCells, windowSum } from "@/lib/decisions-derive";
import { BAND_COLORS, BAND_LONG, BAND_SHORT, type SplitMode } from "@/lib/decisions-types";
import type { GrainChoice } from "@/lib/decisions-derive";
import { SplitDecadeBars } from "./SplitDecadeBars";
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
  const [choice, setChoice] = useState<GrainChoice>("auto");
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
  // Per term while a term has enough cases to read a share from; per decade once the selection is thin (or when forced).
  const grain = splitGrain(data, area, range, choice);
  const small = isSmallSample(data, area, range);

  return (
    <ChartCard
      title="How divided is the Court?"
      lede={lede}
      action={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <PillGroup
            ariaLabel="Grouping"
            value={choice}
            onChange={setChoice}
            options={[
              { value: "auto", label: "Auto", title: "By term for a thick selection, by decade for a thin one" },
              { value: "term", label: "By term" },
              { value: "decade", label: "By decade" },
            ]}
          />
          <PillGroup
            ariaLabel="Split measure"
            value={mode}
            onChange={setMode}
            options={[
              { value: "share", label: "Share of cases" },
              { value: "count", label: "Number of cases" },
            ]}
          />
        </div>
      }
    >
      {grain === "decade" ? <SplitDecadeBars mode={mode} /> : <SplitChart mode={mode} onIso={pick} />}
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
      {grain === "decade" && choice === "auto" ? (
        <p className="m-0 mt-2 text-[0.78rem] leading-[1.45] text-ink-muted">Grouped by decade: this selection has few cases per term, so a single term&rsquo;s shares would swing widely. Choose “By term” to see every term.</p>
      ) : small && grain === "term" ? (
        <p className="m-0 mt-2 text-[0.78rem] leading-[1.45] text-ink-muted">Few cases per term in this selection, so single-year shares swing widely. Read the trend, not individual years.</p>
      ) : null}
      <MethodologyNote>
        <p>
          Each band is the number of justices who dissented: none (9–0), one (8–1), two (7–2), three (6–3), four (5–4, or a 4–4 tie). Bands count dissents, not the full tally, so in terms with fewer than nine justices (for example 2016, after Justice Scalia died) a 5–3 decision lands in the 6–3 band. Click a band name or legend entry to see just that band, in cases per term; the stacked bars above and the case list below then show only those cases.
        </p>
        <p>Cases are counted once, in the term they were decided (October to June). A selection with a median under 15 cases a term (the landmark filter, a small issue area) is grouped by decade automatically; the first and last decades are partial (1946–49 and 2020–25), and the Grouping toggle can force either view.</p>
      </MethodologyNote>
      <TableView
        label={`Table of cases by number of dissenting justices, per ${grain}`}
        head={[grain === "decade" ? "Decade" : "Term", "Cases", ...BAND_SHORT]}
        rows={grain === "decade" ? binByDecade(terms, cells).map((b) => [`${b.decade}s`, b.total, ...b.bucket]).reverse() : terms.map((t, i) => [t, sumBucket(cells[i]), ...cells[i]]).reverse()}
      />
    </ChartCard>
  );
}
