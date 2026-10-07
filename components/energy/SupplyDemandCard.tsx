"use client";

import { useMemo } from "react";
import { line } from "d3-shape";
import { fmtMbd, isPreliminary, monthLabel, monthOfDay, monthlyAt, termAtDay } from "@/lib/energy-derive";
import { monthStartDay, termLabel } from "@/lib/trade-chart";
import type { EnergyPayload, MonthlyKey } from "@/lib/energy-types";
import { EnergyChart, type Panel } from "./EnergyChart";
import { activeDay, useEnergyValues } from "./EnergyState";
import { CommonKey, EnergyCardShell, Legend, LineKey, lastIndexOf, monthMidDay, monthPoints, MonthTable, prelimBand, scaleOver, statusText } from "./shared";

/** Colours reuse the validated sector tokens, as on the imports and exports card. */
const LINES: { key: MonthlyKey; label: string; short: string; color: string }[] = [
  { key: "prod", label: "Production (crude plus natural gas liquids)", short: "Production", color: "var(--sector-econ)" },
  { key: "supplied", label: "Products supplied (consumption proxy)", short: "Supplied", color: "var(--sector-ps)" },
];
const KEYS: MonthlyKey[] = ["prod", "supplied"];
const fmtTick = (v: number) => (v === 0 ? "0" : String(v / 1000));

/**
 * Card 2: supply and demand. Total-petroleum production against products supplied (EIA's stand-in for consumption),
 * so the gap between them is the story. Both are total petroleum, never crude alone. Context, not policy: no flags.
 */
export function SupplyDemandCard({ payload, view }: { payload: EnergyPayload; view: readonly [number, number] }) {
  const v = useEnergyValues();
  const m = payload.monthly;
  const era = useMemo(() => ({ span: payload.span, rec: payload.rec, terms: payload.terms, control: payload.control }), [payload]);
  const prelim = useMemo(() => prelimBand(payload, KEYS), [payload]);
  const last = Math.max(...KEYS.map((k) => lastIndexOf(m[k])));
  const noFlags = useMemo(() => [], []);

  const panels = useMemo<Panel[]>(() => {
    const vals = LINES.flatMap((l) => m[l.key].filter((_, i) => monthMidDay(i) >= view[0] && monthMidDay(i) < view[1]));
    return [
      {
        id: "supply",
        caption: ["Million barrels per day, total petroleum (crude plus products)", "Million barrels per day, total petroleum", "Million barrels per day"],
        h: 240,
        hCompact: 190,
        scale: scaleOver(vals, 4, false),
        fmtTick,
        render: ({ X, Y }) => (
          <>
            {LINES.map((l) => {
              const gen = line<{ day: number; value: number | null }>().defined((p) => p.value !== null).x((p) => X(p.day)).y((p) => Y(p.value as number));
              return <path key={l.key} d={gen(monthPoints(m[l.key])) ?? ""} fill="none" stroke={l.color} strokeWidth={2} strokeLinejoin="round" />;
            })}
          </>
        ),
        dotsAt: (day) => LINES.map((l) => ({ day: monthMidDay(monthOfDay(day)), value: monthlyAt(m[l.key], day), color: l.color })),
      },
    ];
  }, [m, view]);

  const day = activeDay(v);
  const month = Math.min(day !== null ? monthOfDay(day) : last, last);
  const term = termAtDay(payload.terms, monthStartDay(month));
  const f = (k: MonthlyKey) => (m[k][month] == null ? "—" : fmtMbd(m[k][month] as number));
  const readout = `${monthLabel(month)} · Produced ${f("prod")} · Supplied ${f("supplied")}${isPreliminary(payload, "prod", month) ? " (preliminary)" : ""}${term ? ` · ${termLabel(term)}` : ""}`;

  return (
    <EnergyCardShell
      id="supply"
      title="Oil supply and demand"
      desc="What U.S. fields produce against what refiners supply to the market, monthly, in total petroleum. Products supplied is EIA’s stand-in for consumption, so the gap between the lines is roughly how much the country relies on imports or exports."
      readout={readout}
      chart={
        <EnergyChart
          panels={panels}
          era={era}
          view={view}
          flags={noFlags}
          prelim={prelim}
          ariaLabel="Total petroleum production and products supplied in million barrels per day, monthly, with presidential terms and recessions. The same data is in the table below."
          legend={
            <Legend>
              {LINES.map((l) => (
                <span key={l.key} className="inline-flex items-center gap-1 whitespace-nowrap"><LineKey color={l.color} />{l.label}</span>
              ))}
              <CommonKey prelim={prelim !== null} flags={false} />
            </Legend>
          }
          renderTip={(d) => {
            const mo = Math.min(monthOfDay(d), last);
            if (mo < 0) return null;
            const t = termAtDay(payload.terms, monthStartDay(mo));
            return (
              <div className="flex min-w-[11rem] flex-col gap-0.5 text-[0.78rem]">
                <div className="opacity-75">{monthLabel(mo)}</div>
                {LINES.map((l) => (
                  <div key={l.key} className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5"><LineKey color={l.color} />{l.short}</span>
                    <span className="font-mono">{m[l.key][mo] == null ? "—" : fmtMbd(m[l.key][mo] as number)}</span>
                  </div>
                ))}
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
            Energy Information Administration, Monthly Energy Review. Both lines are <em>total petroleum</em>: crude oil plus natural gas liquids and refined products. Crude alone is a smaller number
            (about 13.7 million barrels a day produced in 2025 against 21.2 million for total petroleum), so crude and total are never mixed in one comparison. Products supplied is what left refineries,
            blending and storage for the domestic market, adjusted for stock changes; it approximates consumption and is not a direct measure of use. Prices, the economy, weather and the vehicle fleet drive it,
            not any one policy, so this card carries no policy marks.
          </p>
          <p>
            Monthly figures are rates (thousand barrels per day, shown in millions) and are not seasonally adjusted, so they swing with the seasons; read the trend, not the month-to-month moves. The hatched
            stretch is the last 12 months, which EIA revises (the real lag before a month is final was not verified, so 12 months is a cautious placeholder), and the newest month can be an estimate.
          </p>
        </>
      }
      tables={
        <MonthTable
          caption="Total petroleum production and products supplied, thousand barrels per day, by month"
          from={Math.max(0, m.prod.findIndex((x) => x !== null))}
          to={last}
          columns={[
            { label: "Production", get: (i) => String(m.prod[i] ?? "—") },
            { label: "Supplied", get: (i) => String(m.supplied[i] ?? "—") },
          ]}
          status={(i) => statusText(isPreliminary(payload, "prod", i))}
        />
      }
    />
  );
}
