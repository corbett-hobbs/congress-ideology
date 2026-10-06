"use client";

import { StackedRows, type StackedRowData } from "@/components/charts/StackedRows";
import { BRANCH_NAMES, formatCount, type PeriodView } from "@/lib/troops-derive";
import { useTroopsState } from "./TroopsState";
import { BranchLegend, branchColor } from "./shared";

/**
 * The ranked host list inside the map card: every host with troops in the selected quarter, each with a bar on one
 * shared scale (split by branch for All branches, one colour for a single branch). Hosts blank in the source are
 * listed at the bottom as "not reported". The selected country is highlighted and the rest dimmed, never reduced to
 * one row; the list scrolls inside its box and never auto-scrolls.
 */
export function RankedList({ view }: { view: PeriodView }) {
  const { data, country, toggleCountry, measure } = useTroopsState();
  const places = data.payload.places;
  const scaleMax = Math.max(1, ...view.ranked.map((r) => r.value));
  const rows: StackedRowData[] = [
    ...view.ranked.map((r) => ({
      id: String(r.place),
      rank: r.rank,
      label: places[r.place].name,
      segments:
        measure === 0
          ? r.branches.map((v, k) => ({ value: v, color: branchColor(k), title: `${BRANCH_NAMES[k]}: ${formatCount(v)}` }))
          : [{ value: r.value, color: branchColor(measure - 1) }],
      total: formatCount(r.value),
      selected: r.place === country,
      dimmed: country >= 0 && r.place !== country,
    })),
    ...view.suppressed.map((p) => ({ id: String(p), label: places[p].name, segments: [], total: "n/r", selected: p === country, dimmed: country >= 0 && p !== country })),
  ];
  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="relative h-[28rem] md:h-auto md:min-h-[7.5rem] md:flex-1">
        <div className="absolute inset-0 overflow-auto pr-0.5" tabIndex={0} role="region" aria-label="Host countries, ranked">
          <StackedRows
            rows={rows}
            scaleMax={scaleMax}
            onRowClick={(id) => toggleCountry(Number(id))}
            ariaLabel="Host countries, ranked"
            emptyText={view.unavailable ? "The Army did not report." : "No troops recorded."}
          />
        </div>
      </div>
      {measure === 0 && !view.unavailable ? <BranchLegend /> : null}
    </div>
  );
}
