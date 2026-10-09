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
import { ALL_GROUPS, ALL_ROW, GROUP_KEY_FOR_BAND, SUPPORT_COLORS, SUPPORT_LABELS, SUPPORT_ORDER, SUPPORT_SHORT, bandShare, groupInFilter, openYear, groupRows, groupSelected, nextGroupSort, type GroupSort, type GroupSortKey } from "@/lib/laws-derive";
import { LawsHeatmap, BAR_ROW_H } from "./LawsHeatmap";
import { EmptyWindow } from "./shared";
import { useLawsActions, useLawsValues } from "./LawsState";

const SORTS: { key: GroupSortKey; label: string; hint: string }[] = [
  { key: "n", label: "Laws", hint: "Law counts in the heatmap; most laws first" },
  { key: "f", label: "Under 60%", hint: "Laws whose closest recorded vote had under 60% yes, in the heatmap; largest share first" },
  { key: "u", label: "Voice vote", hint: "Laws passed by voice vote or consent in both chambers, in the heatmap; largest share first" },
  { key: "m", label: "60\u201375%", hint: "Laws whose closest recorded vote had 60\u201375% yes; largest share first" },
  { key: "h", label: "75\u201390%", hint: "Laws whose closest recorded vote had 75\u201390% yes; largest share first" },
  { key: "b", label: "90%+", hint: "Laws whose closest recorded vote had 90% or more yes; largest share first" },
];
/** The toggle's three slots, Laws, the middle vote measure and Voice vote; a middle band picked in the page's vote filter takes over the middle slot from Under 60%. */
const middleKey = (key: GroupSortKey): GroupSortKey => (key === "m" || key === "h" || key === "b" ? key : "f");
const slotKeys = (key: GroupSortKey): GroupSortKey[] => ["n", middleKey(key), "u"];
const DIM_BAND = "var(--line-strong)";

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Card 3: one row per topic group, a 100% bar of the five support bands over the Congresses in the window, law count at right
 * (a comparison chart, so a selection dims the other rows instead of removing them, rule 4), beside a decade heatmap of the same
 * groups. One toggle picks the heatmap's measure and orders both sides; clicking the active key reverses it. Clicking a group on
 * either side sets the page's policy area (the dropdown's value); clicking it again, or "All policy areas", clears it.
 */
export function LawsGroupsCard() {
  const { data, group, major, band, window: win } = useLawsValues();
  const { setGroup } = useLawsActions();
  const [pick, setSort] = useState<GroupSort>({ key: "n", reversed: false });
  // The page's vote filter locks the measure to that band (the user's own pick returns when it is cleared); the order can still be reversed.
  const locked = band !== null;
  const sort = useMemo<GroupSort>(() => (band === null ? pick : { key: GROUP_KEY_FOR_BAND[band]!, reversed: pick.reversed }), [band, pick]);
  const rows = useMemo(() => groupRows(data, win, major, sort), [data, win, major, sort]);
  const stacked = useMemo<StackedRowData[]>(
    () =>
      rows.map((r) => ({
        id: r.id,
        label: r.label,
        total: fmtInt(r.total),
        selected: r.id !== ALL_ROW && groupSelected(data, group, r.id),
        dimmed: group !== ALL_GROUPS && r.id !== ALL_ROW && !groupInFilter(data, group, r.id),
        segments: SUPPORT_ORDER.map((k) => ({
          value: bandShare(r, k),
          color: band === null || band === k ? SUPPORT_COLORS[k]! : DIM_BAND,
          title: `${r.label}: ${SUPPORT_LABELS[k]}, ${pct(bandShare(r, k))} (${fmtInt(r.bands[k]!)} of ${fmtInt(r.total)})`,
        })),
      })),
    [rows, group, data, band],
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
      lede={`Left: how many laws, how many passed with under 60% yes or by voice vote or consent, in each decade, by policy area. Right: how broadly each area's laws were supported, over the years shown. The toggle picks the measure for the heatmap and orders both; click it again to reverse.${locked ? " The vote filter in the bar above has set the measure to that band; clear it there to choose another." : ""} Click a policy area in either to filter the charts and the list.`}
      action={
        <ReversibleSortToggle
          ariaLabel="Sort policy areas"
          options={slotKeys(sort.key).map((k) => SORTS.find((o) => o.key === k)!).map((o) => (locked && o.key !== sort.key ? { ...o, disabled: true, hint: "Clear the vote filter to change the measure" } : o))}
          active={sort.key}
          reversed={sort.reversed}
          onSelect={(k) => setSort((cur) => nextGroupSort(locked ? { key: sort.key, reversed: cur.reversed } : cur, k))}
        />
      }
    >
      {empty ? (
        <EmptyWindow majorThrough={data.majorThrough} />
      ) : (
        <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <LawsHeatmap rows={rows} measure={sort.key} />
          <div className="min-w-0">
            <p className="m-0 mb-2 text-[0.78rem] text-ink-muted">{`Years shown: ${span}`}</p>
            <div className={`mb-px flex items-end lg:h-6 ${LEGEND_ROW} pb-1`} aria-label="Support bands">
              {SUPPORT_ORDER.map((k) => (
                <span key={k} className={`${LEGEND_ITEM} ${band !== null && band !== k ? "opacity-50" : ""}`}>
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
          Each bar splits a policy area&rsquo;s laws by support band; across all areas, {pct(noRecorded)} passed by voice vote or consent. Small areas swing by several points on a few laws. Heatmap cells share one colour scale, except &ldquo;All policy areas&rdquo;, which has its own{data.partial[data.partial.length - 1] ? `; the last decade is partial (the ${ordinal(data.congresses[data.congresses.length - 1]!)} Congress is in session)` : ""}.
        </p>
      </MethodologyNote>
      <TableView
        label="Table of policy areas by how broadly their laws were supported"
        head={["Policy area", "Laws", ...SUPPORT_ORDER.map((k) => SUPPORT_SHORT[k]!)]}
        rows={rows.map((r) => [r.label, r.total, ...SUPPORT_ORDER.map((k) => r.bands[k]!)])}
      />
    </ChartCard>
  );
}
