"use client";

import { memo, type ReactNode } from "react";
import { PinReadout } from "@/components/charts/PinReadout";
import { TABLE_TOGGLE } from "@/components/charts/table-toggle";
import { MethodologyNote } from "@/components/MethodologyNote";
import { LEGEND_ITEM, LEGEND_ROW } from "@/components/charts/legend";
import { AUTHORITY_LABEL, dateText, KIND_LABEL, laggedNote, monthLabel } from "@/lib/energy-derive";
import { monthStartDay, niceScale, type Scale } from "@/lib/trade-chart";
import type { EnergyFlag, EnergyPayload, MonthlyKey } from "@/lib/energy-types";
import { monthIndexOfDay } from "@/lib/indicator-time";
import { useEnergyActions, useEnergyValues } from "./EnergyState";

export const monthMidDay = (i: number) => monthStartDay(i) + 14;

/** One monthly array as chart points (mid-month), nulls kept as gaps. */
export const monthPoints = (a: readonly (number | null)[]) => a.map((value, i) => ({ day: monthMidDay(i), value }));

/** The last month index with a value, or -1. */
export const lastIndexOf = (a: readonly (number | null)[]) => {
  for (let i = a.length - 1; i >= 0; i--) if (a[i] !== null) return i;
  return -1;
};

/** The preliminary stretch of the keys on a card, in axis days: from the earliest boundary to the end of the newest month. */
export function prelimBand(payload: Pick<EnergyPayload, "prelim" | "monthly">, keys: readonly MonthlyKey[]): { from: number; to: number } | null {
  const starts = keys.map((k) => payload.prelim[k]).filter((v): v is number => v !== undefined);
  if (!starts.length) return null;
  const last = Math.max(...keys.map((k) => lastIndexOf(payload.monthly[k])));
  return { from: monthStartDay(Math.min(...starts)), to: monthStartDay(last + 1) };
}

/** A round scale that holds every value in the window (always including 0), so an axis follows what is on screen (rule 10d). */
export function scaleOver(values: readonly (number | null)[], count = 4, includeLo = true): Scale {
  let lo = 0;
  let hi = 0;
  for (const v of values) {
    if (v === null) continue;
    if (v > hi) hi = v;
    if (includeLo && v < lo) lo = v;
  }
  return niceScale(lo, hi, count);
}

export const monthRangeOfView = (view: readonly [number, number]): [number, number] => [monthIndexOfDay(view[0]), monthIndexOfDay(view[1] - 1)];

export const Swatch = ({ color, border }: { color: string; border?: boolean }) => (
  <span aria-hidden className="inline-block size-2.5" style={{ background: color, border: border ? "1px solid var(--line)" : undefined }} />
);

export const LineKey = ({ color, dash }: { color: string; dash?: boolean }) => (
  <svg width="20" height="8" aria-hidden><line x1="0" x2="20" y1="4" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dash ? "4 3" : undefined} /></svg>
);

/** The legend items every card ends with: preliminary hatch, an action marker and recessions. */
export function CommonKey({ prelim, flags }: { prelim: boolean; flags: boolean }) {
  return (
    <>
      {prelim && (
        <span className={LEGEND_ITEM}>
          <svg width="14" height="10" aria-hidden>
            <defs>
              <pattern id="legend-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="5" style={{ stroke: "var(--ink)", strokeWidth: 1.2, strokeOpacity: 0.35 }} />
              </pattern>
            </defs>
            <rect width="14" height="10" fill="url(#legend-hatch)" stroke="var(--line)" />
          </svg>
          Preliminary, may be revised
        </span>
      )}
      {flags && (
        <span className={LEGEND_ITEM}>
          <svg width="12" height="10" aria-hidden><line x1="6" x2="6" y1="0" y2="10" stroke="var(--accent)" strokeWidth="1.4" /><circle cx="6" cy="3" r="2.8" fill="var(--accent)" /></svg>
          Policy action
        </span>
      )}
      <span className={LEGEND_ITEM}><Swatch color="color-mix(in srgb, var(--ink) 9%, transparent)" border />Recession (NBER)</span>
    </>
  );
}

export function Legend({ children }: { children: ReactNode }) {
  return <div className={`mt-2.5 ${LEGEND_ROW}`}>{children}</div>;
}

/** The phone readout line wired to `EnergyState`. */
export function Readout({ line }: { line: string }) {
  const { pin } = useEnergyValues();
  const { clearPin } = useEnergyActions();
  return <PinReadout line={line} pinned={pin !== null} onClear={clearPin} />;
}

/** The card chrome shared by all four sections. */
export function EnergyCardShell({
  id,
  title,
  desc,
  readout,
  chart,
  notes,
  tables,
  small = false,
}: {
  id: string;
  title: string;
  desc: ReactNode;
  readout: string;
  chart: ReactNode;
  notes: ReactNode;
  tables: ReactNode;
  small?: boolean;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`min-w-0 scroll-mt-24 rounded-[10px] border border-line bg-surface ${small ? "p-[1.1rem_1.1rem_0.9rem] sm:p-5" : "p-5 sm:p-6"}`}>
      <h2 id={`${id}-title`} className={`m-0 font-serif font-medium leading-tight ${small ? "text-[1.3rem]" : "text-[1.6rem]"}`}>{title}</h2>
      <p className={`m-0 mt-2 leading-[1.5] text-ink-muted ${small ? "text-[0.8rem]" : "text-[0.875rem]"}`}>{desc}</p>
      <Readout line={readout} />
      <div className="mt-3.5">{chart}</div>
      <MethodologyNote>{notes}</MethodologyNote>
      <details className="mt-3">
        <summary className={TABLE_TOGGLE}>View as table</summary>
        {tables}
      </details>
    </section>
  );
}

export interface Column {
  label: string;
  get: (month: number) => string;
}

/** Month-by-month table fallback: one row per month with data, newest first. */
export const MonthTable = memo(function MonthTable({
  caption,
  from,
  to,
  columns,
  status,
}: {
  caption: string;
  from: number;
  to: number;
  columns: readonly Column[];
  /** Status text per month ("Final" / "Preliminary"), if the card has a preliminary stretch. */
  status?: (month: number) => string;
}) {
  const rows: number[] = [];
  for (let m = to; m >= from; m--) rows.push(m);
  return (
    <div className="mt-2 max-h-72 overflow-auto">
      <table className="w-full border-collapse text-left text-[0.75rem] tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-surface-raised">
          <tr className="font-mono text-[0.65rem] uppercase tracking-[0.05em] text-ink-muted">
            <th scope="col" className="px-2 py-1.5">Month</th>
            {columns.map((c) => <th key={c.label} scope="col" className="px-2 py-1.5">{c.label}</th>)}
            {status && <th scope="col" className="px-2 py-1.5">Status</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m} className="border-t border-line">
              <th scope="row" className="whitespace-nowrap px-2 py-1 font-normal">{monthLabel(m)}</th>
              {columns.map((c) => <td key={c.label} className="px-2 py-1">{c.get(m)}</td>)}
              {status && <td className="px-2 py-1">{status(m)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

/** The actions marked on a card: date, action, authority, what it did to the oil (SPR), description. */
export const FlagsTable = memo(function FlagsTable({ flags, lastReviewed, caption }: { flags: readonly EnergyFlag[]; lastReviewed: string; caption: string }) {
  if (!flags.length) return null;
  return (
    <>
      <p className="m-0 mt-3 text-[0.75rem] text-ink-muted">Actions marked on the chart, for screen readers and copying. Last reviewed {dateText(lastReviewed)}.</p>
      <div className="mt-2 max-h-72 overflow-auto">
        <table className="w-full border-collapse text-left text-[0.75rem]">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-surface-raised">
            <tr className="font-mono text-[0.65rem] uppercase tracking-[0.05em] text-ink-muted">
              <th scope="col" className="px-2 py-1.5">Date</th>
              <th scope="col" className="px-2 py-1.5">Action</th>
              <th scope="col" className="px-2 py-1.5">Authority</th>
              <th scope="col" className="px-2 py-1.5">Description</th>
            </tr>
          </thead>
          <tbody>
            {[...flags].sort((a, b) => a.date.localeCompare(b.date)).map((f) => (
              <tr key={f.id} className="border-t border-line align-top">
                <th scope="row" className="whitespace-nowrap px-2 py-1 font-normal tabular-nums">{dateText(f.date)}</th>
                <td className="px-2 py-1">{f.label}</td>
                <td className="px-2 py-1">{[AUTHORITY_LABEL[f.authority], KIND_LABEL[f.kind]].filter(Boolean).join(" · ")}</td>
                <td className="px-2 py-1">{f.description}{f.lagged ? ` ${laggedNote(f.date)}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
});

export const statusText = (prelim: boolean) => (prelim ? "Preliminary, may be revised" : "Final");
