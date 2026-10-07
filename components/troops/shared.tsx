"use client";

import type { ReactNode } from "react";
import { LEGEND_ITEM, LEGEND_ROW } from "@/components/charts/legend";
import { TABLE_TOGGLE } from "@/components/charts/table-toggle";
import { LegendToggle } from "@/components/charts/LegendToggle";
import { REGIONS, regionLegendLabel } from "@/lib/troops-regions";
import { BRANCH_NAMES, BRANCH_VARS } from "@/lib/troops-derive";

export const branchColor = (k: number) => `var(${BRANCH_VARS[k]})`;
/** The part of a figure with no branch split (the 2006-07 estimates): a neutral grey, never one of the branch colours. */
export const NO_SPLIT = "color-mix(in oklab, var(--ink) 25%, transparent)";
/** Show the no-split segment only when it is a visible share of the figure (not a rounding remainder). */
export const showRest = (rest: number, value: number) => value > 0 && rest / value > 0.02;

/** The table-view fallback every chart gets: native <details> around a scrollable table. */
export function TableView({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <details className="mt-3 text-[0.8rem] text-ink-muted">
      <summary className={TABLE_TOGGLE}>View as table</summary>
      <div className="mt-2 max-h-60 overflow-auto rounded-md border border-line">
        <table className="w-full min-w-[30rem] border-collapse text-right">
          <caption className="sr-only">{caption}</caption>
          {children}
        </table>
      </div>
    </details>
  );
}

export const TH = "sticky top-0 border-b border-line-strong bg-surface-raised px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.05em] text-ink-faint first:text-left";
export const TD = "border-b border-line px-2.5 py-1 font-mono text-ink first:text-left";

export function Swatch({ color }: { color: string }) {
  return <i className="inline-block h-[10px] w-[10px] rounded-[2px]" style={{ background: color }} />;
}

/** Legend for the region stack: all six regions, or just the one a Country filter leaves. */
export function RegionLegend({ only, picked = null, onPick, children }: { only?: string | null; picked?: string | null; onPick?: (id: string) => void; children?: ReactNode }) {
  const shown = only ? REGIONS.filter((r) => r.id === only) : REGIONS;
  return (
    <div className={`mt-2.5 ${LEGEND_ROW}`}>
      {shown.map((r) =>
        onPick && !only ? (
          <LegendToggle key={r.id} active={picked === r.id} dimmed={picked !== null && picked !== r.id} onClick={() => onPick(r.id)}>
            <Swatch color={r.color} />
            {regionLegendLabel(r)}
          </LegendToggle>
        ) : (
          <span key={r.id} className={LEGEND_ITEM}>
            <Swatch color={r.color} />
            {regionLegendLabel(r)}
          </span>
        ),
      )}
      {children}
    </div>
  );
}

/** Legend for the branch split on the ranked list. */
export function BranchLegend() {
  return (
    <div className={`mt-2.5 ${LEGEND_ROW}`}>
      {BRANCH_NAMES.map((n, k) => (
        <span key={n} className={LEGEND_ITEM}>
          <Swatch color={branchColor(k)} />
          {n}
        </span>
      ))}
    </div>
  );
}
