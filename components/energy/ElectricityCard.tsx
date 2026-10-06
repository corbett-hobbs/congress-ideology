"use client";

import { useMemo, useState } from "react";
import { area, line } from "d3-shape";
import { SEGMENT_LABEL_STYLE } from "@/lib/chart-bars";
import { placeBandLabels } from "@/lib/energy-chart";
import { PillGroup } from "@/components/charts/PillGroup";
import { flagsForCard, fmtTwh, isPreliminary, monthLabel, monthOfDay, monthlyAt, termAtDay } from "@/lib/energy-derive";
import { FUEL_KEYS, type EnergyPayload, type FuelKey } from "@/lib/energy-types";
import { monthStartDay, niceScale, termLabel, type Scale } from "@/lib/trade-chart";
import { EnergyChart, type Panel } from "./EnergyChart";
import { activeDay, useEnergyValues } from "./EnergyState";
import { CommonKey, EnergyCardShell, FlagsTable, Legend, LineKey, lastIndexOf, monthMidDay, monthPoints, MonthTable, prelimBand, scaleOver, statusText, Swatch } from "./shared";

const FUELS: Record<FuelKey, { label: string; short: string; color: string }> = {
  coal: { label: "Coal", short: "Coal", color: "var(--fuel-coal)" },
  gas: { label: "Natural gas", short: "Natural gas", color: "var(--fuel-gas)" },
  nuclear: { label: "Nuclear", short: "Nuclear", color: "var(--fuel-nuclear)" },
  hydro: { label: "Hydro", short: "Hydro", color: "var(--fuel-hydro)" },
  wind: { label: "Wind", short: "Wind", color: "var(--fuel-wind)" },
  solar: { label: "Solar (utility-scale)", short: "Solar", color: "var(--fuel-solar)" },
  other: { label: "Other", short: "Other", color: "var(--fuel-other)" },
};
type Mode = "share" | "amount";
const MODES = [
  { value: "share", label: "Share of total" },
  { value: "amount", label: "Amount" },
] as const;
const SHARE_SCALE: Scale = { lo: 0, hi: 100, ticks: [0, 25, 50, 75, 100] };
const fmtTwhTick = (v: number) => (v === 0 ? "0" : String(v / 1000));

/**
 * Card 3: electricity by source, utility-scale (EIA's Monthly Energy Review table), as a share of the total or in
 * amounts, with small-scale solar (rooftop and similar, estimated, from 2014) as its own line underneath instead
 * of spliced in. The 2022 climate-and-tax law and the 2025 reconciliation law are marked, as context only.
 */
export function ElectricityCard({ payload, view }: { payload: EnergyPayload; view: readonly [number, number] }) {
  const v = useEnergyValues();
  const m = payload.monthly;
  const [mode, setMode] = useState<Mode>("share");
  const flags = useMemo(() => flagsForCard(payload.flags, "electricity"), [payload.flags]);
  const era = useMemo(() => ({ span: payload.span, rec: payload.rec, terms: payload.terms, control: payload.control }), [payload]);
  const prelim = useMemo(() => prelimBand(payload, [...FUEL_KEYS, "total"]), [payload]);
  const last = lastIndexOf(m.total);
  const smallFirst = m.small.findIndex((x) => x !== null);

  const panels = useMemo<Panel[]>(() => {
    const months: number[] = [];
    for (let i = 0; i <= last; i++) if (FUEL_KEYS.every((k) => m[k][i] !== null)) months.push(i);
    const sumAt = (i: number) => FUEL_KEYS.reduce((s, k) => s + (m[k][i] as number), 0);
    const visible = months.filter((i) => monthMidDay(i) >= view[0] && monthMidDay(i) < view[1]);
    const scale = mode === "share" ? SHARE_SCALE : niceScale(0, Math.max(0, ...visible.map(sumAt)), 4);
    /** Each fuel's lower and upper edge per month, in the chart's units (percent, or million kWh). */
    const stackedValues = () => {
      const out = {} as Record<FuelKey, Map<number, { lo: number; hi: number }>>;
      const below = new Map<number, number>(months.map((i) => [i, 0]));
      for (const k of FUEL_KEYS) {
        out[k] = new Map();
        for (const i of months) {
          const v = mode === "share" ? ((m[k][i] as number) / sumAt(i)) * 100 : (m[k][i] as number);
          const lo = below.get(i) as number;
          out[k].set(i, { lo, hi: lo + v });
          below.set(i, lo + v);
        }
      }
      return out;
    };
    const smallVals = m.small.filter((_, i) => monthMidDay(i) >= view[0] && monthMidDay(i) < view[1]);
    const smallScale = scaleOver(smallVals, 3, false);
    return [
      {
        id: "stack",
        hatchOnTop: true,
        caption: mode === "share" ? ["Share of utility-scale net generation, percent", "Share of generation, percent"] : ["Utility-scale net generation, terawatthours per month", "Generation, TWh per month"],
        h: 230,
        hCompact: 180,
        scale,
        fmtTick: mode === "share" ? (t) => (t === 0 ? "0" : `${t}%`) : fmtTwhTick,
        render: ({ X, Y }) => {
          const stacked = stackedValues();
          return (
            <>
              {FUEL_KEYS.map((k) => {
                const gen = area<number>()
                  .x((i) => X(monthMidDay(i)))
                  .y0((i) => Y(stacked[k].get(i)!.lo))
                  .y1((i) => Y(stacked[k].get(i)!.hi));
                return <path key={k} d={gen(months) ?? ""} fill={FUELS[k].color} stroke="var(--surface)" strokeWidth={0.6} strokeOpacity={0.7} />;
              })}
            </>
          );
        },
        // Band names sit inside their band where it is thick enough, otherwise in the right gutter (wide charts), never under the preliminary hatch.
        renderLabels: ({ X, Y, ml, pw, prelimX, compact }) => {
          const stacked = stackedValues();
          const inView = months.filter((i) => monthMidDay(i) >= view[0] && monthMidDay(i) < view[1]);
          const placed = placeBandLabels(
            FUEL_KEYS.map((k) => ({
              key: k,
              width: FUELS[k].short.length * 6.2 + 8,
              samples: inView.map((i) => ({ x: X(monthMidDay(i)), y0: Y(stacked[k].get(i)!.lo), y1: Y(stacked[k].get(i)!.hi) })),
            })),
            { maxX: prelimX, gutterX: ml + pw + 8, useGutter: !compact },
          );
          return (
            <g pointerEvents="none">
              {FUEL_KEYS.map((k) => {
                const l = placed.get(k);
                if (!l) return null;
                return l.inside ? (
                  <text key={k} x={l.x} y={l.y + 4} textAnchor="middle" style={SEGMENT_LABEL_STYLE}>{FUELS[k].short}</text>
                ) : (
                  <g key={k}>
                    <rect x={l.x - 6} y={l.y - 4} width={4} height={8} rx={1} fill={FUELS[k].color} />
                    <text x={l.x} y={l.y + 4} className="fill-ink text-[11px]">{FUELS[k].short}</text>
                  </g>
                );
              })}
            </g>
          );
        },
      },
      {
        id: "small",
        caption: ["Small-scale solar (estimated, from January 2014; not in the stack above), terawatthours per month", "Small-scale solar (estimated, from 2014; not in the stack), TWh a month", "Small-scale solar (estimated), TWh a month"],
        h: 90,
        hCompact: 80,
        scale: smallScale,
        fmtTick: fmtTwhTick,
        render: ({ X, Y, ml, top, bottom }) => {
          const gen = line<{ day: number; value: number | null }>().defined((p) => p.value !== null).x((p) => X(p.day)).y((p) => Y(p.value as number));
          const zoneEnd = X(Math.min(view[1], monthStartDay(smallFirst < 0 ? 1e6 : smallFirst)));
          const zoneW = zoneEnd - ml;
          return (
            <>
              {zoneW > 0 && (
                <g>
                  <rect x={ml} y={top} width={zoneW} height={bottom - top} fill="var(--ink)" fillOpacity={0.045} />
                  {zoneW >= 200 && <text x={ml + zoneW / 2} y={(top + bottom) / 2 + 4} textAnchor="middle" className="fill-ink-muted text-[11px]">Estimates begin in January 2014</text>}
                </g>
              )}
              <path d={gen(monthPoints(m.small)) ?? ""} fill="none" stroke="var(--fuel-solar)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </>
          );
        },
        extremes: { points: monthPoints(m.small), label: (val, month) => `${month}: ${fmtTwh(val)}` },
        dotsAt: (day) => [{ day: monthMidDay(monthOfDay(day)), value: monthlyAt(m.small, day), color: "var(--fuel-solar)" }],
      },
    ];
  }, [m, view, mode, last, smallFirst]);

  const day = activeDay(v);
  const month = Math.min(day !== null ? monthOfDay(day) : last, last);
  const term = termAtDay(payload.terms, monthStartDay(month));
  const gasShare = m.total[month] ? ((m.gas[month] as number) / (m.total[month] as number)) * 100 : null;
  const readout = `${monthLabel(month)} · ${fmtTwh(m.total[month] as number)} · Gas ${gasShare === null ? "—" : `${gasShare.toFixed(0)}%`}${isPreliminary(payload, "total", month) ? " (preliminary)" : ""}${term ? ` · ${termLabel(term)}` : ""}`;

  return (
    <EnergyCardShell
      id="electricity"
      title="Where U.S. electricity comes from"
      desc="Net generation by source, utility-scale, monthly: each fuel’s share of the total or its amount. Small-scale solar is estimated separately and drawn on its own line."
      readout={readout}
      chart={
        <>
          <div className="mb-2.5 w-fit">
            <PillGroup options={MODES} value={mode} onChange={setMode} ariaLabel="Electricity chart measure" />
          </div>
          <EnergyChart
            panels={panels}
            era={era}
            view={view}
            flags={flags}
            prelim={prelim}
            rightGutter={78}
            ariaLabel="Utility-scale electricity net generation by source, monthly, as a share of the total or in terawatthours, with small-scale solar estimated on its own line below, two laws marked, presidential terms and recessions. The same data is in the table below."
            legend={
              <Legend>
                {[...FUEL_KEYS].reverse().map((k) => (
                  <span key={k} className="inline-flex items-center gap-1 whitespace-nowrap"><Swatch color={FUELS[k].color} />{FUELS[k].label}</span>
                ))}
                <span className="inline-flex items-center gap-1 whitespace-nowrap"><LineKey color="var(--fuel-solar)" />Small-scale solar (estimated)</span>
                <CommonKey prelim={prelim !== null} flags />
              </Legend>
            }
            renderTip={(d) => {
              const mo = Math.min(monthOfDay(d), last);
              if (mo < 0) return null;
              const tot = m.total[mo] as number | null;
              const t = termAtDay(payload.terms, monthStartDay(mo));
              return (
                <div className="flex min-w-[13rem] flex-col gap-0.5 text-[0.78rem]">
                  <div className="opacity-75">{monthLabel(mo)}</div>
                  {[...FUEL_KEYS].reverse().map((k) => {
                    const val = m[k][mo];
                    return (
                      <div key={k} className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-1.5"><Swatch color={FUELS[k].color} />{FUELS[k].label}</span>
                        <span className="font-mono">{val == null ? "—" : `${fmtTwh(val)}${tot ? ` · ${((val / tot) * 100).toFixed(1)}%` : ""}`}</span>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between gap-3 font-medium"><span>Total</span><span className="font-mono">{tot == null ? "—" : fmtTwh(tot)}</span></div>
                  {m.small[mo] != null && <div className="flex items-center justify-between gap-3"><span>Small-scale solar (est.)</span><span className="font-mono">{fmtTwh(m.small[mo] as number)}</span></div>}
                  {t && <div className="opacity-75">{termLabel(t)}</div>}
                  <div className="opacity-60">{statusText(isPreliminary(payload, "total", mo))}</div>
                </div>
              );
            }}
          />
        </>
      }
      notes={
        <>
          <p>
            Energy Information Administration, Monthly Energy Review: net generation, all sectors, <em>utility-scale only</em>. That table leaves out small-scale solar
            (rooftop panels and similar), which EIA estimates separately from 2014; in 2025 it was about a quarter of all solar generation, so solar and the total are understated in the stack
            from 2014. The two are not spliced into one series because they come from different EIA tables and the estimate has no history before 2014. “Other” is the total minus the six named fuels, so it
            holds petroleum, biomass, geothermal, waste, pumped storage and other gases, and the stack always adds back to the total. Through 1988 the table covered electric utilities only; the chart begins in 1991.
          </p>
          <p>
            Not seasonally adjusted, so shares swing with the seasons (gas and hydro most). The hatched stretch is the current and previous calendar year, which EIA treats as preliminary
            until its annual figures. This is context, not a score: how much of each fuel runs is set by prices, demand, weather, plant lifetimes and years-long build cycles. The 2022 Inflation Reduction Act
            and the 2025 reconciliation law (which ends credits for wind and solar) mark when Congress acted; they enable or constrain building years later and do not explain any month’s mix.
          </p>
        </>
      }
      tables={
        <>
          <MonthTable
            caption="Utility-scale net generation by source and estimated small-scale solar, million kilowatthours (equal to thousand megawatthours), by month"
            from={Math.max(0, m.coal.findIndex((x) => x !== null))}
            to={last}
            columns={[
              ...FUEL_KEYS.map((k) => ({ label: FUELS[k].label, get: (i: number) => String(m[k][i] ?? "—") })),
              { label: "Total", get: (i) => String(m.total[i] ?? "—") },
              { label: "Small-scale solar (est.)", get: (i) => String(m.small[i] ?? "—") },
            ]}
            status={(i) => statusText(isPreliminary(payload, "total", i))}
          />
          <FlagsTable flags={flags} lastReviewed={payload.flagsReviewed} caption="Electricity actions marked on the chart" />
        </>
      }
    />
  );
}
