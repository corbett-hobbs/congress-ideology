"use client";

import { STAGES, stageVar, type StageCounts } from "@/lib/committee-bills-derive";
import type { Stage } from "@/lib/committee-bills-types";
import { fmtInt } from "@/lib/decisions-derive";
import { FOCUS_RING, pct } from "./shared";

export type StageView = "stop" | "reach";

/**
 * The six steps as tiles: how many bills stopped at each (their furthest step), with a bar for the share. They are also the
 * stage filter and the legend for the colours in the charts: a tile picks that stage, a second click clears it. "Got at least
 * this far" is the flow chart's top row, not a second tile view.
 */
export function StageTiles({ counts, pick, onPick }: { counts: StageCounts; pick: Stage | null; onPick: (k: Stage | null) => void }) {
  const total = counts.reach[1] ?? 0;
  const n = counts.stop;
  return (
    <div>
      <div className="mb-2">
        <span className="font-mono text-[0.62rem] uppercase tracking-[0.06em] text-ink-faint">Furthest step reached in this committee</span>
      </div>
      <div role="group" aria-label="Filter by step" className="grid grid-cols-3 gap-2 lg:grid-cols-6">
        {STAGES.map((s) => {
          const v = n[s.k] ?? 0;
          const on = pick === s.k;
          return (
            <button
              key={s.k}
              type="button"
              aria-pressed={on}
              title={s.hint}
              onClick={() => onPick(on ? null : s.k)}
              className={`rounded-md border border-t-[3px] px-2.5 pb-2 pt-1.5 text-left hover:bg-surface-raised ${FOCUS_RING} ${on ? "border-ink bg-surface-raised shadow-[inset_0_0_0_1px_var(--ink)]" : "border-line bg-surface"}`}
              style={{ borderTopColor: stageVar(s.k) }}
            >
              <span className="block font-serif text-[1.3rem] font-medium leading-[1.15] tabular-nums max-sm:text-[1.1rem]">{fmtInt(v)}</span>
              <span className="mt-px block text-[0.72rem] leading-tight text-ink">{s.label}</span>
              <span className="mt-px block text-[0.66rem] tabular-nums text-ink-muted">
                {pct(v, total)}
                {s.k === 4 && counts.discharged > 0 ? ` · ${fmtInt(counts.discharged)} discharged` : ""}
              </span>
              <span aria-hidden className="mt-1.5 block h-1 overflow-hidden rounded-sm bg-line">
                <i className="block h-full" style={{ width: `${v > 0 ? Math.max((v / (total || 1)) * 100, 2) : 0}%`, background: stageVar(s.k) }} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
