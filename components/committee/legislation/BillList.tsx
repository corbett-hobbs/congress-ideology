"use client";

import { useState, type UIEvent } from "react";
import type { PreparedBill, SortId } from "@/lib/committee-bills-derive";
import { SORTS } from "@/lib/committee-bills-derive";
import type { CommitteeBillsPayload } from "@/lib/committee-bills-types";
import { fmtInt } from "@/lib/decisions-derive";
import { BillRow, ROW_GRID } from "./BillRow";
import { FOCUS_RING } from "./shared";

const PAGE = 60;

/**
 * Every bill that matches the card's filters, in a fixed-height scrolling box that adds rows as it is scrolled (the executive
 * order and laws list pattern). A row opens to its dated steps, cosponsors and a link to Congress.gov.
 */
export function BillList({ rows, total, payload, sort, onSort, resetKey }: { rows: readonly PreparedBill[]; total: number; payload: CommitteeBillsPayload; sort: SortId; onSort: (s: SortId) => void; /** Anything that should send the list back to its first rows. */ resetKey: string }) {
  const [shown, setShown] = useState<{ key: string; n: number }>({ key: resetKey, n: PAGE });
  const [open, setOpen] = useState<string | null>(null);
  const n = shown.key === resetKey ? shown.n : PAGE;
  const grow = (e: UIEvent<HTMLElement>) => {
    const el = e.currentTarget;
    if (n < rows.length && el.scrollTop + el.clientHeight > el.scrollHeight - 240) setShown({ key: resetKey, n: n + PAGE });
  };
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[0.8rem] text-ink-muted" aria-live="polite">
          <b className="font-medium tabular-nums text-ink">{fmtInt(rows.length)}</b> {rows.length === 1 ? "bill" : "bills"}
          {rows.length !== total ? ` match, of ${fmtInt(total)}` : ""}
        </span>
        <label className="flex items-center gap-2 text-[0.75rem] text-ink-muted">
          <span className="font-mono text-[0.6rem] uppercase tracking-[0.06em] text-ink-faint">Sort</span>
          <select value={sort} onChange={(e) => onSort(e.target.value as SortId)} className={`h-[1.85rem] rounded-md border border-line-strong bg-surface-raised px-2.5 text-[0.8rem] text-ink ${FOCUS_RING}`}>
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div key={resetKey} tabIndex={0} aria-label="Bills referred to this committee, scrollable" onScroll={grow} className="touch-scroll relative max-h-[34rem] overflow-y-auto overscroll-contain rounded-md border border-line max-sm:max-h-[30rem]">
        <div className={`sticky top-0 z-[1] hidden border-b border-line-strong bg-surface-raised px-3 py-1.5 text-[0.64rem] uppercase tracking-[0.04em] text-ink-faint lg:grid ${ROW_GRID.replace("lg:grid ", "")}`}>
          <span>Bill</span>
          <span>Sponsor</span>
          <span>Cosponsors</span>
          <span>Progress in committee</span>
          <span>Latest action</span>
        </div>
        {rows.length === 0 ? (
          <p className="m-0 px-4 py-8 text-center text-[0.82rem] text-ink-muted">No bills match these filters.</p>
        ) : (
          <ol className="m-0 list-none p-0">
            {rows.slice(0, n).map((b) => {
              const id = `${b.row.b}${b.row.n}`;
              return <BillRow key={id} b={b} payload={payload} open={open === id} onToggle={() => setOpen(open === id ? null : id)} />;
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
