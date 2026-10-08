"use client";

import type { ReactNode } from "react";
import { TABLE_TOGGLE } from "@/components/charts/table-toggle";
import { chiefOfTerm } from "@/lib/decisions-derive";
import type { DecisionsPayload } from "@/lib/decisions-types";

/** "View as table": a plain table, newest first for the time series. */
export function TableView({ head, rows, label }: { head: readonly string[]; rows: readonly (readonly (string | number)[])[]; label: string }) {
  return (
    <details className="mt-2">
      <summary className={TABLE_TOGGLE}>View as table</summary>
      <div className="relative mt-2 max-h-[22rem] overflow-auto overscroll-contain touch-scroll" tabIndex={0} aria-label={label}>
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

/** "Chief Justice Earl Warren (appointed by Eisenhower)" for a term, for tooltips: the Chief stays as a secondary label under the presidential band. */
export function chiefLine(d: DecisionsPayload, term: number): string | undefined {
  const c = chiefOfTerm(d, term);
  return c ? `Chief Justice ${c.name} (appointed by ${c.president.split(" ").pop()})` : undefined;
}
