"use client";

import { memo, useMemo } from "react";
import { PillGroup } from "@/components/charts/PillGroup";
import { dateOfDay } from "@/lib/indicator-time";
import {
  fmtMoney,
  lastIndexWithData,
  monthStartDay,
  readingAtDay,
  scaleFor,
  termAtDay,
  termLabel,
  type FlowSeries,
  type Measure,
} from "@/lib/trade-chart";
import { balance } from "@/lib/trade-derive";
import { MONTH_NAMES } from "@/lib/indicator-time";
import { TradeBalanceChart, type Era } from "./TradeBalanceChart";
import { MobileReadout } from "./MobileReadout";
import { activeDay, useTradeActions, useTradeValues } from "./TradeState";

const MEASURES = [
  { value: "balance", label: "Balance" },
  { value: "flows", label: "Exports & imports" },
] as const;

const Swatch = ({ color, border }: { color: string; border?: boolean }) => (
  <span aria-hidden className="inline-block size-3" style={{ background: color, border: border ? "1px solid var(--line)" : undefined }} />
);

/** `<details>` table fallback: every month, for screen readers and copying. */
const DataTable = memo(function DataTable({ series, era, caption }: { series: FlowSeries; era: Era; caption: string }) {
  const rows = useMemo(() => {
    const out: { key: number; label: string; e: number; i: number; b: number; pres: string }[] = [];
    for (let m = 0; m < series.exports.length; m++) {
      const e = series.exports[m];
      const i = series.imports[m];
      if (e == null || i == null) continue;
      const day = monthStartDay(m);
      const { year, month } = dateOfDay(day);
      const t = termAtDay(era.terms, day);
      out.push({ key: m, label: `${MONTH_NAMES[month]} ${year}`, e, i, b: balance(e, i) as number, pres: t ? termLabel(t) : "" });
    }
    return out;
  }, [series, era]);
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[0.75rem] text-ink-muted hover:text-ink">View as table</summary>
      <p className="m-0 mt-1.5 text-[0.75rem] text-ink-muted">Month, exports, imports, balance, and president, in a table, for screen readers and copying.</p>
      <div className="mt-2 max-h-72 overflow-auto">
        <table className="w-full border-collapse text-left text-[0.75rem] tabular-nums">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-surface-raised">
            <tr className="font-mono text-[0.65rem] uppercase tracking-[0.05em] text-ink-muted">
              <th scope="col" className="px-2 py-1.5">Month</th>
              <th scope="col" className="px-2 py-1.5">Exports</th>
              <th scope="col" className="px-2 py-1.5">Imports</th>
              <th scope="col" className="px-2 py-1.5">Balance</th>
              <th scope="col" className="px-2 py-1.5">President</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-line">
                <th scope="row" className="px-2 py-1 font-normal">{r.label}</th>
                <td className="px-2 py-1">{fmtMoney(r.e)}</td>
                <td className="px-2 py-1">{fmtMoney(r.i)}</td>
                <td className="px-2 py-1">{fmtMoney(r.b, { signed: true })}</td>
                <td className="px-2 py-1">{r.pres}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
});

/**
 * Chart 1: the goods trade balance (or exports and imports), national or for one
 * country, month by month under each president. `series` is null while a country's
 * file is loading.
 */
export function TradeBalanceCard({
  series,
  countryName,
  adjusted,
  era,
  view,
  loading,
  error,
}: {
  series: FlowSeries | null;
  countryName: string | null;
  adjusted: boolean;
  era: Era;
  view: readonly [number, number];
  loading: boolean;
  error: boolean;
}) {
  const { measure, showCong } = useTradeValues();
  const { setMeasure } = useTradeActions();
  const v = useTradeValues();
  const day = activeDay(v);
  const scale = useMemo(() => (series ? scaleFor(series, measure) : { lo: 0, hi: 1, ticks: [0, 1] }), [series, measure]);
  const last = series ? lastIndexWithData(series) : -1;
  const reading = series ? readingAtDay(series, day ?? (last >= 0 ? monthStartDay(last) : -1)) : null;
  const title = countryName ? `The goods trade balance with ${countryName}` : "The goods trade balance";
  const headline = reading
    ? measure === "balance"
      ? reading.balance === null ? "—" : fmtMoney(reading.balance, { signed: true })
      : reading.exports === null || reading.imports === null ? "—" : `${fmtMoney(reading.exports)} / ${fmtMoney(reading.imports)}`
    : "—";
  const pres = reading ? termAtDay(era.terms, monthStartDay(reading.month)) : undefined;
  const mobileLine = reading
    ? `${reading.label} · ${measure === "balance" ? `Balance ${reading.balance === null ? "\u2014" : fmtMoney(reading.balance, { signed: true })}` : `Exports ${reading.exports === null ? "\u2014" : fmtMoney(reading.exports)} · Imports ${reading.imports === null ? "\u2014" : fmtMoney(reading.imports)}`}${pres ? ` · ${termLabel(pres)}` : ""}`
    : "";
  const adjLabel = adjusted ? "Seasonally adjusted" : "Not seasonally adjusted";
  const aria = `${title}, monthly, ${adjLabel.toLowerCase()}, ${measure === "balance" ? "exports minus imports" : "exports and imports"}, with presidential terms and recessions marked. The same data is in the table below.`;

  return (
    <section className="min-w-0 rounded-[10px] border border-line bg-surface p-5 sm:p-6">
      <h2 className="m-0 font-serif text-[1.6rem] font-medium leading-tight">{title}</h2>
      <p className="m-0 mt-2 text-[0.875rem] leading-[1.5] text-ink-muted">
        {countryName
          ? `Exports minus imports of goods with ${countryName}, month by month, under each president. Recessions are shaded.`
          : "Exports minus imports of goods, month by month, under each president. Recessions are shaded."}
      </p>
      {/* The measure toggle and the headline number share one line under the subhead. */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <PillGroup options={MEASURES} value={measure} onChange={(m) => setMeasure(m as Measure)} ariaLabel="Measure" />
        <div className="min-w-0 text-right">
          <div className="whitespace-nowrap font-mono text-[1.25rem] font-medium leading-tight text-ink sm:text-[1.6rem]">{headline}</div>
          <div className="mt-0.5 text-[0.75rem] text-ink-muted">{reading ? reading.label : ""}</div>
        </div>
      </div>

      {series && <MobileReadout line={mobileLine} />}
      <div className="mt-3.5">
        {series ? (
          <TradeBalanceChart series={series} measure={measure} scale={scale} era={era} showCong={showCong} view={view} ariaLabel={aria} />
        ) : (
          <div role="status" className="flex h-[260px] items-center justify-center rounded-md border border-dashed border-line text-[0.85rem] text-ink-muted">
            {error ? `Couldn’t load ${countryName ?? "that country"}. Pick it again to retry.` : loading ? `Loading ${countryName ?? "country"}…` : ""}
          </div>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.75rem] text-ink-muted">
        {measure === "flows" && (
          <>
            <span className="inline-flex items-center gap-1.5"><svg width="22" height="8" aria-hidden><line x1="0" x2="22" y1="4" y2="4" stroke="var(--ink)" strokeWidth="2" /></svg>Exports</span>
            <span className="inline-flex items-center gap-1.5"><svg width="22" height="8" aria-hidden><line x1="0" x2="22" y1="4" y2="4" stroke="var(--ink-faint)" strokeWidth="2" strokeDasharray="4 3" /></svg>Imports</span>
          </>
        )}
        <span className="inline-flex items-center gap-1.5"><Swatch color="var(--dem)" />Democratic</span>
        <span className="inline-flex items-center gap-1.5"><Swatch color="var(--rep)" />Republican</span>
        <span className="inline-flex items-center gap-1.5"><Swatch color="color-mix(in srgb, var(--ink) 9%, transparent)" border />Recession (NBER)</span>
        <span className="ml-auto">{adjLabel}{countryName ? `. Axis rescales to ${countryName}.` : "."}</span>
      </div>

      <p className="m-0 mt-2 text-[0.75rem] leading-[1.45] text-ink-muted">
        Census Bureau goods trade on the Census basis, monthly. The national line is seasonally adjusted; the country view is not. Services are not included, so the figure differs from the
        combined goods-and-services deficit usually quoted in the news. Click or drag on the chart to pin a month.
      </p>
      {series && <DataTable series={series} era={era} caption={`${title}, monthly, ${adjLabel.toLowerCase()}`} />}
    </section>
  );
}
