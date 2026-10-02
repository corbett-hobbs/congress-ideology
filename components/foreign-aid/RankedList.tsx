"use client";

import { useMemo } from "react";
import { StackedRows, type StackedRowData } from "@/components/charts/StackedRows";
import { SLOT_NAME, countryMilitary, formatAidMoney, rankCountries } from "@/lib/foreign-aid-derive";
import { useAidState } from "./ForeignAidState";
import { SectorLegend, slotColor } from "./shared";

/**
 * The ranked recipient list inside the combined "Where it goes" card: every country for the selected
 * year, each with a sector-split bar on one shared scale. `mode` is the card's toggle: Dollars ranks
 * by dollars (largest first), Military share by the military slice of each country's total (countries
 * with none last); `reversed` flips either, for this list only, and the map beside it is unaffected.
 * The selected country is highlighted and the rest dimmed, never reduced to one row; the list scrolls
 * inside its box and never auto-scrolls.
 */
export function RankedList({ mode, reversed }: { mode: "dollars" | "share"; reversed: boolean }) {
  const { data, year, sector, country, toggleCountry } = useAidState();
  const yi = year - data.payload.years[0];
  const ranked = useMemo(() => rankCountries(data, year, sector), [data, year, sector]);
  const names = data.payload.countries;

  const list = useMemo(() => {
    const items = ranked.map((r) => ({ r, share: r.value > 0 ? countryMilitary(data, r.ci, yi, sector) / r.value : 0 }));
    // Largest first; ranked already comes back dollars-descending, so Dollars only needs `reversed`.
    if (mode === "share") items.sort((a, b) => b.share - a.share || b.r.value - a.r.value);
    if (reversed) items.reverse();
    return items;
  }, [ranked, mode, reversed, data, yi, sector]);

  const scaleMax = Math.max(1, ...ranked.map((r) => Math.max(0, r.value)));
  const rows: StackedRowData[] = list.map(({ r, share }, i) => ({
    id: String(r.ci),
    rank: mode === "share" ? i + 1 : r.rank,
    label: names[r.ci].name,
    segments: r.slots.map((v, k) => ({ value: v, color: slotColor(k), title: `${SLOT_NAME[k]}: ${formatAidMoney(v)}` })),
    total: mode === "share" ? (share > 0 ? `${Math.round(share * 100)}%` : "–") : formatAidMoney(r.value),
    selected: r.ci === country,
    dimmed: country >= 0 && r.ci !== country,
  }));

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="relative h-[28rem] md:h-auto md:min-h-[7.5rem] md:flex-1">
        <div className="absolute inset-0 overflow-auto pr-0.5">
          <StackedRows rows={rows} scaleMax={scaleMax} onRowClick={(id) => toggleCountry(Number(id))} ariaLabel="Recipient countries, ranked" emptyText="No disbursements recorded." />
        </div>
      </div>
      <SectorLegend />
    </div>
  );
}
