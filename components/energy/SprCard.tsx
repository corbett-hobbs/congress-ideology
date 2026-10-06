"use client";

import { useMemo } from "react";
import { line } from "d3-shape";
import { dateText, flagsForCard, fmtMillionBarrels, sprAt, termAtDay } from "@/lib/energy-derive";
import { dateOfDay } from "@/lib/indicator-time";
import type { EnergyPayload } from "@/lib/energy-types";
import { termLabel } from "@/lib/trade-chart";
import { EnergyChart, type Panel } from "./EnergyChart";
import { activeDay, useEnergyValues } from "./EnergyState";
import { CommonKey, EnergyCardShell, FlagsTable, Legend, LineKey, scaleOver } from "./shared";

const fmtTick = (v: number) => (v === 0 ? "0" : String(v / 1000));
const fmtShort = (v: number) => `${(v / 1000).toFixed(1)}M bbl`;

/**
 * Card 1: the Strategic Petroleum Reserve, weekly, with the curated drawdown, exchange and refill actions marked and
 * each flag naming its authority. The one series that is close to presidential, and still shared with Congress.
 */
export function SprCard({ payload, view }: { payload: EnergyPayload; view: readonly [number, number] }) {
  const v = useEnergyValues();
  const flags = useMemo(() => flagsForCard(payload.flags, "spr"), [payload.flags]);
  const era = useMemo(() => ({ span: payload.span, rec: payload.rec, terms: payload.terms, control: payload.control }), [payload]);
  const panels = useMemo<Panel[]>(() => {
    const pts = payload.spr.map(([day, value]) => ({ day, value }));
    const scale = scaleOver(pts.filter((p) => p.day >= view[0] && p.day < view[1]).map((p) => p.value), 4, false);
    return [
      {
        id: "spr",
        h: 240,
        hCompact: 190,
        scale,
        fmtTick,
        render: ({ X, Y }) => {
          const gen = line<{ day: number; value: number }>().x((p) => X(p.day)).y((p) => Y(p.value));
          return <path d={gen(pts) ?? ""} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />;
        },
        extremes: { points: pts, label: (val, month) => `${month}: ${fmtShort(val)}` },
        dotsAt: (day) => {
          const r = sprAt(payload.spr, day);
          return r ? [{ day: r.day, value: r.value, color: "var(--ink)" }] : [];
        },
      },
    ];
  }, [payload.spr, view]);

  const day = activeDay(v);
  const latest = payload.spr[payload.spr.length - 1];
  const at = sprAt(payload.spr, day ?? latest[0]);
  const term = at ? termAtDay(payload.terms, at.day) : undefined;
  const readout = at ? `Week ending ${dateText(isoOfDay(at.day))} · ${fmtMillionBarrels(at.value)}${term ? ` · ${termLabel(term)}` : ""}` : "";

  const rows = useMemo(() => {
    const byYear = new Map<number, { last: number; low: number; high: number }>();
    for (const [d, val] of payload.spr) {
      const y = dateOfDay(d).year;
      const r = byYear.get(y);
      if (!r) byYear.set(y, { last: val, low: val, high: val });
      else {
        r.last = val;
        r.low = Math.min(r.low, val);
        r.high = Math.max(r.high, val);
      }
    }
    return [...byYear.entries()].sort((a, b) => a[0] - b[0]);
  }, [payload.spr]);

  return (
    <EnergyCardShell
      id="spr"
      title="The Strategic Petroleum Reserve"
      desc={
        <>
          Crude oil held in underground salt caverns, weekly, in millions of barrels. Releases, exchanges and refills are marked where they were
          authorized; the label says who acted and what happened to the oil.
        </>
      }
      readout={readout}
      chart={
        <EnergyChart
          panels={panels}
          era={era}
          view={view}
          flags={flags}
          prelim={null}
          ariaLabel={`Strategic Petroleum Reserve crude oil stocks, weekly, in million barrels, with ${flags.length} actions marked, presidential terms and recessions. The same data is in the table below.`}
          legend={
            <Legend>
              <span className="inline-flex items-center gap-1 whitespace-nowrap"><LineKey color="var(--ink)" />Reserve level, million barrels</span>
              <CommonKey prelim={false} flags />
            </Legend>
          }
          renderTip={(d) => {
            const r = sprAt(payload.spr, d);
            const t = termAtDay(payload.terms, d);
            if (!r) return null;
            return (
              <div className="flex min-w-[10rem] flex-col gap-0.5 text-[0.78rem]">
                <div className="opacity-75">Week ending {dateText(isoOfDay(r.day))}</div>
                <div className="font-mono text-[0.95rem] font-medium">{fmtMillionBarrels(r.value)}</div>
                {t && <div className="opacity-75">{termLabel(t)}</div>}
              </div>
            );
          }}
        />
      }
      notes={
        <>
          <p>
            Stock reading at the end of each week from the Energy Information Administration, which takes it from the Department of Energy’s inventory;
            it is a level, not a flow, and there is no preliminary stretch. The level is shared between presidents and Congress: presidents authorize
            emergency drawdowns and exchanges, while Congress mandates sales, cancels them and sets appropriations. A sale sells the oil;
            an exchange lends it, to be returned later with a premium; a refill buys oil or takes back what was lent. The 2026 drawdown is an exchange, with a stated plan to replace the barrels, so
            the lower level is not a sale. A date marks when an action was authorized, which is not always when the barrels moved.
          </p>
          <p>
            Actions come from a hand-curated list checked against Department of Energy and Federal Register pages. The 1991 Desert Storm sale falls
            before the first weekly reading shown here, and the 2005 and 2011 sales are not yet marked because their months are unconfirmed.
          </p>
        </>
      }
      tables={
        <>
          <div className="mt-2 max-h-72 overflow-auto">
            <table className="w-full border-collapse text-left text-[0.75rem] tabular-nums">
              <caption className="sr-only">Strategic Petroleum Reserve crude oil stocks by year, in million barrels</caption>
              <thead className="sticky top-0 bg-surface-raised">
                <tr className="font-mono text-[0.65rem] uppercase tracking-[0.05em] text-ink-muted">
                  <th scope="col" className="px-2 py-1.5">Year</th>
                  <th scope="col" className="px-2 py-1.5">Last reading</th>
                  <th scope="col" className="px-2 py-1.5">Low</th>
                  <th scope="col" className="px-2 py-1.5">High</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([y, r]) => (
                  <tr key={y} className="border-t border-line">
                    <th scope="row" className="px-2 py-1 font-normal">{y}</th>
                    <td className="px-2 py-1">{(r.last / 1000).toFixed(1)}</td>
                    <td className="px-2 py-1">{(r.low / 1000).toFixed(1)}</td>
                    <td className="px-2 py-1">{(r.high / 1000).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <FlagsTable flags={flags} lastReviewed={payload.flagsReviewed} caption="Strategic Petroleum Reserve actions marked on the chart" />
        </>
      }
    />
  );
}

const isoOfDay = (day: number) => {
  const { year, month, day: d } = dateOfDay(day);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};
