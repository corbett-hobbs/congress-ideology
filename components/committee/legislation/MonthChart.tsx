"use client";

import { useMemo } from "react";
import { StackedBars, type StackColumn, type StackSeries } from "@/components/charts/StackedBars";
import { Swatch, TableView, TooltipCard } from "@/components/decisions/shared";
import { STAGES, stageVar, type MonthColumn } from "@/lib/committee-bills-derive";
import { fmtInt } from "@/lib/decisions-derive";

type Col = StackColumn & MonthColumn;
const SERIES: StackSeries[] = STAGES.map((s) => ({ id: String(s.k), label: s.label, fill: stageVar(s.k) }));

/**
 * Bills referred each month, stacked by the furthest step they reached (`charts/StackedBars`; the stage tiles are its legend).
 * A month is a filter: select a bar to narrow the list to that month's referrals. The latest month is still filling in, so it
 * is hatched and left out of the peak and low labels.
 */
export function MonthChart({ columns, month, onMonth }: { columns: readonly MonthColumn[]; month: string | null; onMonth: (m: string | null) => void }) {
  const partial = useMemo(() => new Set(columns.length > 0 ? [columns[columns.length - 1]!.key] : []), [columns]);
  return (
    <div>
      <StackedBars<Col>
        columns={columns}
        series={SERIES}
        mode="count"
        highlight={null}
        selectedKey={month}
        onSelect={onMonth}
        partialKeys={partial}
        marginTop={22}
        heights={{ narrow: 200, wide: 230 }}
        unit="bills referred"
        ariaLabel="Stacked bar chart of the bills referred to this committee each month, split by the furthest step they reached"
        renderTooltip={(c) => (
          <TooltipCard title={c.label} sub={`${fmtInt(c.total)} ${c.total === 1 ? "bill" : "bills"} referred`}>
            {STAGES.filter((s) => (c.values[String(s.k)] ?? 0) > 0)
              .reverse()
              .map((s) => (
                <div key={s.k} className="flex items-center justify-between gap-4">
                  <span className="inline-flex items-center gap-1.5">
                    <Swatch color={stageVar(s.k)} />
                    {s.label}
                  </span>
                  <span>{fmtInt(c.values[String(s.k)]!)}</span>
                </div>
              ))}
          </TooltipCard>
        )}
      />
      <TableView
        label="Bills referred each month by furthest step, as a table"
        head={["Month", "Referred", ...STAGES.slice(1).map((s) => s.label), "Total"]}
        rows={[...columns].reverse().map((c) => [c.label, ...STAGES.map((s) => c.values[String(s.k)] ?? 0), c.total])}
      />
    </div>
  );
}
