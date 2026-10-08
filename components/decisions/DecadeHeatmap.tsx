"use client";

import { useMemo } from "react";
import { decadeCells, decadeInWindow, decadesOf, fmtInt, heatCount, heatCountMax, type AreaRow } from "@/lib/decisions-derive";
import { ALL_AREAS, BAND_COLORS, type AreaSortKey } from "@/lib/decisions-types";
import { useDecisionsActions, useDecisionsValues } from "./DecisionsState";

/** What a cell shows, picked by the card's one toggle: how many cases, how many split 5-4, or how many were unanimous. */
const MEASURES: Record<AreaSortKey, { band: number | null; noun: string }> = {
  n: { band: null, noun: "cases decided" },
  f: { band: 4, noun: "split 5–4" },
  u: { band: 0, noun: "were unanimous" },
};

/**
 * The companion to the issue-area rows: issue areas down the side (same order as the rows), decades across. The card's one
 * toggle picks the measure for both charts, in the same numbers as the rows: cases decided (accent), cases that split 5–4, or
 * cases that were unanimous (those two in their band's colour). The rows show a whole window; this shows when. Darker = more
 * cases, on one scale for every area (the busiest decade of any one) with "All issue areas" on its own, being several times any
 * area. A click picks the area for the whole page (the dropdown's value);
 * decades outside the years window fade; a picked area dims the other rows (a comparison chart highlights, rule 4).
 */
export function DecadeHeatmap({ rows, measure }: { rows: readonly AreaRow[]; measure: AreaSortKey }) {
  const { data, range, area } = useDecisionsValues();
  const { setArea } = useDecisionsActions();
  const { band, noun } = MEASURES[measure];
  const counts = band === null;
  const decades = useMemo(() => decadesOf(data), [data]);
  const grid = useMemo(() => rows.map((r) => ({ row: r, cells: decadeCells(data, r.index) })), [data, rows]);
  const color = band === null ? "var(--accent)" : BAND_COLORS[band];

  return (
    <div>
      <p className="m-0 mb-2 text-[0.78rem] text-ink-muted">By decade, every year of data</p>
      <div role="grid" aria-label={`${counts ? "Cases decided" : `Cases that ${noun}`}, by issue area and decade`} className="grid gap-px [--heat-label:6rem] min-[520px]:[--heat-label:minmax(5.5rem,8.5rem)]" style={{ gridTemplateColumns: `var(--heat-label) repeat(${decades.length}, minmax(0, 1fr))` }}>
        <div role="row" className="contents">
          <span />
          {decades.map((dec) => (
            <span key={dec} role="columnheader" className={`pb-1 text-center font-mono text-[0.62rem] text-ink-faint ${decadeInWindow(dec, range) ? "" : "opacity-40"}`}>
              <span className="hidden min-[520px]:inline">{dec}s</span>
              <span className="min-[520px]:hidden">{`’${String(dec).slice(2)}`}</span>
            </span>
          ))}
        </div>
        {grid.map(({ row, cells }) => {
          const dim = area !== ALL_AREAS && row.index >= 0 && row.index !== area;
          const select = () => setArea(row.index < 0 || row.index === area ? ALL_AREAS : row.index);
          return (
            <div key={row.id} role="row" className={`contents ${dim ? "opacity-45" : ""}`}>
              <button
                type="button"
                onClick={select}
                aria-pressed={row.index === area}
                title={row.label}
                className={`line-clamp-2 pr-1.5 text-left text-[0.7rem] leading-[1.05rem] text-ink hover:underline min-[520px]:truncate min-[520px]:text-[0.74rem] min-[520px]:leading-[1.9rem] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus ${row.index === area ? "font-semibold" : ""}`}
              >
                {row.label}
              </button>
              {cells.map((c) => {
                // Counts, the same numbers as the rows on the right; an area-decade with no cases is an empty outlined cell.
                const v = c.total > 0 ? heatCount(c, band) : null;
                const inWin = decadeInWindow(c.decade, range);
                const strength = v === null ? 0 : v / heatCountMax(data, row.index, band);
                const title =
                  c.total === 0
                    ? `${row.label}, ${c.decade}s: no cases`
                    : band === null
                      ? `${row.label}, ${c.decade}s: ${fmtInt(c.total)} cases decided`
                      : `${row.label}, ${c.decade}s: ${fmtInt(c.bucket[band])} of ${fmtInt(c.total)} cases ${noun}`;
                return (
                  <button
                    key={c.decade}
                    type="button"
                    role="gridcell"
                    onClick={select}
                    title={title}
                    aria-label={title}
                    className={`h-[2.1rem] min-w-0 rounded-[3px] p-0 text-center font-mono text-[0.58rem] tabular-nums min-[520px]:h-[1.9rem] min-[520px]:text-[0.62rem] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${inWin ? "" : "opacity-40"} ${v === null ? "border border-dashed border-line-strong bg-transparent text-ink-faint" : "border-0"}`}
                    style={v === null ? undefined : { background: `color-mix(in oklab, ${color} ${Math.round(strength * 100)}%, var(--surface))`, color: strength > 0.5 ? (band === null ? "var(--accent-ink)" : "#fff") : "var(--ink)" }}
                  >
                    {v === null ? "" : <CountText n={v} />}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          0
          <i aria-hidden className="inline-block h-2.5 w-24 rounded-[2px]" style={{ background: `linear-gradient(to right, var(--surface), ${color})`, border: "1px solid var(--line)" }} />
          busiest decade
        </span>
        <span>
          {counts ? "Cases decided" : `Cases that ${noun}`}, per decade; “All issue areas” is shaded on its own scale.
        </span>
      </div>
    </div>
  );
}

/** A case count: "1,055" where the cell is wide, "1.1k" on a phone, where nine columns share the width. */
function CountText({ n }: { n: number }) {
  if (n < 1000) return <>{n}</>;
  return (
    <>
      <span className="max-[519px]:hidden">{fmtInt(n)}</span>
      <span className="min-[520px]:hidden">{`${(n / 1000).toFixed(1)}k`}</span>
    </>
  );
}
