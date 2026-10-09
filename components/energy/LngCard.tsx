"use client";

import { useMemo } from "react";
import { line } from "d3-shape";
import { flagsForCard, fmtBcf, isPreliminary, monthLabel, monthOfDay, monthlyAt, termAtDay } from "@/lib/energy-derive";
import type { EnergyPayload } from "@/lib/energy-types";
import { monthStartDay, termLabel } from "@/lib/trade-chart";
import { EnergyChart, type Panel } from "./EnergyChart";
import { activeDay, useEnergyValues } from "./EnergyState";
import { CommonKey, EnergyCardShell, FlagsTable, Legend, LineKey, lastIndexOf, monthMidDay, monthPoints, MonthTable, prelimBand, scaleOver, statusText } from "./shared";

const LNG_START = 72; // January 1997, in months since January 1991
const fmtTick = (v: number) => (v === 0 ? "0" : String(v / 1000));

/** Card 4 (small): liquefied natural gas exports, with the 2024 pause and the 2025 reversal marked. Policy here leads the trade by years. */
export function LngCard({ payload, view }: { payload: EnergyPayload; view: readonly [number, number] }) {
  const v = useEnergyValues();
  const m = payload.monthly;
  const flags = useMemo(() => flagsForCard(payload.flags, "lng"), [payload.flags]);
  const era = useMemo(() => ({ span: payload.span, rec: payload.rec, terms: payload.terms, control: payload.control }), [payload]);
  const prelim = useMemo(() => prelimBand(payload, ["lng"]), [payload]);
  const last = lastIndexOf(m.lng);

  const panels = useMemo<Panel[]>(() => {
    const scale = scaleOver(m.lng.filter((_, i) => monthMidDay(i) >= view[0] && monthMidDay(i) < view[1]), 3, false);
    return [
      {
        id: "lng",
        h: 170,
        hCompact: 140,
        scale,
        fmtTick,
        render: ({ X, Y, ml, top, bottom }) => {
          const gen = line<{ day: number; value: number | null }>().defined((p) => p.value !== null).x((p) => X(p.day)).y((p) => Y(p.value as number));
          const zoneEnd = X(Math.min(view[1], monthStartDay(LNG_START)));
          const zoneW = zoneEnd - ml;
          return (
            <>
              {zoneW > 0 && (
                <g>
                  <rect x={ml} y={top} width={zoneW} height={bottom - top} fill="var(--ink)" fillOpacity={0.045} />
                  {zoneW >= 240 && <text x={ml + zoneW / 2} y={(top + bottom) / 2 + 4} textAnchor="middle" className="fill-ink-muted text-[11px]">LNG export data begins January 1997</text>}
                </g>
              )}
              <path d={gen(monthPoints(m.lng)) ?? ""} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </>
          );
        },
        extremes: { points: monthPoints(m.lng), label: (val, month) => `${month}: ${fmtBcf(val)}` },
        dotsAt: (day) => [{ day: monthMidDay(monthOfDay(day)), value: monthlyAt(m.lng, day), color: "var(--ink)" }],
      },
    ];
  }, [m, view]);

  const day = activeDay(v);
  const month = Math.min(day !== null ? monthOfDay(day) : last, last);
  const term = termAtDay(payload.terms, monthStartDay(month));
  const val = m.lng[month];
  const readout = { values: [`LNG exports ${val == null ? "—" : fmtBcf(val)}`], date: `${monthLabel(month)}${isPreliminary(payload, "lng", month) ? " (preliminary)" : ""}`, term: term ? termLabel(term) : undefined };

  return (
    <EnergyCardShell
      id="lng"
      small
      title="Liquefied natural gas exports"
      desc="Natural gas shipped abroad as liquid, billions of cubic feet a month. The Energy Department’s 2024 pause on new export approvals and its 2025 reversal are marked."
      readout={readout}
      chart={
        <EnergyChart
          panels={panels}
          era={era}
          view={view}
          flags={flags}
          prelim={prelim}
          ariaLabel="U.S. liquefied natural gas exports in billion cubic feet per month, from 1997, with two Energy Department actions marked, presidential terms and recessions. The same data is in the table below."
          legend={
            <Legend>
              <span className="inline-flex items-center gap-1 whitespace-nowrap"><LineKey color="var(--ink)" />LNG exports, billion cubic feet per month</span>
              <CommonKey prelim={prelim !== null} flags />
            </Legend>
          }
          renderTip={(d) => {
            const mo = Math.min(monthOfDay(d), last);
            if (mo < 0) return null;
            const t = termAtDay(payload.terms, monthStartDay(mo));
            return (
              <div className="flex min-w-[10rem] flex-col gap-0.5 text-[0.78rem]">
                <div className="opacity-75">{monthLabel(mo)}</div>
                <div className="font-mono text-[0.95rem] font-medium">{m.lng[mo] == null ? "—" : fmtBcf(m.lng[mo] as number)}</div>
                {t && <div className="opacity-75">{termLabel(t)}</div>}
                {m.lng[mo] != null && <div className="opacity-60">{statusText(isPreliminary(payload, "lng", mo))}</div>}
              </div>
            );
          }}
        />
      }
      notes={
        <p>
          Energy Information Administration LNG exports. The series starts in 1997 but large-scale exports begin in February 2016; earlier volumes are small but unverified, so read the flat stretch as small, not necessarily zero. Export approvals come years before cargoes, so flags mark what the Department of Energy decided and when, not any month&rsquo;s volume.
        </p>
      }
      tables={
        <>
          <MonthTable
            caption="Liquefied natural gas exports, million cubic feet, by month"
            from={LNG_START}
            to={last}
            columns={[{ label: "Exports (million cu ft)", get: (i) => String(m.lng[i] ?? "—") }]}
            status={(i) => statusText(isPreliminary(payload, "lng", i))}
          />
          <FlagsTable flags={flags} lastReviewed={payload.flagsReviewed} caption="Liquefied natural gas actions marked on the chart" />
        </>
      }
    />
  );
}
