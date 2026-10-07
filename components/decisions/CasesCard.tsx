"use client";

import { useMemo } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { StackedBars, type StackColumn, type StackSeries } from "@/components/charts/StackedBars";
import { MethodologyNote } from "@/components/MethodologyNote";
import { chiefSegments, sumBucket, windowCells, fmtInt } from "@/lib/decisions-derive";
import type { Bucket } from "@/lib/decisions-types";
import { useDecisionsActions, useDecisionsValues } from "./DecisionsState";
import { TableView, TooltipCard, chiefLine } from "./shared";

interface Col extends StackColumn {
  term: number;
  bucket: Bucket;
}

const SERIES: StackSeries[] = [{ id: "cases", label: "Cases decided", fill: "var(--accent)" }];

/**
 * Card 1: argued cases decided per term, one solid accent bar per term, narrowed by the years window and the issue area
 * (rule 4). Peak and low are re-picked from what is drawn (rule 12), the Chief Justice band runs under the axis
 * (rule 10j), and the crosshair and pin are shared with card 2.
 */
export function CasesCard() {
  const { data, range, area, hover, pin } = useDecisionsValues();
  const { moveHover, leaveHover, togglePin, clearPin } = useDecisionsActions();
  const { terms, cells } = useMemo(() => windowCells(data, area, range), [data, area, range]);
  const cols = useMemo<Col[]>(
    () => terms.map((t, i) => ({ key: String(t), label: String(t), total: sumBucket(cells[i]), values: { cases: sumBucket(cells[i]) }, term: t, bucket: cells[i] })),
    [terms, cells],
  );
  const segs = useMemo(() => chiefSegments(data, terms), [data, terms]);
  const areaLabel = area < 0 ? null : data.areas[area].label;
  const first = cols[0];
  const last = cols[cols.length - 1];
  const lede =
    cols.length === 0
      ? ""
      : cols.length === 1
        ? `${fmtInt(first.total)} cases decided in the ${first.term} term.`
        : `${fmtInt(first.total)} cases decided in ${first.term}, ${fmtInt(last.total)} in ${last.term}.`;
  return (
    <ChartCard title="How many cases does the Court decide?" lede={`${lede}${areaLabel ? ` Issue area: ${areaLabel}.` : ""}`}>
      <StackedBars
        columns={cols}
        series={SERIES}
        mode="count"
        highlight={null}
        selectedKey={pin === null ? null : String(pin)}
        onSelect={(k) => (k === null ? clearPin() : togglePin(Number(k)))}
        selectedStyle="line"
        terms={segs}
        activeKey={hover === null ? null : String(hover)}
        onActive={(k) => (k === null ? leaveHover() : moveHover(Number(k)))}
        yearTicks
        unit="cases decided"
        ariaLabel="Bar chart of the number of argued cases the Supreme Court decided, one bar per term"
        renderTooltip={(c) => (
          <TooltipCard title={`${c.term} term`} sub={chiefLine(data, c.term)}>
            <div>{fmtInt(c.total)} cases decided</div>
            <div className="text-ink-muted">{areaLabel ?? "All issue areas"}</div>
          </TooltipCard>
        )}
      />
      <MethodologyNote>
        <p>
          Orally argued cases only (Supreme Court Database decision types 1, 5, 6 and 7): summary reversals and other orders issued without argument are not counted, and {fmtInt(data.unclearVotes)} cases whose vote the database marks unclear are left out. The docket here is cases decided in a term (October to June), not cases filed or granted. Labels name the busiest and quietest terms in the years and issue area shown.
        </p>
        <p>
          The band under the axis marks each Chief Justice, tinted by the party of the president who appointed them to that role: Vinson (Truman) blue; Warren (Eisenhower), Burger (Nixon), Rehnquist (Reagan) and Roberts (G.W. Bush) red.
        </p>
      </MethodologyNote>
      <TableView label="Table of cases decided per term" head={["Term", "Cases"]} rows={[...cols].reverse().map((c) => [c.term, c.total])} />
    </ChartCard>
  );
}
