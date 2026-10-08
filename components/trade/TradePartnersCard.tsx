"use client";

import { TABLE_TOGGLE } from "@/components/charts/table-toggle";
import { memo, useMemo, useState } from "react";
import { ReversibleSortToggle } from "@/components/charts/SortToggle";
import { SwarmRows, type SwarmRowData } from "@/components/charts/SwarmRows";
import { fmtMoney } from "@/lib/trade-chart";
import { nextSort, type PartnerSort, type SortState } from "@/lib/trade-derive";
import { partnerChartRows, partnerMeta, partnerScale, type PartnerChartRow } from "@/lib/trade-partners";
import type { TradeYearPayload } from "@/lib/trade-types";
import { MONTH_NAMES } from "@/lib/indicator-time";
import { MethodologyNote } from "@/components/MethodologyNote";
import { ChartCard } from "@/components/charts/ChartCard";
import { YearPicker } from "@/components/charts/YearPicker";
import { TradeMap } from "./TradeMap";
import { buildMapModel } from "@/lib/trade-map";
import type { TradePageData } from "@/lib/trade-data";


const SORTS = [
  { key: "total", label: "Total trade", hint: "Largest total first" },
  { key: "balance", label: "Balance", hint: "Largest deficit first" },
] as const;

const ROW_H = 26;
const MARGIN = { top: 28, right: 62, bottom: 8, left: 108 };

interface Tip {
  row: PartnerChartRow;
  year: number;
}

const pct = (r: number) => `${(r * 100).toFixed(r < 0.1 ? 1 : 0)}%`;

const DataTable = memo(function DataTable({ rows, year }: { rows: PartnerChartRow[]; year: number }) {
  return (
    <details className="mt-3">
      <summary className={TABLE_TOGGLE}>View as table</summary>
      <p className="m-0 mt-1.5 text-[0.75rem] text-ink-muted">Partner, imports, exports, balance and calculated duty rate for {year}, for screen readers and copying.</p>
      <div className="mt-2 max-h-72 overflow-auto">
        <table className="w-full border-collapse text-left text-[0.75rem] tabular-nums">
          <caption className="sr-only">{`U.S. goods trade with each partner, ${year}`}</caption>
          <thead className="sticky top-0 bg-surface-raised">
            <tr className="font-mono text-[0.65rem] uppercase tracking-[0.05em] text-ink-muted">
              <th scope="col" className="px-2 py-1.5">Partner</th>
              <th scope="col" className="px-2 py-1.5">Imports</th>
              <th scope="col" className="px-2 py-1.5">Exports</th>
              <th scope="col" className="px-2 py-1.5">Balance</th>
              <th scope="col" className="px-2 py-1.5">Duty rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className="border-t border-line">
                <th scope="row" className="px-2 py-1 font-normal">{r.name}</th>
                <td className="px-2 py-1">{fmtMoney(r.imports)}</td>
                <td className="px-2 py-1">{fmtMoney(r.exports)}</td>
                <td className="px-2 py-1">{fmtMoney(r.balance, { signed: true })}</td>
                <td className="px-2 py-1">{r.rate === null ? "—" : pct(r.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
});

/**
 * Chart 3: every partner for the selected year, imports (filled) and exports
 * (hollow) with the signed balance at right. Sorting is reversible on every
 * button. Clicking a row picks that country in the filter bar.
 */
export function TradePartnersCard({
  map,
  payload,
  year,
  onYear,
  firstYear,
  lastYear,
  lastPeriod,
  country,
  onPickCountry,
  loading,
  error,
}: {
  map: TradePageData["worldMap"];
  /** The selected year's rows; while the next year loads, the previous one stays on screen. */
  payload: TradeYearPayload | null;
  year: number;
  onYear: (y: number) => void;
  firstYear: number;
  lastYear: number;
  lastPeriod: string;
  country: string | null;
  onPickCountry: (code: string | null) => void;
  loading: boolean;
  error: boolean;
}) {
  const [sort, setSort] = useState<SortState>({ key: "total", reversed: false });
  const shown = payload?.year ?? year;
  const rows = useMemo(() => (payload ? partnerChartRows(payload.partners, sort) : []), [payload, sort]);
  const scale = useMemo(() => partnerScale(rows), [rows]);
  const outlineKeys = useMemo(() => new Set(map.features.map((f) => f.key)), [map]);
  const model = useMemo(() => buildMapModel(payload?.partners ?? [], outlineKeys), [payload, outlineKeys]);
  const measure = sort.key === "balance" ? "balance" : "total";
  const swarm = useMemo<SwarmRowData<Tip>[]>(
    () =>
      rows.map((r) => {
        const tooltip = { row: r, year: shown };
        return {
          id: r.code,
          label: r.name,
          labelHighlighted: r.code === country,
          selected: r.code === country,
          onRowClick: () => onPickCountry(r.code === country ? null : r.code),
          meta: partnerMeta(r, sort.key),
          points: [
            { id: "exports", value: r.exports, colorClass: "fill-ink", emphasized: true, hollow: true, tooltip },
            { id: "imports", value: r.imports, colorClass: "fill-ink", emphasized: true, tooltip },
          ],
        };
      }),
    [rows, shown, country, onPickCountry, sort.key],
  );
  const partial = shown === Number(lastPeriod.slice(0, 4)) && lastPeriod.slice(5) !== "12";
  const through = MONTH_NAMES[Number(lastPeriod.slice(5)) - 1];

  return (
    <ChartCard
      className="h-full min-w-0"
      title={`Who the U.S. trades with, ${shown}${partial ? " so far" : ""}`}
      lede={<>Imports and exports of goods for the selected year. The line between them is the balance. The map shades each partner by the same measure.{partial ? ` ${shown} covers January to ${through}.` : ""}</>}
      action={
        <div className="flex flex-nowrap items-center gap-2">
          <YearPicker value={year} range={[firstYear, lastYear]} onChange={onYear} format={String} ariaLabel="Year shown on the map and list" />
          <ReversibleSortToggle
            options={SORTS}
            active={sort.key}
            reversed={sort.reversed}
            onSelect={(k: PartnerSort) => setSort((s) => nextSort(s, k))}
            ariaLabel="Sort partners"
          />
        </div>
      }
    >
      {error && rows.length > 0 && shown !== year && (
        <p role="status" className="m-0 mt-2 text-[0.8rem] text-ink-muted">{`Couldn’t load ${year}; still showing ${shown}. Pick the year again to retry.`}</p>
      )}
      <div className="mt-3 grid min-w-0 flex-1 grid-cols-1 gap-x-4 gap-y-4 lg:grid-cols-[2fr_1fr]">
      <TradeMap map={map} model={model} measure={measure} shown={shown} country={country} onPickCountry={onPickCountry} loading={loading} />
      <div className="flex min-w-0 flex-col">
      {/* The list fills whatever height the row gives the card (the scatter card beside it sets that on desktop); on narrow screens it is a fixed 26rem. Absolute inner box so the long list never stretches the card. */}
      <div className={`relative mt-2 min-h-[26rem] flex-1 ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
        <div
          className="absolute inset-0 overflow-y-auto overscroll-contain touch-scroll"
          tabIndex={0}
          aria-label="Partner list, scrollable"
        >
            {rows.length > 0 ? (
              <SwarmRows<Tip>
                rows={swarm}
                ariaLabel={`U.S. goods imports and exports by partner, ${shown}, ${rows.length} partners, with the ${sort.key === "total" ? "total trade" : "balance"} for each`}
                margin={MARGIN}
                rowHeight={ROW_H}
                domain={[0, scale.max]}
                ticks={scale.ticks}
                formatTick={scale.format}
                makeScale={scale.make}
                renderTooltip={({ row, year: y }) => (
                  <div className="flex min-w-[9rem] flex-col gap-0.5 text-[0.78rem]">
                    <div className="font-medium">{row.name}, {y}</div>
                    <div>Imports <span className="font-mono">{fmtMoney(row.imports)}</span></div>
                    <div>Exports <span className="font-mono">{fmtMoney(row.exports)}</span></div>
                    <div>Balance <span className="font-mono">{fmtMoney(row.balance, { signed: true })}</span></div>
                    {row.rate !== null && <div className="opacity-75">Calculated duties {pct(row.rate)} of imports</div>}
                  </div>
                )}
              />
            ) : (
              <div role="status" className="flex h-[200px] items-center justify-center rounded-md border border-dashed border-line text-[0.85rem] text-ink-muted">
                {error ? `Couldn’t load ${year}. Pick the year again to retry.` : `Loading ${year}…`}
              </div>
            )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.75rem] text-ink-muted">
        <span className="inline-flex items-center gap-1.5"><svg width="12" height="12" aria-hidden><circle cx="6" cy="6" r="5" fill="var(--ink)" /></svg>Imports</span>
        <span className="inline-flex items-center gap-1.5"><svg width="12" height="12" aria-hidden><circle cx="6" cy="6" r="4.5" fill="var(--surface)" stroke="var(--ink)" strokeWidth="2" /></svg>Exports</span>
        <span className="ml-auto">Scale: symmetric log.</span>
      </div>
      </div>
      </div>

      <MethodologyNote>
        <p>
          Census Bureau goods trade, Census basis. The map and the list share the year and the Total trade / Balance choice; the map is shaded on fixed bins so years compare. The list uses a symmetric log scale so small partners stay visible next to China, so distances are not proportional. Before 1992 Census lists fewer partners, so rows can fall a little short of the total.{model.undrawn.length > 0 ? ` ${model.undrawn.length} small partners with no outline (${fmtMoney(model.undrawn.reduce((a, r) => a + r.exports + r.imports, 0))} of ${fmtMoney(model.totals.total)}) are in the list and table but not on the map.` : ""}
        </p>
      </MethodologyNote>
      {rows.length > 0 && <DataTable rows={rows} year={shown} />}
    </ChartCard>
  );
}
