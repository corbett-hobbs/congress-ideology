"use client";

import { useMemo, useState } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { ReversibleSortToggle } from "@/components/charts/SortToggle";
import { StackedRows, type StackedRowData } from "@/components/charts/StackedRows";
import { SLOT_NAME, changeAvailable, formatAidMoney, rankCountries, type RankedCountry } from "@/lib/foreign-aid-derive";
import { useAidState } from "./ForeignAidState";
import { SectorLegend, slotColor } from "./shared";

type SortKey = "total" | "change" | "name";
/** A first click on a key sorts this way; clicking the active key again reverses it. */
const DEFAULT_DESC: Record<SortKey, boolean> = { total: true, change: true, name: false };

const deltaText = (d: number | null) => (d === null || Math.abs(d) < 5e5 ? "–" : `${d > 0 ? "▲" : "▼"} ${formatAidMoney(Math.abs(d))}`);

/**
 * "Who receives the most": every recipient country for the selected year, each with a sector-split bar
 * on a shared scale. The selected country is highlighted and the rest dimmed (never reduced to one row);
 * the list scrolls inside the card and never auto-scrolls, and a header chip carries the selection's rank
 * and amount instead. `style` lets the parent cap the card's height when the cards stack.
 */
export function RankedCard({ style }: { style?: React.CSSProperties }) {
  const { data, year, sector, country, toggleCountry, isPartial } = useAidState();
  const [sort, setSort] = useState<{ key: SortKey; reversed: boolean }>({ key: "total", reversed: false });
  const comparable = changeAvailable(data, year);
  const key: SortKey = sort.key === "change" && !comparable ? "total" : sort.key;
  const reversed = key === sort.key ? sort.reversed : false;

  const ranked = useMemo(() => rankCountries(data, year, sector), [data, year, sector]);
  const names = data.payload.countries;
  const list = useMemo(() => {
    const cmp: Record<SortKey, (a: RankedCountry, b: RankedCountry) => number> = {
      total: (a, b) => a.value - b.value,
      change: (a, b) => (a.delta ?? 0) - (b.delta ?? 0),
      name: (a, b) => names[a.ci].name.localeCompare(names[b.ci].name),
    };
    const out = [...ranked].sort(cmp[key]);
    // `desc` default keys sort largest-first; A–Z smallest-first. `reversed` flips either.
    const wantDesc = DEFAULT_DESC[key] !== reversed;
    return wantDesc ? out.reverse() : out;
  }, [ranked, key, reversed, names]);

  const scaleMax = Math.max(1, ...ranked.map((r) => Math.max(0, r.value)));
  const rows: StackedRowData[] = list.map((r) => ({
    id: String(r.ci),
    rank: r.rank,
    label: names[r.ci].name,
    segments: r.slots.map((v, k) => ({ value: v, color: slotColor(k), title: `${SLOT_NAME[k]}: ${formatAidMoney(v)}` })),
    total: formatAidMoney(r.value),
    delta: deltaText(r.delta),
    selected: r.ci === country,
    dimmed: country >= 0 && r.ci !== country,
  }));

  const sel = ranked.find((r) => r.ci === country);
  const prevFy = `FY${String(year - 1).slice(2)}`;
  const onSort = (k: SortKey) => setSort((s) => (s.key === k && key === k ? { key: k, reversed: !s.reversed } : { key: k, reversed: false }));

  return (
    <ChartCard
      title="Who receives the most"
      lede={`FY${year}${isPartial(year) ? " (partial)" : ""} · ${ranked.length} countries · bars show each country’s sector mix`}
      className="min-h-0"
      style={style}
      action={
        country >= 0 ? (
          <span className="rounded-md border border-line-strong bg-surface-raised px-2 py-0.5 text-[0.75rem] text-ink">
            {sel ? `${names[country].name} · No. ${sel.rank} · ${formatAidMoney(sel.value)}` : `${names[country].name} · no disbursements`}
          </span>
        ) : undefined
      }
    >
      <ReversibleSortToggle
        ariaLabel="Sort countries"
        active={key}
        reversed={reversed}
        onSelect={onSort}
        options={[
          { key: "total", label: "Total", hint: "Largest first" },
          {
            key: "change",
            label: `Change vs. ${prevFy}`,
            hint: !comparable ? (isPartial(year) ? `FY${year} is partial, so a change from the prior full year isn’t comparable.` : "No prior year in the data.") : "Biggest increase first",
            disabled: !comparable,
          },
          { key: "name", label: "A–Z", hint: "Alphabetical" },
        ]}
      />
      <div className="relative mt-2 min-h-[7.5rem] flex-1">
        <div className="absolute inset-0 overflow-auto pr-0.5">
          <StackedRows rows={rows} scaleMax={scaleMax} onRowClick={(id) => toggleCountry(Number(id))} ariaLabel="Recipient countries, ranked" emptyText="No disbursements recorded." />
        </div>
      </div>
      <SectorLegend />
    </ChartCard>
  );
}
