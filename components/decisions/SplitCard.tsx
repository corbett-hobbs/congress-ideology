"use client";

import { useMemo, useState } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { LegendToggle } from "@/components/charts/LegendToggle";
import { LEGEND_ITEM, LEGEND_ROW } from "@/components/charts/legend";
import { PillGroup } from "@/components/charts/PillGroup";
import { StackedBars, type StackColumn, type StackSeries } from "@/components/charts/StackedBars";
import { MethodologyNote } from "@/components/MethodologyNote";
import { areaFilterLabel, bandShare, chiefSegments, fmtInt, fmtPct, isSmallSample, sumBucket, windowCells, windowSum } from "@/lib/decisions-derive";
import { BAND_COLORS, BAND_LONG, BAND_SHORT, type Bucket, type SplitMode } from "@/lib/decisions-types";
import { useDecisionsActions, useDecisionsValues } from "./DecisionsState";
import { Swatch, TableView, TooltipCard, chiefLine } from "./shared";

interface Col extends StackColumn {
  term: number;
  bucket: Bucket;
}

const SERIES: StackSeries[] = [0, 1, 2, 3, 4].map((k) => ({ id: String(k), label: BAND_SHORT[k], fill: BAND_COLORS[k] }));

/**
 * Card 2: how divided the Court is, as stacked bars: five dissent bands per term (unanimous at the bottom, 5–4 on top), as
 * a share of the term's cases or a count, in one sequential gradient (darker, or brighter in dark mode, = more divided).
 * Legend entries isolate a band (rule 12c): the pick draws that band alone from zero and switches to the count view; going
 * back to Share clears it. The picked band is the page's vote filter, so it also narrows card 1 and the case list. A thin
 * selection (a small issue area, the landmark filter) gets a note, and the chart is never hidden.
 */
export function SplitCard() {
  const { data, range, area, band, hover, pin } = useDecisionsValues();
  const { moveHover, leaveHover, togglePin, clearPin, setBand } = useDecisionsActions();
  const [mode, setModeRaw] = useState<SplitMode>("share");
  const setMode = (m: SplitMode) => {
    setModeRaw(m);
    if (m === "share") setBand(null);
  };
  const pick = (k: number) => {
    setBand(band === k ? null : k);
    setModeRaw("count");
  };

  const { terms, cells } = useMemo(() => windowCells(data, area, range), [data, area, range]);
  const cols = useMemo<Col[]>(
    () => terms.map((t, i) => ({ key: String(t), label: String(t), total: sumBucket(cells[i]), values: Object.fromEntries(cells[i].map((v, k) => [String(k), v])), term: t, bucket: cells[i] })),
    [terms, cells],
  );
  const segs = useMemo(() => chiefSegments(data, terms), [data, terms]);
  const w = windowSum(data, area, range);
  const total = sumBucket(w);
  const lo = range[0];
  const hi = range[1];
  const who = areaFilterLabel(data, area);
  const lede = total
    ? `${who}, ${lo === hi ? lo : `${lo}–${hi}`}: ${fmtPct(bandShare(w, 0))} of ${fmtInt(total)} cases were unanimous, ${fmtPct(bandShare(w, 4))} split 5–4.`
    : "No cases in this selection.";

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
      <StackedBars
        columns={cols}
        series={SERIES}
        mode={mode}
        highlight={band === null ? null : String(band)}
        selectedKey={pin === null ? null : String(pin)}
        onSelect={(k) => (k === null ? clearPin() : togglePin(Number(k)))}
        selectedStyle="line"
        terms={segs}
        activeKey={hover === null ? null : String(hover)}
        onActive={(k) => (k === null ? leaveHover() : moveHover(Number(k)))}
        yearTicks
        unit="cases"
        ariaLabel="Stacked bar chart of Supreme Court cases by number of dissenting justices, one bar per term"
        renderTooltip={(c) => (
          <TooltipCard title={`${c.term} term`} sub={chiefLine(data, c.term)}>
            <div>{fmtInt(c.total)} cases</div>
            {[4, 3, 2, 1, 0].map((k) => (
              <div key={k}>
                <Swatch color={BAND_COLORS[k]} /> {BAND_SHORT[k]}: {c.bucket[k]}
                {c.total ? ` (${fmtPct(bandShare(c.bucket, k))})` : ""}
              </div>
            ))}
          </TooltipCard>
        )}
      />
      <div className={`mt-2 ${LEGEND_ROW}`}>
        {[0, 1, 2, 3, 4].map((k) => (
          <LegendToggle key={k} active={band === k} dimmed={band !== null && band !== k} onClick={() => pick(k)}>
            <span className={LEGEND_ITEM}>
              <Swatch color={BAND_COLORS[k]} />
              {BAND_LONG[k]}
            </span>
          </LegendToggle>
        ))}
      </div>
      {isSmallSample(data, area, range) && (
        <p className="m-0 mt-2 text-[0.78rem] leading-[1.45] text-ink-muted">Few cases per term in this selection, so single-year shares swing widely. Read the trend, not individual years.</p>
      )}
      <MethodologyNote>
        <p>
          Each band is the number of justices who dissented: none (9–0), one (8–1), two (7–2), three (6–3), four (5–4, or a 4–4 tie). Bands count dissents, not the full tally, so in terms with fewer than nine justices (for example 2016, after Justice Scalia died) a 5–3 decision lands in the 6–3 band. Click a legend entry to see just that band, in cases per term; the stacked bars above and the case list below then show only those cases.
        </p>
        <p>Cases are counted once, in the term they were decided (October to June). Values print inside a bar where it is tall and wide enough.</p>
      </MethodologyNote>
      <TableView label="Table of cases by number of dissenting justices, per term" head={["Term", "Cases", ...BAND_SHORT]} rows={terms.map((t, i) => [t, sumBucket(cells[i]), ...cells[i]]).reverse()} />
    </ChartCard>
  );
}
