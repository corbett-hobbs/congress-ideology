"use client";

import { useMemo, useState } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { LegendToggle } from "@/components/charts/LegendToggle";
import { LEGEND_ITEM, LEGEND_ROW } from "@/components/charts/legend";
import { PillGroup } from "@/components/charts/PillGroup";
import { StackedBars, type StackColumn, type StackSeries } from "@/components/charts/StackedBars";
import { MethodologyNote } from "@/components/MethodologyNote";
import { areaCells, areaFilterLabel, areaSeries, presidentSegments, fmtInt, sumBucket, windowIndexes } from "@/lib/decisions-derive";
import { ALL_AREAS, BAND_LONG, type Bucket } from "@/lib/decisions-types";
import { useDecisionsActions, useDecisionsValues } from "./DecisionsState";
import { Swatch, TableView, TooltipCard, chiefLine } from "./shared";

interface Col extends StackColumn {
  term: number;
  all: number;
}

/** Seven validated, pairwise-separable colours (the electricity fuels'); the last is "Other areas". */
const FILLS = ["var(--fuel-coal)", "var(--fuel-gas)", "var(--fuel-nuclear)", "var(--fuel-hydro)", "var(--fuel-wind)", "var(--fuel-solar)", "var(--fuel-other)"];
type Mode = "count" | "share";

/**
 * Card 1: argued cases decided per term, stacked by issue area (the six biggest areas, then Other areas), narrowed by the
 * years window, the issue area and the dissent band picked on card 2 (rule 4). Legend entries filter: a click picks that
 * issue area for the whole page (the dropdown's value) and a second click clears it. Peak and low are re-picked from what
 * is drawn (rule 12), the presidential-term band runs under the axis (rule 10j), and the crosshair and pin are shared with card 2.
 */
export function CasesCard() {
  const { data, range, area, band, hover, pin } = useDecisionsValues();
  const { moveHover, leaveHover, togglePin, clearPin, setArea } = useDecisionsActions();
  const [mode, setMode] = useState<Mode>("count");
  const every = useMemo(() => areaSeries(data), [data]);
  const fills = useMemo(() => new Map(every.map((s, i) => [s.id, FILLS[i]])), [every]);

  // The series drawn: all seven, or just the picked area (in its own colour; any area outside the six wears Other's).
  const series = useMemo<StackSeries[]>(() => {
    if (area === ALL_AREAS) return every.map((s) => ({ id: s.id, label: s.label, fill: fills.get(s.id)! }));
    const hit = every.find((s) => s.area === area);
    if (hit) return [{ id: hit.id, label: hit.label, fill: fills.get(hit.id)! }];
    return [{ id: data.areas[area].id, label: data.areas[area].label, fill: FILLS[FILLS.length - 1] }];
  }, [area, every, fills, data.areas]);

  const { terms, cols } = useMemo(() => {
    const [a, b] = windowIndexes(data, range);
    const val = (bk: Bucket) => (band === null ? sumBucket(bk) : bk[band]);
    const rows: Col[] = [];
    for (let ti = a; ti <= b; ti++) {
      const values: Record<string, number> = {};
      for (const s of series) {
        const src = every.find((e) => e.id === s.id)?.area ?? area;
        values[s.id] = val(areaCells(data, src)[ti]);
      }
      const total = series.reduce((t, s) => t + values[s.id], 0);
      rows.push({ key: String(data.terms[ti]), label: String(data.terms[ti]), term: data.terms[ti], total, values, denom: val(data.all[ti]), all: val(data.all[ti]) });
    }
    return { terms: rows.map((r) => r.term), cols: rows };
  }, [data, range, band, series, every, area]);

  const segs = useMemo(() => presidentSegments(data, terms), [data, terms]);
  const first = cols[0];
  const last = cols[cols.length - 1];
  const lede =
    cols.length === 0
      ? ""
      : cols.length === 1
        ? `${fmtInt(first.total)} cases decided in the ${first.term} term.`
        : `${fmtInt(first.total)} cases decided in ${first.term}, ${fmtInt(last.total)} in ${last.term}.`;
  const filters = [area !== ALL_AREAS ? `Issue area: ${areaFilterLabel(data, area)}.` : "", band !== null ? `Only cases with ${BAND_LONG[band].toLowerCase()}.` : ""].filter(Boolean).join(" ");
  const filtered = area !== ALL_AREAS;

  return (
    <ChartCard
      tight
      title="How many cases does the Court decide?"
      lede={[lede, filters].filter(Boolean).join(" ")}
      action={
        <PillGroup
          ariaLabel="Cases measure"
          value={mode}
          onChange={setMode}
          options={[
            { value: "count", label: "Number of cases" },
            { value: "share", label: "Share of term" },
          ]}
        />
      }
    >
      <StackedBars
        columns={cols}
        series={series}
        mode={mode}
        highlight={null}
        selectedKey={pin === null ? null : String(pin)}
        onSelect={(k) => (k === null ? clearPin() : togglePin(Number(k)))}
        selectedStyle="line"
        fitShare
        markShare={filtered}
        terms={segs}
        activeKey={hover === null ? null : String(hover)}
        onActive={(k) => (k === null ? leaveHover() : moveHover(Number(k)))}
        yearTicks
        marginTop={20}
        unit="cases decided"
        ariaLabel="Stacked bar chart of the number of argued cases the Supreme Court decided, one bar per term, by issue area"
        renderTooltip={(c) => (
          <TooltipCard title={`${c.term} term`} sub={chiefLine(data, c.term)}>
            <div>
              {fmtInt(c.total)} cases{band !== null ? ` with ${BAND_LONG[band].toLowerCase()}` : " decided"}
              {filtered && c.all ? ` (${Math.round((c.total / c.all) * 100)}% of the term)` : ""}
            </div>
            {[...series].reverse().map((s) =>
              (c.values[s.id] ?? 0) > 0 ? (
                <div key={s.id}>
                  <Swatch color={s.fill} /> {s.label}: {fmtInt(c.values[s.id])}
                </div>
              ) : null,
            )}
          </TooltipCard>
        )}
      />
      <div className={`mt-2 ${LEGEND_ROW}`}>
        {every.map((s, i) => (
          <LegendToggle key={s.id} active={area === s.area} dimmed={area !== ALL_AREAS && area !== s.area} onClick={() => setArea(area === s.area ? ALL_AREAS : s.area)}>
            <span className={LEGEND_ITEM}>
              <Swatch color={FILLS[i]} />
              {s.label}
            </span>
          </LegendToggle>
        ))}
      </div>
      <MethodologyNote>
        <p>
          Orally argued cases only, counted in the term they were decided (October to June). Summary reversals and the {fmtInt(data.unclearVotes)} cases whose vote the Supreme Court Database marks unclear are left out. The six biggest of the database’s 14 issue areas get a colour; “Other areas” holds the rest and the {fmtInt(data.unclassified)} cases with no area. The band under the axis marks the president in office for most of each term.
        </p>
      </MethodologyNote>
      <TableView
        label="Table of cases decided per term, by issue area"
        head={["Term", "Cases", ...series.map((s) => s.label)]}
        rows={[...cols].reverse().map((c) => [c.term, c.total, ...series.map((s) => c.values[s.id] ?? 0)])}
      />
    </ChartCard>
  );
}

