"use client";

import { useMemo, useState } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { LEGEND_ITEM, LEGEND_ROW } from "@/components/charts/legend";
import { ReversibleSortToggle } from "@/components/charts/SortToggle";
import { StackedRows, type StackedRowData } from "@/components/charts/StackedRows";
import { Swatch, TableView } from "@/components/decisions/shared";
import { MethodologyNote } from "@/components/MethodologyNote";
import { ordinal } from "@/lib/demographics-chart";
import { fmtInt } from "@/lib/decisions-derive";
import { ALL_GROUPS, ALL_ROW, SUPPORT_COLORS, SUPPORT_LABELS, SUPPORT_SHORT, bandShare, groupInFilter, openYear, groupRows, groupSelected, nextGroupSort, type GroupSort, type GroupSortKey } from "@/lib/laws-derive";
import { LawsHeatmap, BAR_ROW_H } from "./LawsHeatmap";
import { EmptyWindow } from "./shared";
import { useLawsActions, useLawsValues } from "./LawsState";

const SORTS: { key: GroupSortKey; label: string; hint: string }[] = [
  { key: "n", label: "Laws", hint: "Law counts in the heatmap; most laws first" },
  { key: "f", label: "Narrow votes", hint: "Laws whose closest recorded vote had under 60% yes, in the heatmap; largest share first" },
  { key: "u", label: "No recorded vote", hint: "Laws with no recorded vote in either chamber, in the heatmap; largest share first" },
];

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Card 3: one row per topic group, a 100% bar of the five support bands over the Congresses in the window, law count at right
 * (a comparison chart, so a selection dims the other rows instead of removing them, rule 4), beside a decade heatmap of the same
 * groups. One toggle picks the heatmap's measure and orders both sides; clicking the active key reverses it. Clicking a group on
 * either side sets the page's policy area (the dropdown's value); clicking it again, or "All policy areas", clears it.
 */
export function LawsGroupsCard() {
  const { data, group, major, window: win } = useLawsValues();
  const { setGroup } = useLawsActions();
  const [sort, setSort] = useState<GroupSort>({ key: "n", reversed: false });
  const rows = useMemo(() => groupRows(data, win, major, sort), [data, win, major, sort]);
  const stacked = useMemo<StackedRowData[]>(
    () =>
      rows.map((r) => ({
        id: r.id,
        label: r.label,
        total: fmtInt(r.total),
        selected: r.id !== ALL_ROW && groupSelected(data, group, r.id),
        dimmed: group !== ALL_GROUPS && r.id !== ALL_ROW && !groupInFilter(data, group, r.id),
        segments: [0, 1, 2, 3, 4].map((k) => ({
          value: bandShare(r, k),
          color: SUPPORT_COLORS[k]!,
          title: `${r.label}: ${SUPPORT_LABELS[k]}, ${pct(bandShare(r, k))} (${fmtInt(r.bands[k]!)} of ${fmtInt(r.total)})`,
        })),
      })),
    [rows, group, data],
  );
  const click = (id: string) => setGroup(id === ALL_ROW || groupSelected(data, group, id) ? ALL_GROUPS : id);
  const empty = win[0] > win[1];
  const from = data.congresses[win[0]] ?? 0;
  const to = data.congresses[win[1]] ?? 0;
  const span = empty ? "" : `${openYear(from)}\u2013${openYear(to) + 1}`;
  const all = rows[0]!;
  const noRecorded = all.total ? all.bands[0]! / all.total : 0;

  return (
    <ChartCard
      tight
      title="Which kinds of laws pass, and how?"
      lede="Left: how many laws, how many passed on a narrow vote or how many had no recorded vote, in each decade, by policy area. Right: how broadly each area's laws were supported, over the years shown. The toggle picks the measure for the heatmap and orders both; click it again to reverse. Click a policy area in either to filter the charts and the list."
      action={<ReversibleSortToggle ariaLabel="Sort policy areas" options={SORTS} active={sort.key} reversed={sort.reversed} onSelect={(k) => setSort((cur) => nextGroupSort(cur, k))} />}
    >
      {empty ? (
        <EmptyWindow majorThrough={data.majorThrough} />
      ) : (
        <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <LawsHeatmap rows={rows} measure={sort.key} />
          <div className="min-w-0">
            <p className="m-0 mb-2 text-[0.78rem] text-ink-muted">{`Years shown: ${span}`}</p>
            <div className={`mb-px flex items-end lg:h-6 ${LEGEND_ROW} pb-1`} aria-label="Support bands">
              {[0, 1, 2, 3, 4].map((k) => (
                <span key={k} className={LEGEND_ITEM}>
                  <Swatch color={SUPPORT_COLORS[k]!} />
                  {SUPPORT_SHORT[k]}
                </span>
              ))}
            </div>
            {/* Phones scroll the rows inside a fixed-height box (rule 11a); from `lg` all of them show (about a dozen rows is not a long list). */}
            <div className="relative max-h-[28rem] overflow-y-auto overscroll-contain touch-scroll lg:max-h-none lg:overflow-visible" tabIndex={0} aria-label="Policy areas, one row each">
              <StackedRows rows={stacked} scaleMax={1} onRowClick={click} rowClass={BAR_ROW_H} ariaLabel="Policy areas by how broadly their laws were supported" emptyText="No laws in these years." />
            </div>
          </div>
        </div>
      )}
      <MethodologyNote>
        <p>
          Policy areas are Congress.gov&rsquo;s own, grouped into {data.groups.length - 1} topic groups plus &ldquo;Not classified&rdquo; (the 1970s laws it never gave a current area, shown rather than guessed); small groups swing by several points on a few laws. A bar is the closest recorded final-passage vote of each law in the years shown, so a law is only as broadly supported as its narrowest vote; across them all, {pct(noRecorded)} had no recorded vote in either chamber, passed by voice vote or unanimous consent or with no method stated. The heatmap counts laws (all, those under 60% yes, or those with no recorded vote, as the toggle says) on one scale, except &ldquo;All policy areas&rdquo;, which has its own; the {data.partial[data.partial.length - 1] ? `last decade is partial (the ${ordinal(data.congresses[data.congresses.length - 1]!)} Congress is in session)` : "decades follow the Congresses that opened in them"}.{major ? ` Major laws are assessed through the ${ordinal(data.majorThrough)} Congress.` : ""}
        </p>
      </MethodologyNote>
      <TableView
        label="Table of policy areas by how broadly their laws were supported"
        head={["Policy area", "Laws", ...SUPPORT_SHORT]}
        rows={rows.map((r) => [r.label, r.total, ...r.bands])}
      />
    </ChartCard>
  );
}
