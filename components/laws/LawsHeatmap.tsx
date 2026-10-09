"use client";

import { useMemo } from "react";
import { ALL_GROUPS } from "@/lib/laws-derive";
import { ALL_ROW, GROUP_MEASURES, decadeCells, decadeInWindow, decadesOf, groupInFilter, groupSelected, heatCount, heatMax, type GroupRow, type GroupSortKey } from "@/lib/laws-derive";
import { SUPPORT_COLORS } from "@/lib/laws-derive";
import { fmtInt } from "@/lib/decisions-derive";
import { useLawsActions, useLawsValues } from "./LawsState";

/** Every row, here and in the bars beside it, is this tall, so the two sides line up from `lg` (`check:laws` asserts it). */
export const ROW_H = "h-[1.9rem]";
/** The same pitch for a `StackedRows` row beside it: the cell plus the 1px grid gap. */
export const BAR_ROW_H = "lg:h-[calc(1.9rem+1px)]";

/**
 * The companion to the topic-group rows: groups down the side (same order as the rows), decades across. The card's one toggle
 * picks the measure: laws enacted (accent), laws passed on a narrow vote or laws passed by voice vote or consent (those two in their
 * band's colour). The rows show a whole window; this shows when. Darker = more laws, on one scale for every group (the busiest
 * decade of any one) with "All policy areas" on its own. A click picks the group for the whole page (the dropdown's value);
 * decades outside the years window fade; a picked group dims the others (a comparison chart highlights, rule 4).
 */
export function LawsHeatmap({ rows, measure }: { rows: readonly GroupRow[]; measure: GroupSortKey }) {
  const { data, group, major, window: win } = useLawsValues();
  const { setGroup } = useLawsActions();
  const { band, noun } = GROUP_MEASURES[measure];
  const counts = band === null;
  const decades = useMemo(() => decadesOf(data), [data]);
  const grid = useMemo(() => rows.map((r) => ({ row: r, cells: decadeCells(data, r.id, major), max: heatMax(data, r.id, band, major) })), [data, rows, major, band]);
  const color = band === null ? "var(--accent)" : SUPPORT_COLORS[band]!;
  const last = decades[decades.length - 1];

  return (
    <div>
      <p className="m-0 mb-2 text-[0.78rem] text-ink-muted">By decade, every Congress of data</p>
      <div role="grid" aria-label={`${counts ? "Laws enacted" : `Laws that ${noun}`}, by policy area and decade`} className="grid gap-y-px [--heat-label:6rem] min-[520px]:[--heat-label:minmax(5.5rem,8.5rem)]" style={{ gridTemplateColumns: `var(--heat-label) repeat(${decades.length}, minmax(0, 1fr))` }}>
        <div role="row" className="contents">
          <span />
          {decades.map((dec) => (
            <span key={dec} role="columnheader" className={`flex h-6 items-end justify-center pb-1 font-mono text-[0.62rem] text-ink-faint ${decadeInWindow(data, dec, win) ? "" : "opacity-40"}`}>
              <span className="hidden min-[520px]:inline">{dec}s</span>
              <span className="min-[520px]:hidden">{`’${String(dec).slice(2)}`}</span>
            </span>
          ))}
        </div>
        {grid.map(({ row, cells, max }) => {
          const dim = group !== ALL_GROUPS && row.id !== ALL_ROW && !groupInFilter(data, group, row.id);
          const on = row.id !== ALL_ROW && groupSelected(data, group, row.id);
          const select = () => setGroup(row.id === ALL_ROW || on ? ALL_GROUPS : row.id);
          return (
            <div key={row.id} role="row" className={`contents ${dim ? "opacity-45" : ""}`}>
              <button
                type="button"
                onClick={select}
                aria-pressed={on}
                title={row.label}
                className={`line-clamp-2 pr-1.5 text-left text-[0.7rem] leading-[1.05rem] text-ink hover:underline min-[520px]:truncate min-[520px]:text-[0.74rem] min-[520px]:leading-[1.9rem] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus ${on ? "font-semibold" : ""}`}
              >
                {row.label}
              </button>
              {cells.map((c) => {
                const v = c.total > 0 ? heatCount(c, band) : null;
                const inWin = decadeInWindow(data, c.decade, win);
                const strength = v === null ? 0 : v / max;
                const partial = c.decade === last && data.partial[data.partial.length - 1];
                const title =
                  c.total === 0
                    ? `${row.label}, ${c.decade}s: no laws`
                    : band === null
                      ? `${row.label}, ${c.decade}s: ${fmtInt(c.total)} laws`
                      : `${row.label}, ${c.decade}s: ${fmtInt(c.bands[band]!)} of ${fmtInt(c.total)} laws ${noun}`;
                return (
                  <button
                    key={c.decade}
                    type="button"
                    role="gridcell"
                    onClick={select}
                    title={partial ? `${title} (the Congress in session is partial)` : title}
                    aria-label={title}
                    className={`${ROW_H} min-w-0 rounded-[3px] p-0 text-center font-mono text-[0.58rem] tabular-nums min-[520px]:text-[0.62rem] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${inWin ? "" : "opacity-40"} ${v === null ? "border border-dashed border-line-strong bg-transparent text-ink-faint" : "border-0"}`}
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
          {counts ? "Laws enacted" : `Laws that ${noun}`}, per decade; &ldquo;All policy areas&rdquo; is shaded on its own scale.
        </span>
      </div>
    </div>
  );
}

/** A law count: "1,055" where the cell is wide, "1.1k" on a phone, where six columns share the width. */
function CountText({ n }: { n: number }) {
  if (n < 1000) return <>{n}</>;
  return (
    <>
      <span className="max-[519px]:hidden">{fmtInt(n)}</span>
      <span className="min-[520px]:hidden">{`${(n / 1000).toFixed(1)}k`}</span>
    </>
  );
}
