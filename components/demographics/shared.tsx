"use client";

import type { ReactNode } from "react";
import { PinReadout, type PinLine } from "@/components/charts/PinReadout";
import { TABLE_TOGGLE } from "@/components/charts/table-toggle";

/** The pinned Congress's reading above a chart: a line on desktop, `PinReadout` on phones (rule: the pin is shared by all three charts). */
export function CongressReadout({ line, pinned, onClear }: { line: PinLine | null; pinned: boolean; onClear: () => void }) {
  return (
    <>
      {line && (
        <div className="mb-2 hidden sm:block" aria-live="off">
          <p className="m-0 text-[0.85rem] font-medium tabular-nums text-ink">{line.values.join(" · ")}</p>
          <p className="m-0 text-[0.78rem] text-ink-muted">
            {line.date}
            {line.term ? ` · ${line.term}` : ""}
            {pinned ? (
              <>
                {" · "}
                <button type="button" onClick={onClear} className="text-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                  Clear pin
                </button>
              </>
            ) : (
              " · click a Congress to pin it on all three charts"
            )}
          </p>
        </div>
      )}
      <PinReadout line={line} pinned={pinned} onClear={onClear} hint="Tap a Congress to pin it on all three charts." />
    </>
  );
}

/** "View as table": a plain table of the Congresses shown, newest first. */
export function TableView({ head, rows }: { head: readonly string[]; rows: readonly (readonly (string | number)[])[] }) {
  return (
    <details className="mt-2">
      <summary className={TABLE_TOGGLE}>View as table</summary>
      <div className="relative mt-2 max-h-[22rem] overflow-auto overscroll-contain touch-scroll" tabIndex={0} aria-label="Table of the Congresses shown">
        <table className="w-full border-collapse text-left text-[0.75rem] tabular-nums">
          <thead className="sticky top-0 bg-surface-raised">
            <tr>
              {head.map((h) => (
                <th key={h} scope="col" className="whitespace-nowrap px-2 py-1.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r[0])} className="border-t border-line">
                {r.map((c, i) =>
                  i === 0 ? (
                    <th key={i} scope="row" className="whitespace-nowrap px-2 py-1 font-normal">
                      {c}
                    </th>
                  ) : (
                    <td key={i} className="whitespace-nowrap px-2 py-1">
                      {c}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function Swatch({ color }: { color: string }) {
  return <i aria-hidden className="inline-block h-2.5 w-2.5 flex-none rounded-[2px]" style={{ background: color }} />;
}

export function TooltipCard({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="text-[0.78rem] leading-snug">
      <div className="font-semibold">{title}</div>
      {sub && <div className="text-ink-muted">{sub}</div>}
      <div className="mt-1 flex flex-col gap-0.5 tabular-nums">{children}</div>
    </div>
  );
}
