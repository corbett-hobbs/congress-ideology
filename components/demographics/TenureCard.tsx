"use client";

import { useMemo } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { LEGEND_ITEM, LEGEND_ROW } from "@/components/charts/legend";
import { StackedBars, type StackColumn, type StackSeries } from "@/components/charts/StackedBars";
import { fmtShare } from "@/lib/chart-bars";
import { MethodologyNote } from "@/components/MethodologyNote";
import { congressSpan, presidentById, readoutRow, termSegmentsFor } from "@/lib/demographics-chart";
import { TENURE_LABELS, type DemoCongress, type DemoPresident } from "@/lib/demographics-types";
import { CongressReadout, Swatch, TableView, TooltipCard } from "./shared";

interface Col extends StackColumn {
  row: DemoCongress;
}
const SERIES: StackSeries[] = TENURE_LABELS.map((label, i) => ({ id: `t${i}`, label, fill: `var(--tenure-${i + 1})` }));
const valuesOf = (r: DemoCongress) => Object.fromEntries(r.tenure.map((n, i) => [`t${i}`, n]));

export function TenureCard({ rows, presidents, pin, onPin }: { rows: readonly DemoCongress[]; presidents: readonly DemoPresident[]; pin: number | null; onPin: (c: number | null) => void }) {
  const by = presidentById(presidents);
  const cols = useMemo<Col[]>(() => rows.map((r) => ({ key: String(r.congress), label: String(r.year), total: r.seats, values: valuesOf(r), row: r })), [rows]);
  const segs = useMemo(() => termSegmentsFor(rows, presidents), [rows, presidents]);
  const cur = readoutRow(rows, pin);
  const line = cur && {
    values: TENURE_LABELS.map((l, i) => `${l} ${fmtShare(cur.tenure[i] / (cur.seats || 1))}`),
    date: congressSpan(cur),
    term: by.get(cur.termId)?.president,
  };
  return (
    <ChartCard title="How long have members been in Congress?" lede="Share of members in each Congress, grouped by how many years they have served, counting the current Congress.">
      <CongressReadout line={line} pinned={pin !== null && !!cur && cur.congress === pin} onClear={() => onPin(null)} />
      <StackedBars
        columns={cols}
        series={SERIES}
        mode="share"
        highlight={null}
        selectedKey={pin === null ? null : String(pin)}
        onSelect={(k) => onPin(k === null ? null : Number(k))}
        selectedStyle="line"
        fitShare
        unit="members"
        terms={segs}
        ariaLabel="Stacked bar chart of members by Congresses served, one bar per Congress"
        renderTooltip={(c) => (
          <TooltipCard title={congressSpan(c.row)} sub={by.get(c.row.termId)?.president ? `${by.get(c.row.termId)?.president} was president on the first day` : undefined}>
            {TENURE_LABELS.map((l, i) => (
              <div key={l}>
                <Swatch color={SERIES[i].fill} /> {l}: {fmtShare(c.row.tenure[i] / (c.row.seats || 1))} ({c.row.tenure[i]})
              </div>
            ))}
          </TooltipCard>
        )}
      />
      <div className={`mt-2 ${LEGEND_ROW}`}>
        {SERIES.map((s) => (
          <span key={s.id} className={LEGEND_ITEM}>
            <Swatch color={s.fill} />
            {s.label}
          </span>
        ))}
      </div>
      <MethodologyNote>
        <p>
          Time in office counts the Congresses a member served in either chamber, gaps and service before 1933 included, at two years each (up to 2 years is a first Congress, 3&ndash;10 years is two to five). Every bar is 100%.
        </p>
      </MethodologyNote>
      <TableView
        head={["Congress", "Years", "Members", ...TENURE_LABELS.map((l) => `${l} (share)`)]}
        rows={[...rows].reverse().map((r) => [`${r.congress}th`, `${r.year}–${r.year + 1}`, r.seats, ...r.tenure.map((n) => fmtShare(n / (r.seats || 1)))])}
      />
    </ChartCard>
  );
}
