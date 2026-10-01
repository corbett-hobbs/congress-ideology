"use client";

import { memo, useMemo, useState } from "react";
import { scaleLinear } from "d3-scale";
import { ReversibleSortToggle } from "@/components/charts/SortToggle";
import { SwarmRows, type SwarmRowData } from "@/components/charts/SwarmRows";
import { MONTH_ABBR } from "@/lib/indicator-time";
import { fmtDollars } from "@/lib/trade-chart";
import { fmtPp } from "@/lib/trade-scatter";
import { MIN_WINDOW_IMPORTS, rateAxis, sortBeforeAfter, type BeforeAfterRow, type BeforeAfterWindows, type ChangeSort, type ChangeSortState } from "@/lib/trade-before-after";
import type { BeforeAfterData } from "@/lib/trade-data";
import { useMediaQuery } from "@/lib/use-media-query";
import { AUTHORITY_LABEL } from "./TradeTariffChart";

const SORTS = [
  { key: "change", label: "Biggest change", hint: "Largest move first, up or down" },
  { key: "alpha", label: "A–Z", hint: "Alphabetical" },
] as const;
const ROW_H = 26;
const MARGIN = { top: 28, right: 76, bottom: 8, left: 150 };
const PHONE_ROWS = 6;
const KIND_VERB: Record<string, string> = { terminated: "ended", imposed: "began", increased: "rose", reduced: "fell", paused: "paused", struck_down: "were struck down", replaced: "were replaced" };

const monthYear = (p: string) => `${MONTH_ABBR[Number(p.slice(5)) - 1]} ${p.slice(0, 4)}`;
const windowText = (w: { from: string; to: string }) => (w.from.slice(0, 4) === w.to.slice(0, 4) ? `${MONTH_ABBR[Number(w.from.slice(5)) - 1]}–${monthYear(w.to)}` : `${monthYear(w.from)}–${monthYear(w.to)}`);
const dateText = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTH_ABBR[m - 1]} ${d}, ${y}`;
};
const pct = (r: number | null) => (r === null ? "—" : `${(r * 100).toFixed(1)}%`);

interface Tip {
  row: BeforeAfterRow;
}

const DataTable = memo(function DataTable({ rows, w }: { rows: BeforeAfterRow[]; w: BeforeAfterWindows }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[0.75rem] text-ink-muted hover:text-ink">View as table</summary>
      <p className="m-0 mt-1.5 text-[0.75rem] text-ink-muted">Country, average duty rate before and after, the change, and months covered, in a table. Smaller partners and countries missing months are listed but not drawn.</p>
      <div className="mt-2 max-h-72 overflow-auto">
        <table className="w-full border-collapse text-left text-[0.75rem] tabular-nums">
          <caption className="sr-only">{`Average calculated duty rate by country, ${windowText(w.before)} and ${w.after ? windowText(w.after) : "after"}`}</caption>
          <thead className="sticky top-0 bg-surface-raised">
            <tr className="font-mono text-[0.65rem] uppercase tracking-[0.05em] text-ink-muted">
              <th scope="col" className="px-2 py-1.5">Country</th>
              <th scope="col" className="px-2 py-1.5">Before</th>
              <th scope="col" className="px-2 py-1.5">After</th>
              <th scope="col" className="px-2 py-1.5">Change</th>
              <th scope="col" className="px-2 py-1.5">Months (before, after)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className="border-t border-line">
                <th scope="row" className="px-2 py-1 font-normal">{r.name}{r.material ? "" : r.plotted ? " (not drawn: small)" : " (not plotted)"}</th>
                <td className="px-2 py-1">{pct(r.before)}</td>
                <td className="px-2 py-1">{pct(r.after)}</td>
                <td className="px-2 py-1">{r.changePp === null ? "—" : fmtPp(r.changePp)}</td>
                <td className="px-2 py-1">{`${r.months[0]} of ${w.beforeMonths}, ${r.months[1]} of ${w.afterMonths}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
});

/**
 * Chart 4: each country's average calculated duty rate in the months before (hollow) and
 * after (filled) the cut-over date from the curated tariff timeline, with the change in
 * percentage points at right. The sort is reversible; a row click picks that country.
 */
export function TradeBeforeAfterCard({
  data,
  country,
  onPickCountry,
}: {
  data: BeforeAfterData;
  country: string | null;
  onPickCountry: (code: string | null) => void;
}) {
  const { windows: w, rows: all, cutover } = data;
  const [sort, setSort] = useState<ChangeSortState>({ key: "change", reversed: false });
  const phone = useMediaQuery("(max-width: 767px)");
  const [expanded, setExpanded] = useState(false);
  const sorted = useMemo(() => sortBeforeAfter(all, sort), [all, sort]);
  const plottedRows = useMemo(() => sorted.filter((r) => r.material), [sorted]);
  const axis = useMemo(() => rateAxis(all), [all]);
  const collapsed = phone && !expanded && plottedRows.length > PHONE_ROWS;
  const visible = useMemo(() => (collapsed ? plottedRows.slice(0, PHONE_ROWS) : plottedRows), [collapsed, plottedRows]);
  const swarm = useMemo<SwarmRowData<Tip>[]>(
    () =>
      visible.map((r) => {
        const tooltip = { row: r };
        return {
          id: r.code,
          label: r.name,
          labelHighlighted: r.code === country,
          selected: r.code === country,
          onRowClick: () => onPickCountry(r.code === country ? null : r.code),
          meta: fmtPp(r.changePp as number),
          points: [
            { id: "before", value: (r.before as number) * 100, colorClass: "fill-ink", emphasized: true, hollow: true, tooltip },
            { id: "after", value: (r.after as number) * 100, colorClass: "fill-ink", emphasized: true, tooltip },
          ],
        };
      }),
    [visible, country, onPickCountry],
  );
  const verb = KIND_VERB[cutover.kind] ?? "changed";
  const authority = AUTHORITY_LABEL[cutover.authority] ?? cutover.authority;
  const notPlotted = all.filter((r) => !r.plotted).length;
  const small = all.filter((r) => r.plotted && !r.material).length;

  return (
    <section className="min-w-0 rounded-[10px] border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 font-serif text-[1.6rem] font-medium leading-tight">Before and after the ruling</h2>
          <p className="m-0 mt-2 text-[0.875rem] leading-[1.5] text-ink-muted">
            Each country’s average calculated duty rate in the {w.beforeMonths} months before and the {w.afterMonths} months after {dateText(cutover.date)}, when {authority} tariffs {verb}.
          </p>
        </div>
        <ReversibleSortToggle
          options={SORTS}
          active={sort.key}
          reversed={sort.reversed}
          onSelect={(k: ChangeSort) => setSort((s) => (s.key === k ? { key: k, reversed: !s.reversed } : { key: k, reversed: false }))}
          ariaLabel="Sort countries"
        />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.75rem] text-ink-muted">
        <span className="inline-flex items-center gap-1.5"><svg width="12" height="12" aria-hidden><circle cx="6" cy="6" r="4.5" fill="var(--surface)" stroke="var(--ink)" strokeWidth="2" /></svg>Before ({windowText(w.before)})</span>
        <span className="inline-flex items-center gap-1.5"><svg width="12" height="12" aria-hidden><circle cx="6" cy="6" r="5" fill="var(--ink)" /></svg>After ({w.after ? windowText(w.after) : "no full month yet"})</span>
        <span className="ml-auto">Right: change in percentage points.</span>
      </div>
      {w.afterMonths < w.requested && (
        <p className="m-0 mt-1.5 text-[0.8rem] text-ink-muted">Only {w.afterMonths} full {w.afterMonths === 1 ? "month" : "months"} of data after {dateText(cutover.date)} so far, against {w.beforeMonths} before.</p>
      )}

      <div className="mt-2 md:max-h-[36rem] md:overflow-y-auto">
        {visible.length > 0 ? (
          <SwarmRows<Tip>
            rows={swarm}
            ariaLabel={`Average calculated duty rate before and after ${dateText(cutover.date)}, ${plottedRows.length} countries${collapsed ? `, the first ${PHONE_ROWS} shown` : ""}, with the change for each`}
            margin={MARGIN}
            rowHeight={ROW_H}
            domain={[0, axis.max]}
            ticks={axis.ticks}
            formatTick={(v) => (v === 0 ? "0%" : `${v}%`)}
            makeScale={(width) => scaleLinear().domain([0, axis.max]).range([0, width])}
            renderTooltip={({ row }) => (
              <div className="flex min-w-[9rem] flex-col gap-0.5 text-[0.78rem]">
                <div className="font-medium">{row.name}</div>
                <div>Before <span className="font-mono">{pct(row.before)}</span></div>
                <div>After <span className="font-mono">{pct(row.after)}</span></div>
                <div>Change <span className="font-mono">{fmtPp(row.changePp as number)}</span></div>
              </div>
            )}
          />
        ) : (
          <div role="status" className="flex h-[120px] items-center justify-center rounded-md border border-dashed border-line text-[0.85rem] text-ink-muted">
            No country has a full set of months in both windows yet.
          </div>
        )}
      </div>

      {phone && plottedRows.length > PHONE_ROWS && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="mt-2 min-h-11 w-full rounded-md border border-line-strong bg-surface-raised px-3 text-[0.85rem] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {expanded ? "Show fewer countries" : `Show all ${plottedRows.length} countries`}
        </button>
      )}

      <p className="m-0 mt-2 text-[0.75rem] leading-[1.45] text-ink-muted">
        Rates are calculated duties divided by imports for consumption, from Census data, over {w.beforeMonths} full months before and {w.afterMonths} after. The month of {dateText(cutover.date)} itself is left out, because it is part before and part after.
        Shipment timing can blur the cut-over, and the replacement tariffs that followed appear in the chart above. “Biggest change” ranks by the size of the move in either direction; click the active sort again to reverse it.
        Click a row to pick that country above. Shown: countries with at least {fmtDollars(MIN_WINDOW_IMPORTS)} of imports in each window, because a few shipments can swing a small partner’s rate by tens of points.
        {small > 0 ? ` ${small} smaller partners are in the table only.` : ""}{notPlotted > 0 ? ` ${notPlotted} ${notPlotted === 1 ? "country has" : "countries have"} months missing in a window and cannot be compared.` : ""}
      </p>
      <DataTable rows={sorted} w={w} />
    </section>
  );
}
