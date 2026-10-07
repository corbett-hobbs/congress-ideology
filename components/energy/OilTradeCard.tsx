"use client";

import { useMemo, useState } from "react";
import { line } from "d3-shape";
import { PillGroup } from "@/components/charts/PillGroup";
import { flagsForCard, fmtMbd, fmtMbdShort, isPreliminary, monthLabel, monthOfDay, monthlyAt, termAtDay } from "@/lib/energy-derive";
import { monthStartDay, termLabel } from "@/lib/trade-chart";
import type { EnergyPayload, MonthlyKey } from "@/lib/energy-types";
import { LegendToggle, useIsolate } from "@/components/charts/LegendToggle";
import { EnergyChart, type Panel } from "./EnergyChart";
import { activeDay, useEnergyValues } from "./EnergyState";
import { CommonKey, EnergyCardShell, FlagsTable, Legend, LineKey, lastIndexOf, monthMidDay, monthPoints, MonthTable, prelimBand, scaleOver, statusText } from "./shared";

type Mode = "balance" | "flows";
const MODES = [
  { value: "balance", label: "Balance" },
  { value: "flows", label: "Exports & imports" },
] as const;
const FLOWS: { key: MonthlyKey; label: string; short: string; color: string; dash?: boolean }[] = [
  { key: "imp", label: "Imports", short: "Imports", color: "var(--sector-health)" },
  { key: "exp", label: "Exports", short: "Exports", color: "var(--sector-prog)" },
  { key: "cexp", label: "Crude oil exports only", short: "Crude exports", color: "var(--sector-prog)", dash: true },
];
const KEYS: MonthlyKey[] = ["imp", "exp", "cexp", "net"];
const fmtTick = (v: number) => (v === 0 ? "0" : String(v / 1000).replace("-", "−"));
const fmtShort = (v: number) => `${v < 0 ? "−" : ""}${(Math.abs(v) / 1000).toFixed(1)}M b/d`;

/**
 * Card 3: oil imports and exports. Balance (net imports, with its zero line) or the two flows, with crude-only
 * exports as a thin dashed line in the flows view, where the 2015 repeal of the export restriction shows. Total
 * petroleum throughout, except that one labelled crude series.
 */
export function OilTradeCard({ payload, view }: { payload: EnergyPayload; view: readonly [number, number] }) {
  const v = useEnergyValues();
  const m = payload.monthly;
  const [mode, setMode] = useState<Mode>("balance");
  const [only, isolate] = useIsolate<MonthlyKey>();
  const shown = useMemo(() => FLOWS.filter((l) => !only || l.key === only), [only]);
  const flags = useMemo(() => flagsForCard(payload.flags, "oil"), [payload.flags]);
  const era = useMemo(() => ({ span: payload.span, rec: payload.rec, terms: payload.terms, control: payload.control }), [payload]);
  const prelim = useMemo(() => prelimBand(payload, KEYS), [payload]);
  const last = Math.max(...KEYS.map((k) => lastIndexOf(m[k])));

  const panels = useMemo<Panel[]>(() => {
    const inView = (a: readonly (number | null)[]) => a.filter((_, i) => monthMidDay(i) >= view[0] && monthMidDay(i) < view[1]);
    if (mode === "balance") {
      return [
        {
          id: "balance",
          caption: ["Net imports, million barrels per day (imports minus exports; below zero the U.S. exported more than it imported)", "Net imports, million b/d (below zero: net exporter)", "Net imports, million b/d"],
          h: 240,
          hCompact: 190,
          scale: scaleOver(inView(m.net), 4),
          fmtTick,
          render: ({ X, Y }) => {
            const gen = line<{ day: number; value: number | null }>().defined((p) => p.value !== null).x((p) => X(p.day)).y((p) => Y(p.value as number));
            return <path d={gen(monthPoints(m.net)) ?? ""} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />;
          },
          extremes: { points: monthPoints(m.net), label: (val, month) => `${month}: ${fmtShort(val)}` },
          dotsAt: (day) => [{ day: monthMidDay(monthOfDay(day)), value: monthlyAt(m.net, day), color: "var(--ink)" }],
        },
      ];
    }
    return [
      {
        id: "flows",
        caption: ["Million barrels per day, total petroleum (crude exports only is the dashed line)", "Million barrels per day, total petroleum", "Million barrels per day"],
        h: 240,
        hCompact: 190,
        scale: scaleOver(shown.flatMap((l) => inView(m[l.key])), 4, false),
        fmtTick,
        render: ({ X, Y }) => (
          <>
            {shown.map((l) => {
              const gen = line<{ day: number; value: number | null }>().defined((p) => p.value !== null).x((p) => X(p.day)).y((p) => Y(p.value as number));
              return <path key={l.key} d={gen(monthPoints(m[l.key])) ?? ""} fill="none" stroke={l.color} strokeWidth={l.dash ? 1.4 : 2} strokeDasharray={l.dash ? "4 3" : undefined} strokeLinejoin="round" />;
            })}
          </>
        ),
        examples: shown.map((l) => ({ points: monthPoints(m[l.key]), color: l.color, label: (val, month) => `${month}: ${(val / 1000).toFixed(1)}M` })),
        dotsAt: (day) => shown.map((l) => ({ day: monthMidDay(monthOfDay(day)), value: monthlyAt(m[l.key], day), color: l.color })),
      },
    ];
  }, [m, view, mode, shown]);

  const day = activeDay(v);
  const month = Math.min(day !== null ? monthOfDay(day) : last, last);
  const term = termAtDay(payload.terms, monthStartDay(month));
  const f = (k: MonthlyKey) => (m[k][month] == null ? "—" : fmtMbdShort(m[k][month] as number));
  const readout = { values: mode === "balance" ? [`Net imports ${f("net")}`] : [`Imports ${f("imp")}`, `Exports ${f("exp")}`], date: `${monthLabel(month)}${isPreliminary(payload, "net", month) ? " (preliminary)" : ""}`, term: term ? termLabel(term) : undefined };

  return (
    <EnergyCardShell
      id="oil"
      title="Oil imports and exports"
      desc="What the U.S. brings in and sends out, monthly, in total petroleum (crude oil plus the products made from it): the balance between them, or each flow on its own."
      readout={readout}
      chart={
        <>
          <div className="mb-2.5 w-fit">
            <PillGroup options={MODES} value={mode} onChange={setMode} ariaLabel="Oil trade measure" />
          </div>
          <EnergyChart
            panels={panels}
            era={era}
            view={view}
            flags={flags}
            prelim={prelim}
            ariaLabel="Net imports of total petroleum, or imports and exports, in million barrels per day, monthly, with one action marked, presidential terms and recessions. The same data is in the table below."
            legend={
              <Legend>
                {mode === "balance" ? (
                  <span className="inline-flex items-center gap-1 whitespace-nowrap"><LineKey color="var(--ink)" />Net imports (imports minus exports)</span>
                ) : (
                  FLOWS.map((l) => (
                    <LegendToggle key={l.key} active={only === l.key} dimmed={only !== null && only !== l.key} onClick={() => isolate(l.key)}><LineKey color={l.color} dash={l.dash} />{l.label}</LegendToggle>
                  ))
                )}
                <CommonKey prelim={prelim !== null} flags />
              </Legend>
            }
            renderTip={(d) => {
              const mo = Math.min(monthOfDay(d), last);
              if (mo < 0) return null;
              const t = termAtDay(payload.terms, monthStartDay(mo));
              const rows = mode === "balance" ? [{ key: "net" as MonthlyKey, short: "Net imports", color: "var(--ink)", dash: false }] : shown;
              return (
                <div className="flex min-w-[11rem] flex-col gap-0.5 text-[0.78rem]">
                  <div className="opacity-75">{monthLabel(mo)}</div>
                  {rows.map((l) => (
                    <div key={l.key} className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-1.5"><LineKey color={l.color} dash={l.dash} />{l.short}</span>
                      <span className="font-mono">{m[l.key][mo] == null ? "—" : fmtMbd(m[l.key][mo] as number)}</span>
                    </div>
                  ))}
                  {t && <div className="opacity-75">{termLabel(t)}</div>}
                  <div className="opacity-60">{statusText(isPreliminary(payload, "net", mo))}</div>
                </div>
              );
            }}
          />
        </>
      }
      notes={
        <>
          <p>
            Energy Information Administration, Monthly Energy Review. Imports, exports and net imports are <em>total petroleum</em>: crude oil plus natural gas liquids and refined products. Net imports is imports minus
            exports as EIA publishes it; below zero the U.S. exported more than it imported, which first happened on an annual basis in 2020. The dashed line is the one crude-only series, shown in the Exports & imports view because
            crude exports is where the 2015 repeal shows.
          </p>
          <p>
            Congress repealed the statutory restriction on crude exports in December 2015; crude exports rose from about 0.5 million barrels a day in 2015 to about 3 million in 2019, but the date marks the act, which enabled the change and did not cause it by
            itself. Monthly figures are rates (thousand barrels per day, shown in millions), not seasonally adjusted, so they swing with the seasons. The hatched stretch is the last 12 months, which EIA revises (the real lag before
            a month is final was not verified, so 12 months is a cautious placeholder), and the newest month can be an estimate.
          </p>
        </>
      }
      tables={
        <>
          <MonthTable
            caption="Total petroleum imports, exports, crude oil exports and net imports, thousand barrels per day, by month"
            from={Math.max(0, m.imp.findIndex((x) => x !== null))}
            to={last}
            columns={[
              { label: "Imports", get: (i) => String(m.imp[i] ?? "—") },
              { label: "Exports", get: (i) => String(m.exp[i] ?? "—") },
              { label: "Crude exports", get: (i) => String(m.cexp[i] ?? "—") },
              { label: "Net imports", get: (i) => String(m.net[i] ?? "—") },
            ]}
            status={(i) => statusText(isPreliminary(payload, "net", i))}
          />
          <FlagsTable flags={flags} lastReviewed={payload.flagsReviewed} caption="Oil actions marked on the chart" />
        </>
      }
    />
  );
}
