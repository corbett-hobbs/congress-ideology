"use client";

import { useMemo, useState } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { LegendToggle } from "@/components/charts/LegendToggle";
import { LEGEND_ITEM, LEGEND_ROW } from "@/components/charts/legend";
import { PillGroup } from "@/components/charts/PillGroup";
import { StackedBars, type StackColumn, type StackSeries } from "@/components/charts/StackedBars";
import { fmtShare } from "@/lib/chart-bars";
import { MethodologyNote } from "@/components/MethodologyNote";
import { congressSpan, presidentById, readoutRow, termSegmentsFor, type WomenMeasure } from "@/lib/demographics-chart";
import type { DemoCongress, DemoPresident } from "@/lib/demographics-types";
import { CongressReadout, Swatch, TableView, TooltipCard } from "./shared";

interface Col extends StackColumn {
  row: DemoCongress;
}
const SERIES: (StackSeries & { k: "D" | "R" | "O" })[] = [
  { id: "D", k: "D", label: "Democratic women", fill: "var(--dem)" },
  { id: "R", k: "R", label: "Republican women", fill: "var(--rep)" },
  { id: "O", k: "O", label: "Other women", fill: "var(--oth)" },
];

const womenTotal = (r: DemoCongress) => r.women.D + r.women.R + r.women.O;

export function WomenCard({ rows, presidents, pin, onPin }: { rows: readonly DemoCongress[]; presidents: readonly DemoPresident[]; pin: number | null; onPin: (c: number | null) => void }) {
  const [mode, setModeRaw] = useState<WomenMeasure>("share");
  const [hl, setHl] = useState<string | null>(null);
  // Picking a series draws it alone, from zero, as a count; going back to Share clears the pick (rule 12c).
  const setMode = (m: WomenMeasure) => {
    setModeRaw(m);
    if (m === "share") setHl(null);
  };
  const pick = (id: string) => {
    setHl((cur) => (cur === id ? null : id));
    setModeRaw("count");
  };
  const by = presidentById(presidents);
  // "Other women" is drawn (and listed) only when someone in the years shown is neither a Democrat nor a Republican.
  const series = useMemo(() => (rows.some((r) => r.women.O > 0) ? SERIES : SERIES.filter((s) => s.k !== "O")), [rows]);
  const cols = useMemo<Col[]>(() => rows.map((r) => ({ key: String(r.congress), label: String(r.year), total: womenTotal(r), denom: r.seats, values: { ...r.women }, row: r })), [rows]);
  const segs = useMemo(() => termSegmentsFor(rows, presidents), [rows, presidents]);
  const cur = readoutRow(rows, pin);
  const line = cur && {
    values: [`Women ${fmtShare(womenTotal(cur) / (cur.seats || 1))} of members (${womenTotal(cur)} of ${cur.seats})`, `Dem. ${cur.women.D}`, `Rep. ${cur.women.R}`, ...(cur.women.O ? [`Other ${cur.women.O}`] : [])],
    date: congressSpan(cur),
    term: by.get(cur.termId)?.president,
  };
  return (
    <ChartCard
      title="How many members are women?"
      lede="Women as a share of all members in each Congress, stacked by caucus."
      action={
        <PillGroup
          ariaLabel="Women measure"
          value={mode}
          onChange={setMode}
          options={[
            { value: "share", label: "Share of members" },
            { value: "count", label: "Number of members" },
          ]}
        />
      }
    >
      <CongressReadout line={line} pinned={pin !== null && !!cur && cur.congress === pin} onClear={() => onPin(null)} />
      <StackedBars
        columns={cols}
        series={series}
        mode={mode}
        highlight={hl}
        selectedKey={pin === null ? null : String(pin)}
        onSelect={(k) => onPin(k === null ? null : Number(k))}
        selectedStyle="line"
        fitShare
        markShare
        unit="women"
        terms={segs}
        ariaLabel="Stacked bar chart of women in Congress by caucus, one bar per Congress"
        renderTooltip={(c) => (
          <TooltipCard title={congressSpan(c.row)} sub={by.get(c.row.termId)?.president ? `${by.get(c.row.termId)?.president} was president on the first day` : undefined}>
            <div>
              Women: {womenTotal(c.row)} of {c.row.seats} members ({fmtShare(womenTotal(c.row) / (c.row.seats || 1))})
            </div>
            {series.map((s) => (
              <div key={s.id}>
                <Swatch color={s.fill} /> {s.label}: {c.row.women[s.k]}
              </div>
            ))}
          </TooltipCard>
        )}
      />
      <div className={`mt-2 ${LEGEND_ROW}`}>
        {series.map((s) => (
          <LegendToggle key={s.id} active={hl === s.id} dimmed={hl !== null && hl !== s.id} onClick={() => pick(s.id)}>
            <span className={LEGEND_ITEM}>
              <Swatch color={s.fill} />
              {s.label}
            </span>
          </LegendToggle>
        ))}
      </div>
      <MethodologyNote>
        <p>
          A Congress has more members than the chambers have seats because replacements are counted. The source records gender as male or female only.
        </p>
      </MethodologyNote>
      <TableView
        head={["Congress", "Years", "Members", "Women", "Share", "Dem. women", "Rep. women", "Other women"]}
        rows={[...rows].reverse().map((r) => [`${r.congress}th`, `${r.year}–${r.year + 1}`, r.seats, womenTotal(r), fmtShare(womenTotal(r) / (r.seats || 1)), r.women.D, r.women.R, r.women.O])}
      />
    </ChartCard>
  );
}
