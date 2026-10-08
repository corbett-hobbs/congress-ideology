"use client";

import { useMemo } from "react";
import { StackedBars, type StackColumn, type StackSeries } from "@/components/charts/StackedBars";
import { bandShare, binByDecade, fmtInt, fmtPct, windowCells } from "@/lib/decisions-derive";
import { BAND_COLORS, BAND_SHORT, type Bucket, type SplitMode } from "@/lib/decisions-types";
import { useDecisionsValues } from "./DecisionsState";
import { Swatch, TooltipCard } from "./shared";

interface Col extends StackColumn {
  first: number;
  last: number;
  bucket: Bucket;
}

const SERIES: StackSeries[] = [0, 1, 2, 3, 4].map((k) => ({ id: String(k), label: BAND_SHORT[k], fill: BAND_COLORS[k] }));

/**
 * "How divided is the Court?" grouped by decade: one 100% (or count) stacked bar per decade, the case count under each
 * ("n=39"). Used when a selection is too thin for per-term shares (the landmark filter, a small issue area): a term with
 * four cases says nothing, a decade with forty does. The first and last decades are partial and say so in the tooltip.
 * The picked band (the page's vote filter) isolates in the same way as the area chart.
 */
export function SplitDecadeBars({ mode }: { mode: SplitMode }) {
  const { data, range, area, band } = useDecisionsValues();
  const cols = useMemo<Col[]>(() => {
    const { terms, cells } = windowCells(data, area, range);
    return binByDecade(terms, cells).map((b) => ({
      key: String(b.decade),
      label: `${b.decade}s`,
      sublabel: `n=${fmtInt(b.total)}`,
      total: b.total,
      values: Object.fromEntries(b.bucket.map((v, k) => [String(k), v])),
      first: b.first,
      last: b.last,
      bucket: b.bucket,
    }));
  }, [data, area, range]);
  return (
    <StackedBars
      columns={cols}
      series={SERIES}
      mode={mode}
      highlight={band === null ? null : String(band)}
      selectedKey={null}
      onSelect={() => {}}
      unit="cases"
      marginTop={20}
      ariaLabel="Stacked bar chart of Supreme Court cases by number of dissenting justices, one bar per decade"
      renderTooltip={(c) => (
        <TooltipCard title={`${c.label}`} sub={c.first === c.last ? `${c.first} term` : `${c.first}–${c.last} terms (${c.last - c.first + 1})`}>
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
  );
}
