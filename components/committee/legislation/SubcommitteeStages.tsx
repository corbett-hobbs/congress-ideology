"use client";

import { Swatch } from "@/components/decisions/shared";
import { STAGES, stageVar, type SubMixRow } from "@/lib/committee-bills-derive";
import { fmtInt } from "@/lib/decisions-derive";
import { FOCUS_RING } from "./shared";

/** One 100% bar per subcommittee: its bills by the furthest step they reached. A row is the subcommittee filter; the others dim. */
export function SubcommitteeStages({ rows, picked, onPick }: { rows: readonly SubMixRow[]; picked: number | null; onPick: (index: number | null) => void }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.7rem] leading-tight text-ink-muted" aria-hidden>
        {STAGES.map((s) => (
          <span key={s.k} className="inline-flex items-center gap-1 whitespace-nowrap">
            <Swatch color={stageVar(s.k)} />
            {s.label}
          </span>
        ))}
      </div>
      <div tabIndex={0} aria-label="Subcommittees, scrollable" className="touch-scroll relative max-h-[22rem] overflow-y-auto overscroll-contain">
        {rows.map((r) => {
          const on = picked === r.index;
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(on ? null : r.index)}
              className={`grid w-full grid-cols-[minmax(6rem,0.9fr)_minmax(0,1.6fr)_2.6rem] items-center gap-2.5 px-1 py-1 text-left text-[0.76rem] leading-[1.15] hover:bg-surface-raised sm:grid-cols-[minmax(8rem,0.9fr)_minmax(0,2fr)_3rem] ${FOCUS_RING} ${on ? "bg-surface-raised font-medium" : ""} ${picked !== null && !on ? "opacity-40" : ""}`}
            >
              <span>{r.name}</span>
              <span className="flex h-[11px] overflow-hidden rounded-[2px]" aria-hidden>
                {STAGES.map((s) => (r.stop[s.k] ? <i key={s.k} className="block h-full" style={{ width: `${(r.stop[s.k]! / r.total) * 100}%`, background: stageVar(s.k) }} title={`${s.label}: ${r.stop[s.k]}`} /> : null))}
              </span>
              <span className="text-right tabular-nums text-ink-muted">{fmtInt(r.total)}</span>
              <span className="sr-only">{STAGES.filter((s) => r.stop[s.k]).map((s) => `${s.label} ${r.stop[s.k]}`).join(", ")}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
