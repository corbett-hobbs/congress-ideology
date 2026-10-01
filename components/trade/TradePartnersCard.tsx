"use client";

import { memo, useMemo, useState } from "react";
import { ReversibleSortToggle } from "@/components/charts/SortToggle";
import { SwarmRows, type SwarmRowData } from "@/components/charts/SwarmRows";
import { fmtMoney } from "@/lib/trade-chart";
import { nextSort, type PartnerSort, type SortState } from "@/lib/trade-derive";
import { partnerChartRows, partnerMeta, partnerScale, type PartnerChartRow } from "@/lib/trade-partners";
import type { TradeYearPayload } from "@/lib/trade-types";
import { MONTH_NAMES } from "@/lib/indicator-time";
import { useMediaQuery } from "@/lib/use-media-query";

/** Rows shown on a phone before "Show all". */
const PHONE_ROWS = 6;

const SORTS = [
  { key: "balance", label: "Balance", hint: "Largest deficit first" },
  { key: "total", label: "Total trade", hint: "Largest total first" },
  { key: "alpha", label: "A–Z", hint: "Alphabetical" },
] as const;

const ROW_H = 26;
const MARGIN = { top: 28, right: 76, bottom: 8, left: 150 };

interface Tip {
  row: PartnerChartRow;
  year: number;
}

const pct = (r: number) => `${(r * 100).toFixed(r < 0.1 ? 1 : 0)}%`;

const DataTable = memo(function DataTable({ rows, year }: { rows: PartnerChartRow[]; year: number }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[0.75rem] text-ink-muted hover:text-ink">View as table</summary>
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
 * Chart 3: every partner for the slider's year, imports (filled) and exports
 * (hollow) with the signed balance at right. Sorting is reversible on every
 * button. Clicking a row picks that country in the filter bar.
 */
export function TradePartnersCard({
  payload,
  year,
  lastPeriod,
  country,
  onPickCountry,
  loading,
  error,
}: {
  /** The slider year's rows; while the next year loads, the previous one stays on screen. */
  payload: TradeYearPayload | null;
  year: number;
  lastPeriod: string;
  country: string | null;
  onPickCountry: (code: string | null) => void;
  loading: boolean;
  error: boolean;
}) {
  const [sort, setSort] = useState<SortState>({ key: "balance", reversed: false });
  const phone = useMediaQuery("(max-width: 767px)");
  const [expanded, setExpanded] = useState(false);
  const shown = payload?.year ?? year;
  const rows = useMemo(() => (payload ? partnerChartRows(payload.partners, sort) : []), [payload, sort]);
  const scale = useMemo(() => partnerScale(rows), [rows]);
  const collapsed = phone && !expanded && rows.length > PHONE_ROWS;
  const visibleRows = useMemo(() => (collapsed ? rows.slice(0, PHONE_ROWS) : rows), [collapsed, rows]);
  const swarm = useMemo<SwarmRowData<Tip>[]>(
    () =>
      visibleRows.map((r) => {
        const tooltip = { row: r, year: shown };
        return {
          id: r.code,
          label: r.name,
          labelHighlighted: r.code === country,
          selected: r.code === country,
          onRowClick: () => onPickCountry(r.code === country ? null : r.code),
          meta: partnerMeta(r),
          points: [
            { id: "exports", value: r.exports, colorClass: "fill-ink", emphasized: true, hollow: true, tooltip },
            { id: "imports", value: r.imports, colorClass: "fill-ink", emphasized: true, tooltip },
          ],
        };
      }),
    [visibleRows, shown, country, onPickCountry],
  );
  const partial = shown === Number(lastPeriod.slice(0, 4)) && lastPeriod.slice(5) !== "12";
  const through = MONTH_NAMES[Number(lastPeriod.slice(5)) - 1];

  return (
    <section className="min-w-0 rounded-[10px] border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 font-serif text-[1.6rem] font-medium leading-tight">Who the U.S. trades with, {shown}{partial ? " so far" : ""}</h2>
          <p className="m-0 mt-2 text-[0.875rem] leading-[1.5] text-ink-muted">
            Imports and exports of goods for the year on the slider. The line between them is the balance.
            {partial ? ` ${shown} covers January to ${through}.` : ""}
          </p>
        </div>
        <ReversibleSortToggle
          options={SORTS}
          active={sort.key}
          reversed={sort.reversed}
          onSelect={(k: PartnerSort) => setSort((s) => nextSort(s, k))}
          ariaLabel="Sort partners"
        />
      </div>

      {error && rows.length > 0 && shown !== year && (
        <p role="status" className="m-0 mt-2 text-[0.8rem] text-ink-muted">{`Couldn’t load ${year}; still showing ${shown}. Move the slider to retry.`}</p>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.75rem] text-ink-muted">
        <span className="inline-flex items-center gap-1.5"><svg width="12" height="12" aria-hidden><circle cx="6" cy="6" r="5" fill="var(--ink)" /></svg>Imports</span>
        <span className="inline-flex items-center gap-1.5"><svg width="12" height="12" aria-hidden><circle cx="6" cy="6" r="4.5" fill="var(--surface)" stroke="var(--ink)" strokeWidth="2" /></svg>Exports</span>
        <span className="ml-auto">Right: balance. Scale: symmetric log.</span>
      </div>

      <div className={`mt-2 md:max-h-[36rem] md:overflow-y-auto ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
        {visibleRows.length > 0 ? (
          <SwarmRows<Tip>
            rows={swarm}
            ariaLabel={`U.S. goods imports and exports by partner, ${shown}, ${rows.length} partners${collapsed ? `, the first ${PHONE_ROWS} shown` : ""}, with the balance for each`}
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
            {error ? `Couldn’t load ${year}. Move the slider to retry.` : `Loading ${year}…`}
          </div>
        )}
      </div>

      {phone && rows.length > PHONE_ROWS && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="mt-2 min-h-11 w-full rounded-md border border-line-strong bg-surface-raised px-3 text-[0.85rem] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {expanded ? "Show fewer countries" : `Show all ${rows.length} countries`}
        </button>
      )}

      <p className="m-0 mt-2 text-[0.75rem] leading-[1.45] text-ink-muted">
        Census Bureau goods trade, Census basis. Sorted by {sort.key === "balance" ? "balance: the largest deficits first, then surpluses" : sort.key === "total" ? "total trade, largest first" : "name"}
        {sort.reversed ? ", reversed" : ""}; click the active sort again to reverse it. Click a row to pick that country above. The scale is symmetric log, so small partners stay visible next to China; distances are not proportional. Before 1992 Census lists fewer partners, so rows can fall a little short of the total.
      </p>
      {rows.length > 0 && <DataTable rows={rows} year={shown} />}
    </section>
  );
}
