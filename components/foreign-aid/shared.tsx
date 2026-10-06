"use client";

import { LEGEND_ITEM, LEGEND_ROW } from "@/components/charts/legend";
import { TABLE_TOGGLE } from "@/components/charts/table-toggle";
import type { ReactNode } from "react";
import { SECTOR_LABEL, SLOT_COUNT, SLOT_NAME, SLOT_VAR, slotOfSector } from "@/lib/foreign-aid-derive";
import { useAidState } from "./ForeignAidState";

export const slotColor = (slot: number) => `var(${SLOT_VAR[slot]})`;

/** Hatch for partial years: surface-colored diagonals over the bar. Give each chart its own `id`. */
export function HatchDefs({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" style={{ stroke: "var(--surface)", strokeWidth: 2.2 }} />
      </pattern>
    </defs>
  );
}

/** Label for the sector currently filtered (or null for all). */
export function useSectorLabel(): string | null {
  const { sector, data } = useAidState();
  if (sector < 0) return null;
  const s = data.payload.sectors[sector];
  return SECTOR_LABEL[s as keyof typeof SECTOR_LABEL] ?? s;
}

/**
 * Bottom legend for any chart colored by sector: the six slots, or just the filtered sector's slot.
 * `extra` adds chart-specific entries (partial year, term band).
 */
export function SectorLegend({ partial = false, children }: { partial?: boolean; children?: ReactNode }) {
  const { sector, data } = useAidState();
  const label = useSectorLabel();
  const others = data.ns - (SLOT_COUNT - 1);
  const slots = sector >= 0 ? [slotOfSector(sector)] : Array.from({ length: SLOT_COUNT }, (_, k) => k);
  return (
    <div className={`mt-2.5 ${LEGEND_ROW}`}>
      {slots.map((k) => (
        <span key={k} className={LEGEND_ITEM} title={k === SLOT_COUNT - 1 && sector < 0 ? "Multi-sector; democracy, human rights, and governance; education and social services; environment" : undefined}>
          <i className="inline-block h-[10px] w-[10px] rounded-[2px]" style={{ background: slotColor(k) }} />
          {sector >= 0 ? label : k === SLOT_COUNT - 1 ? `Other (${others} sectors)` : SLOT_NAME[k]}
        </span>
      ))}
      {partial && (
        <span className={LEGEND_ITEM}>
          <i
            className="inline-block h-[10px] w-[10px] rounded-[2px] border border-line-strong"
            style={{ background: "repeating-linear-gradient(45deg, var(--ink-muted) 0 2px, transparent 2px 5px)" }}
          />
          Partial year
        </span>
      )}
      {children}
    </div>
  );
}

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
