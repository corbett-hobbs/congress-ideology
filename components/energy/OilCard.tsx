"use client";

import { useMemo } from "react";
import { line } from "d3-shape";
import { flagsForCard, fmtMbd, isPreliminary, monthLabel, monthOfDay, monthlyAt, termAtDay } from "@/lib/energy-derive";
import { monthStartDay, termLabel } from "@/lib/trade-chart";
import type { EnergyPayload, MonthlyKey } from "@/lib/energy-types";
import { EnergyChart, type Panel } from "./EnergyChart";
import { activeDay, useEnergyValues } from "./EnergyState";
import { CommonKey, EnergyCardShell, FlagsTable, Legend, LineKey, lastIndexOf, monthMidDay, monthPoints, MonthTable, prelimBand, scaleOver, statusText } from "./shared";

/** Colours reuse the validated, mutually separable sector tokens (five series are on one chart). */
const LINES: { key: MonthlyKey; label: string; color: string; dash?: boolean }[] = [
  { key: "prod", label: "Production (crude plus natural gas liquids)", color: "var(--sector-econ)" },
  { key: "supplied", label: "Products supplied (consumption proxy)", color: "var(--sector-ps)" },
  { key: "imp", label: "Imports", color: "var(--sector-health)" },
  { key: "exp", label: "Exports", color: "var(--sector-prog)" },
  { key: "cexp", label: "Crude oil exports only", color: "var(--sector-prog)", dash: true },
];
const KEYS: MonthlyKey[] = ["prod", "supplied", "imp", "exp", "cexp", "net"];
const fmtTick = (v: number) => (v === 0 ? "0" : String(v / 1000).replace("-", "−"));
const fmtShort = (v: number) => `${v < 0 ? "−" : ""}${(Math.abs(v) / 1000).toFixed(1)}M b/d`;

/**
 * Card 2: the oil balance, all in the total-petroleum family so the lines compare like with like (crude alone
 * would put 13 million barrels a day of production beside 21 million of products supplied). Crude-only exports
 * is the secondary dashed line, where the 2015 repeal of the export restriction shows.
 */
export function OilCard({ payload, view }: { payload: EnergyPayload; view: readonly [number, number] }) {
  const v = useEnergyValues();
  const m = payload.monthly;
  const flags = useMemo(() => flagsForCard(payload.flags, "oil"), [payload.flags]);
  const era = useMemo(() => ({ span: payload.span, rec: payload.rec, terms: payload.terms, control: payload.control }), [payload]);
  const prelim = useMemo(() => prelimBand(payload, KEYS), [payload]);
  const last = Math.max(...KEYS.map((k) => lastIndexOf(m[k])));

  const panels = useMemo<Panel[]>(() => {
    const inView = (a: readonly (number | null)[]) => a.filter((_, i) => monthMidDay(i) >= view[0] && monthMidDay(i) < view[1]);
    const flowScale = scaleOver(LINES.flatMap((l) => inView(m[l.key])), 4, false);
    const netScale = scaleOver(inView(m.net), 3);
    return [
      {
        id: "flows",
        caption: ["Million barrels per day, total petroleum (crude plus products)", "Million barrels per day, total petroleum", "Million barrels per day"],
        h: 220,
        hCompact: 170,
        scale: flowScale,
        fmtTick,
        render: ({ X, Y }) => (
          <>
            {LINES.map((l) => {
              const gen = line<{ day: number; value: number | null }>().defined((p) => p.value !== null).x((p) => X(p.day)).y((p) => Y(p.value as number));
              return <path key={l.key} d={gen(monthPoints(m[l.key])) ?? ""} fill="none" stroke={l.color} strokeWidth={l.dash ? 1.6 : 2} strokeDasharray={l.dash ? "4 3" : undefined} strokeLinejoin="round" />;
            })}
          </>
        ),
        dotsAt: (day) => LINES.map((l) => ({ day: monthMidDay(monthOfDay(day)), value: monthlyAt(m[l.key], day), color: l.color })),
      },
      {
        id: "net",
        caption: ["Net imports, million barrels per day (imports minus exports; below zero the U.S. exported more than it imported)", "Net imports, million b/d (below zero: net exporter)", "Net imports, million b/d"],
        h: 100,
        hCompact: 90,
        scale: netScale,
        fmtTick,
        render: ({ X, Y }) => {
          const gen = line<{ day: number; value: number | null }>().defined((p) => p.value !== null).x((p) => X(p.day)).y((p) => Y(p.value as number));
          return <path d={gen(monthPoints(m.net)) ?? ""} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />;
        },
        extremes: { points: monthPoints(m.net), label: (val, month) => `${month}: ${fmtShort(val)}` },
        dotsAt: (day) => [{ day: monthMidDay(monthOfDay(day)), value: monthlyAt(m.net, day), color: "var(--ink)" }],
      },
    ];
  }, [m, view]);

  const day = activeDay(v);
  const month = Math.min(day !== null ? monthOfDay(day) : last, last);
  const at = monthStartDay(month);
  const term = termAtDay(payload.terms, at);
  const net = m.net[month];
  const readout = `${monthLabel(month)} · Net imports ${net === null || net === undefined ? "—" : fmtMbd(net)}${isPreliminary(payload, "prod", month) ? " (preliminary)" : ""}${term ? ` · ${termLabel(term)}` : ""}`;

  return (
    <EnergyCardShell
      id="oil"
      title="Where U.S. oil comes from and where it goes"
      desc="Production, imports, exports and what refiners supplied to the market, monthly, all measured as total petroleum (crude oil plus the products made from it)."
      readout={readout}
      chart={
        <EnergyChart
          panels={panels}
          era={era}
          view={view}
          flags={flags}
          prelim={prelim}
          ariaLabel="Total petroleum production, products supplied, imports and exports in million barrels per day, monthly, with net imports below, one action marked, presidential terms and recessions. The same data is in the table below."
          legend={
            <Legend>
              {LINES.map((l) => (
                <span key={l.key} className="inline-flex items-center gap-1 whitespace-nowrap"><LineKey color={l.color} dash={l.dash} />{l.label}</span>
              ))}
              <span className="inline-flex items-center gap-1 whitespace-nowrap"><LineKey color="var(--ink)" />Net imports</span>
              <CommonKey prelim={prelim !== null} flags />
            </Legend>
          }
          renderTip={(d) => {
            const mo = Math.min(monthOfDay(d), last);
            if (mo < 0) return null;
            const t = termAtDay(payload.terms, monthStartDay(mo));
            return (
              <div className="flex min-w-[12rem] flex-col gap-0.5 text-[0.78rem]">
                <div className="opacity-75">{monthLabel(mo)}</div>
                {LINES.map((l) => (
                  <div key={l.key} className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5"><LineKey color={l.color} dash={l.dash} />{l.key === "cexp" ? "Crude exports" : l.key === "supplied" ? "Supplied" : l.key === "prod" ? "Production" : l.key === "imp" ? "Imports" : "Exports"}</span>
                    <span className="font-mono">{m[l.key][mo] == null ? "—" : fmtMbd(m[l.key][mo] as number)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 font-medium"><span>Net imports</span><span className="font-mono">{m.net[mo] == null ? "—" : fmtMbd(m.net[mo] as number)}</span></div>
                {t && <div className="opacity-75">{termLabel(t)}</div>}
                <div className="opacity-60">{statusText(isPreliminary(payload, "prod", mo))}</div>
              </div>
            );
          }}
        />
      }
      notes={
        <>
          <p>
            Energy Information Administration, Monthly Energy Review. Everything here is <em>total petroleum</em>: crude oil plus natural gas liquids and refined
            products. Crude oil alone is a different, smaller number (about 13.7 million barrels a day produced in 2025 against 21.2 million for total petroleum), so crude and
            total petroleum are never mixed in one comparison; the dashed line is the one crude-only series. Products supplied approximates consumption and is driven by prices, the economy and the vehicle fleet,
            not by any one policy. Net imports is imports minus exports as EIA publishes it, and turned negative on an annual basis in 2020.
          </p>
          <p>
            Monthly figures are rates (thousand barrels per day, shown in millions), not seasonally adjusted, so they swing with the seasons; read the trend, not the month-to-month
            moves. The hatched stretch is the last 12 months, which EIA revises (the real lag before a month is final was not verified, so 12 months is a cautious placeholder), and the newest month can be an
            estimate. Crude exports were barred by statute until Congress repealed the restriction in December 2015; exports rose over the following years, but the date marks the act, which enabled the
            change and did not cause it by itself.
          </p>
        </>
      }
      tables={
        <>
          <MonthTable
            caption="Total petroleum production, products supplied, imports, exports, crude oil exports and net imports, thousand barrels per day, by month"
            from={Math.max(0, m.prod.findIndex((x) => x !== null))}
            to={last}
            columns={[
              { label: "Production", get: (i) => String(m.prod[i] ?? "—") },
              { label: "Supplied", get: (i) => String(m.supplied[i] ?? "—") },
              { label: "Imports", get: (i) => String(m.imp[i] ?? "—") },
              { label: "Exports", get: (i) => String(m.exp[i] ?? "—") },
              { label: "Crude exports", get: (i) => String(m.cexp[i] ?? "—") },
              { label: "Net imports", get: (i) => String(m.net[i] ?? "—") },
            ]}
            status={(i) => statusText(isPreliminary(payload, "prod", i))}
          />
          <FlagsTable flags={flags} lastReviewed={payload.flagsReviewed} caption="Oil actions marked on the chart" />
        </>
      }
    />
  );
}
