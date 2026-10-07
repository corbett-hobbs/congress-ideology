"use client";

import { useMemo, useState } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { LEGEND_ITEM, LEGEND_ROW } from "@/components/charts/legend";
import { ReversibleSortToggle } from "@/components/charts/SortToggle";
import { StackedRows, type StackedRowData } from "@/components/charts/StackedRows";
import { MethodologyNote } from "@/components/MethodologyNote";
import { inAreaFilter, areaRows, bandShare, fmtInt, fmtPct, nextAreaSort, windowSum, sumBucket } from "@/lib/decisions-derive";
import { ALL_AREAS, BAND_COLORS, BAND_LONG, BAND_SHORT, type AreaSort, type AreaSortKey } from "@/lib/decisions-types";
import { useDecisionsActions, useDecisionsValues } from "./DecisionsState";
import { Swatch, TableView } from "./shared";

const SORTS: { key: AreaSortKey; label: string; hint: string }[] = [
  { key: "n", label: "Cases", hint: "Most cases first" },
  { key: "u", label: "Unanimous", hint: "Largest unanimous share first" },
  { key: "f", label: "5–4", hint: "Largest 5–4 share first" },
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
  // The three biggest areas over every term ("Criminal procedure", "Economic activity" and "Judicial power" hold more than half the docket): computed, not hard-coded.
  const topThree = useMemo(() => {
    const full: [number, number] = [data.terms[0], data.terms[data.terms.length - 1]];
    const ranked = data.areas.map((a, i) => ({ label: a.label, n: sumBucket(windowSum(data, i, full)) })).sort((a, b) => b.n - a.n).slice(0, 3);
    return { labels: `“${ranked[0].label}”, “${ranked[1].label}” and “${ranked[2].label}”`, share: ranked.reduce((s, t) => s + t.n, 0) / data.caseCount };
  }, [data]);
  const lo = range[0];
  const hi = range[1];

  return (
    <ChartCard
      title="Which kinds of cases split the Court?"
      lede={`Share of cases in ${lo === hi ? `the ${lo} term` : `${lo}–${hi}`}, by how many justices dissented. Click an issue area to filter the charts above.`}
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
      <div className={`mb-2 ${LEGEND_ROW}`}>
        {[0, 1, 2, 3, 4].map((k) => (
          <span key={k} className={LEGEND_ITEM}>
            <Swatch color={BAND_COLORS[k]} />
            {BAND_LONG[k]}
          </span>
        ))}
      </div>
      <div className="relative max-h-[28rem] overflow-y-auto overscroll-contain touch-scroll" tabIndex={0} aria-label="Issue areas, one row each">
        <StackedRows rows={stacked} scaleMax={1} onRowClick={click} ariaLabel="Issue areas by number of dissenting justices" emptyText="No cases in these years." />
      </div>
      <MethodologyNote>
        <p>
          Issue areas are the Supreme Court Database’s own 14 categories, which its authors treat as a rough guide. {topThree.labels} together hold about {fmtPct(topThree.share)} of all cases. Cases the database leaves without an issue area ({fmtInt(data.unclassified)}) count in “All issue areas” but appear in no row. Areas with no cases in the years shown are left out.
        </p>
        <p>Shares for small areas are rough: an area with a few dozen cases can swing several points on one decision.</p>
      </MethodologyNote>
      <TableView
        label="Table of issue areas by number of dissenting justices"
        head={["Issue area", "Cases", ...BAND_SHORT]}
        rows={rows.map((r) => [r.label, r.total, ...r.bucket])}
      />
    </ChartCard>
  );
}
