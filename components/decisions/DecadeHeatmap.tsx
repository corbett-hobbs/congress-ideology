"use client";

import { useMemo, useState } from "react";
import { PillGroup } from "@/components/charts/PillGroup";
import { decadeCells, decadeInWindow, decadesOf, fmtInt, fmtPct, HEAT_MIN_CASES, heatMax, heatValue, type AreaRow } from "@/lib/decisions-derive";
import { ALL_AREAS, BAND_COLORS } from "@/lib/decisions-types";
import { useDecisionsActions, useDecisionsValues } from "./DecisionsState";

type Measure = "split" | "unanimous";
const MEASURES: Record<Measure, { band: number; label: string; noun: string }> = {
  split: { band: 4, label: "5–4 share", noun: "split 5–4" },
  unanimous: { band: 0, label: "Unanimous share", noun: "were unanimous" },
};

/**
 * The companion to the issue-area rows: issue areas down the side (same order as the rows), decades across, each cell
 * shaded by the share of that area's cases that split 5–4 (or were unanimous). The rows show a whole window; this shows when. One solid colour
 * (the band's own), darker = higher, on a single scale for every cell so they compare. Cells with fewer than
 * `HEAT_MIN_CASES` cases are outlined, not shaded. A click picks the area for the whole page (the dropdown's value);
 * decades outside the years window fade; a picked area dims the other rows (a comparison chart highlights, rule 4).
 */
export function DecadeHeatmap({ rows }: { rows: readonly AreaRow[] }) {
  const { data, range, area } = useDecisionsValues();
  const { setArea } = useDecisionsActions();
  const [measure, setMeasure] = useState<Measure>("split");
  const { band, noun } = MEASURES[measure];
  const decades = useMemo(() => decadesOf(data), [data]);
  const top = useMemo(() => heatMax(data, band), [data, band]);
  const grid = useMemo(() => rows.map((r) => ({ row: r, cells: decadeCells(data, r.index) })), [data, rows]);
  const color = BAND_COLORS[band];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-[0.78rem] text-ink-muted">By decade, every year of data</p>
        <PillGroup
          ariaLabel="Heatmap measure"
          value={measure}
          onChange={setMeasure}
          options={[
            { value: "split", label: MEASURES.split.label },
            { value: "unanimous", label: MEASURES.unanimous.label },
          ]}
        />
      </div>
      <div role="grid" aria-label={`Share of cases that ${noun}, by issue area and decade`} className="grid gap-px" style={{ gridTemplateColumns: `minmax(5.5rem,8.5rem) repeat(${decades.length}, minmax(0, 1fr))` }}>
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
                className={`truncate pr-2 text-left text-[0.74rem] leading-[1.9rem] text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus ${row.index === area ? "font-semibold" : ""}`}
              >
                {row.label}
              </button>
              {cells.map((c) => {
                const v = heatValue(c, band);
                const inWin = decadeInWindow(c.decade, range);
                const strength = v === null ? 0 : v / top;
                const title =
                  c.total === 0
                    ? `${row.label}, ${c.decade}s: no cases`
                    : `${row.label}, ${c.decade}s: ${fmtPct(c.bucket[band] / c.total)} ${noun} (${fmtInt(c.bucket[band])} of ${fmtInt(c.total)} cases)${v === null ? `. Fewer than ${HEAT_MIN_CASES} cases, so too few to shade.` : ""}`;
                return (
                  <button
                    key={c.decade}
                    type="button"
                    role="gridcell"
                    onClick={select}
                    title={title}
                    aria-label={title}
                    className={`h-[1.9rem] min-w-0 rounded-[3px] p-0 text-center font-mono text-[0.62rem] tabular-nums focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${inWin ? "" : "opacity-40"} ${v === null ? "border border-dashed border-line-strong bg-transparent text-ink-faint" : "border-0"}`}
                    style={v === null ? undefined : { background: `color-mix(in oklab, ${color} ${Math.round(strength * 100)}%, var(--surface))`, color: strength > 0.5 ? "#fff" : "var(--ink)" }}
                  >
                    {c.total === 0 ? "" : v === null ? "·" : Math.round(v * 100)}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          0%
          <i aria-hidden className="inline-block h-2.5 w-24 rounded-[2px]" style={{ background: `linear-gradient(to right, var(--surface), ${color})`, border: "1px solid var(--line)" }} />
          {Math.round(top * 100)}%
        </span>
        <span>
          Share of cases that {noun}. A dot (·) marks fewer than {HEAT_MIN_CASES} cases.
        </span>
      </div>
    </div>
  );
}
