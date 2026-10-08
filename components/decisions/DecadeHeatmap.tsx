"use client";

import { useMemo } from "react";
import { decadeCells, decadeInWindow, decadesOf, fmtInt, fmtPct, HEAT_MIN_CASES, heatCasesMax, heatMax, heatValue, type AreaRow } from "@/lib/decisions-derive";
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
 * toggle picks the measure for both charts: the case count (accent), the share that split 5–4, or the share that were
 * unanimous (those two in their band's colour). The rows show a whole window; this shows when. Darker = higher, on one scale
 * for every cell so they compare (case counts: "All issue areas" on its own scale, being several times any area). Cells with fewer than
 * `HEAT_MIN_CASES` cases are outlined, not shaded. A click picks the area for the whole page (the dropdown's value);
 * decades outside the years window fade; a picked area dims the other rows (a comparison chart highlights, rule 4).
 */
export function DecadeHeatmap({ rows, measure }: { rows: readonly AreaRow[]; measure: AreaSortKey }) {
  const { data, range, area } = useDecisionsValues();
  const { setArea } = useDecisionsActions();
  const { band, noun } = MEASURES[measure];
  const counts = band === null;
  const decades = useMemo(() => decadesOf(data), [data]);
  const top = useMemo(() => (band === null ? 0 : heatMax(data, band)), [data, band]);
  const grid = useMemo(() => rows.map((r) => ({ row: r, cells: decadeCells(data, r.index) })), [data, rows]);
  const color = band === null ? "var(--accent)" : BAND_COLORS[band];

  return (
    <div>
      <p className="m-0 mb-2 text-[0.78rem] text-ink-muted">By decade, every year of data</p>
      <div role="grid" aria-label={`${counts ? "Cases decided" : `Share of cases that ${noun}`}, by issue area and decade`} className="grid gap-px [--heat-label:6rem] min-[520px]:[--heat-label:minmax(5.5rem,8.5rem)]" style={{ gridTemplateColumns: `var(--heat-label) repeat(${decades.length}, minmax(0, 1fr))` }}>
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
                // Counts are exact, so no cell is too thin to shade; shares under HEAT_MIN_CASES cases are outlined instead.
                const v = band === null ? (c.total > 0 ? c.total : null) : heatValue(c, band);
                const thin = band !== null && v === null;
                const inWin = decadeInWindow(c.decade, range);
                const scale = band === null ? heatCasesMax(data, row.index) : top;
                const strength = v === null ? 0 : v / scale;
                const title =
                  c.total === 0
                    ? `${row.label}, ${c.decade}s: no cases`
                    : band === null
                      ? `${row.label}, ${c.decade}s: ${fmtInt(c.total)} cases decided`
                      : `${row.label}, ${c.decade}s: ${fmtPct(c.bucket[band] / c.total)} ${noun} (${fmtInt(c.bucket[band])} of ${fmtInt(c.total)} cases)${thin ? `. Fewer than ${HEAT_MIN_CASES} cases, so too few to shade.` : ""}`;
                return (
                  <button
                    key={c.decade}
                    type="button"
                    role="gridcell"
                    onClick={select}
                    title={title}
                    aria-label={title}
                    className={`h-[2.1rem] min-w-0 rounded-[3px] p-0 text-center font-mono text-[0.58rem] tabular-nums min-[520px]:h-[1.9rem] min-[520px]:text-[0.62rem] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${inWin ? "" : "opacity-40"} ${thin || v === null ? "border border-dashed border-line-strong bg-transparent text-ink-faint" : "border-0"}`}
                    style={v === null ? undefined : { background: `color-mix(in oklab, ${color} ${Math.round(strength * 100)}%, var(--surface))`, color: strength > 0.5 ? (band === null ? "var(--accent-ink)" : "#fff") : "var(--ink)" }}
                  >
                    {c.total === 0 ? "" : v === null ? "·" : counts ? <CountText n={c.total} /> : Math.round(v * 100)}
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
          {counts ? "busiest decade" : `${Math.round(top * 100)}%`}
        </span>
        <span>
          {counts ? "Cases decided; “All issue areas” is shaded on its own scale." : `Share of cases that ${noun}. A dot (·) marks fewer than ${HEAT_MIN_CASES} cases.`}
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
