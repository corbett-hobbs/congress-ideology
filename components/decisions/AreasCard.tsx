"use client";

import { useMemo, useState } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { LEGEND_ITEM, LEGEND_ROW } from "@/components/charts/legend";
import { ReversibleSortToggle } from "@/components/charts/SortToggle";
import { StackedRows, type StackedRowData } from "@/components/charts/StackedRows";
import { MethodologyNote } from "@/components/MethodologyNote";
import { inAreaFilter, areaRows, bandShare, fmtInt, fmtPct, nextAreaSort } from "@/lib/decisions-derive";
import { ALL_AREAS, BAND_COLORS, BAND_LONG, BAND_SHORT, type AreaSort, type AreaSortKey } from "@/lib/decisions-types";
import { useDecisionsActions, useDecisionsValues } from "./DecisionsState";
import { DecadeHeatmap } from "./DecadeHeatmap";
import { Swatch, TableView } from "./shared";

/** One toggle for the whole card: what the heatmap shades and how both charts order their rows. */
const SORTS: { key: AreaSortKey; label: string; hint: string }[] = [
  { key: "n", label: "Cases", hint: "Case counts in the heatmap; most cases first" },
  { key: "f", label: "5–4", hint: "Share that split 5–4 in the heatmap; largest first" },
  { key: "u", label: "Unanimous", hint: "Share that were unanimous in the heatmap; largest first" },
];

/**
 * Card 3: one row per issue area, a 100% bar of the five dissent bands over the years in the window, case count at right
 * (a comparison chart, so a selection dims the other rows instead of removing them, rule 4). "All issue areas" is pinned
 * first. Clicking a row sets the same Issue area as the pinned bar's dropdown; clicking it again, or All, clears it.
 */
export function AreasCard() {
  const { data, range, area } = useDecisionsValues();
  const { setArea } = useDecisionsActions();
  const [sort, setSort] = useState<AreaSort>({ key: "n", reversed: false });
  const rows = useMemo(() => areaRows(data, range, sort), [data, range, sort]);
  const stacked = useMemo<StackedRowData[]>(
    () =>
      rows.map((r) => ({
        id: r.id,
        label: r.label,
        total: fmtInt(r.total),
        selected: area === r.index,
        dimmed: area !== ALL_AREAS && r.index >= 0 && !inAreaFilter(data, area, r.index),
        segments: [0, 1, 2, 3, 4].map((k) => ({
          value: bandShare(r.bucket, k),
          color: BAND_COLORS[k],
          title: `${r.label}: ${BAND_LONG[k]}, ${fmtPct(bandShare(r.bucket, k))} (${fmtInt(r.bucket[k])} of ${fmtInt(r.total)})`,
        })),
      })),
    [rows, area, data],
  );
  const click = (id: string) => {
    const row = rows.find((r) => r.id === id);
    setArea(!row || row.index < 0 || row.index === area ? -1 : row.index);
  };
  const lo = range[0];
  const hi = range[1];

  return (
    <ChartCard
      tight
      title="Which kinds of cases split the Court?"
      lede="Left: how many cases, how many split 5–4 or how many were unanimous in each decade, by issue area. Right: how many justices dissented, in the years shown. The toggle picks the measure for both and orders the rows; click it again to reverse. Click an issue area in either to filter the charts and the case list."
      action={
        <ReversibleSortToggle
          ariaLabel="Sort issue areas"
          options={SORTS}
          active={sort.key}
          reversed={sort.reversed}
          onSelect={(k) => setSort((cur) => nextAreaSort(cur, k))}
        />
      }
    >
      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <DecadeHeatmap rows={rows} measure={sort.key} />
        <div className="min-w-0">
          <p className="mb-2 mt-0 text-[0.78rem] text-ink-muted">{`Years shown: ${lo === hi ? lo : `${lo}\u2013${hi}`}`}</p>
          <div className={`mb-2 ${LEGEND_ROW}`}>
            {[0, 1, 2, 3, 4].map((k) => (
              <span key={k} className={LEGEND_ITEM}>
                <Swatch color={BAND_COLORS[k]} />
                {BAND_LONG[k]}
              </span>
            ))}
          </div>
          {/* Phones scroll the rows inside a fixed-height box (rule 11a); from `lg` all of them show (15 rows is not a long list). */}
          <div className="relative max-h-[28rem] overflow-y-auto overscroll-contain touch-scroll lg:max-h-none lg:overflow-visible" tabIndex={0} aria-label="Issue areas, one row each">
            <StackedRows rows={stacked} scaleMax={1} onRowClick={click} ariaLabel="Issue areas by number of dissenting justices" emptyText="No cases in these years." />
          </div>
        </div>
      </div>
      <MethodologyNote>
        <p>
          Issue areas are the Supreme Court Database’s own 14 categories, a rough guide; the {fmtInt(data.unclassified)} cases with none count only in “All issue areas”. Shares for small areas are rough, since a few dozen cases can swing several points. The heatmap counts cases (all, 5–4 or unanimous, as the toggle says) on one scale, except “All issue areas”, which has its own; the first and last decades are partial (1946–49 and 2020–25).
        </p>
      </MethodologyNote>
      <TableView
        label="Table of issue areas by number of dissenting justices"
        head={["Issue area", "Cases", ...BAND_SHORT]}
        rows={rows.map((r) => [r.label, r.total, ...r.bucket])}
      />
    </ChartCard>
  );
}
