"use client";

import { useMemo, useState } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { LegendToggle } from "@/components/charts/LegendToggle";
import { LEGEND_ITEM, LEGEND_ROW } from "@/components/charts/legend";
import { PillGroup } from "@/components/charts/PillGroup";
import { StackedBars, type StackColumn, type StackSeries } from "@/components/charts/StackedBars";
import { Swatch, TableView, TooltipCard } from "@/components/decisions/shared";
import { MethodologyNote } from "@/components/MethodologyNote";
import { ordinal } from "@/lib/demographics-chart";
import { fmtInt } from "@/lib/decisions-derive";
import { ALL_GROUPS, OTHER_GROUPS, SUPPORT_LABELS, cellFor, filterLabel, openYear, seriesOf, signedMostSegments } from "@/lib/laws-derive";
import { EmptyWindow, congressSub, congressTitle, congressYears, controlRowsFor } from "./shared";
import { useLawsActions, useLawsValues } from "./LawsState";

interface Col extends StackColumn {
  ci: number;
  congress: number;
  all: number;
}

/** Seven validated, pairwise-separable colours (the electricity fuels'): five topic groups, Other topics, Not classified. */
const FILLS = ["var(--fuel-coal)", "var(--fuel-gas)", "var(--fuel-nuclear)", "var(--fuel-hydro)", "var(--fuel-wind)", "var(--fuel-other)", "var(--fuel-solar)"];
type Mode = "count" | "share";

/**
 * Card 1: public laws enacted per Congress, stacked by topic group, narrowed by the years window, the policy area, "major
 * laws only" and the support band picked on card 2 (rule 4). A legend entry picks that policy area for the whole page (the
 * dropdown's value); a second click clears it. The in-progress Congress is hatched and left out of the peak and low labels,
 * the president under each bar signed most of that Congress's laws, and the House / Senate strips show on request.
 */
export function LawsCountCard() {
  const { data, group, major, band, control, window: win, hover, pin } = useLawsValues();
  const { moveHover, leaveHover, togglePin, clearPin, setGroup } = useLawsActions();
  const [mode, setMode] = useState<Mode>("count");
  const every = useMemo(() => seriesOf(data), [data]);
  const fillOf = useMemo(() => new Map(every.map((s, i) => [s.id, FILLS[i]!])), [every]);

  // The groups behind "Other topics", named under the legend so the grey bar is never unexplained.
  const otherNames = useMemo(() => {
    const names = (every.find((s) => s.id === OTHER_GROUPS)?.groups ?? []).map((id) => data.groups.find((g) => g.id === id)?.label).filter(Boolean) as string[];
    return names.length ? `${names.slice(0, -1).join(", ")}${names.length > 1 ? " and " : ""}${names[names.length - 1]}` : "";
  }, [every, data]);

  // Seven series, or just the picked one (a group inside "Other topics" wears Other's colour).
  const series = useMemo<(StackSeries & { groups: string[] })[]>(() => {
    if (group === ALL_GROUPS) return every.map((s) => ({ id: s.id, label: s.label, fill: fillOf.get(s.id)!, groups: s.groups }));
    const hit = every.find((s) => s.id === group);
    if (hit) return [{ id: hit.id, label: hit.label, fill: fillOf.get(hit.id)!, groups: hit.groups }];
    return [{ id: group, label: filterLabel(data, group), fill: fillOf.get(OTHER_GROUPS)!, groups: [group] }];
  }, [group, every, fillOf, data]);

  const cols = useMemo<Col[]>(() => {
    const rows: Col[] = [];
    const pick = (n: number, bands: readonly number[]) => (band === null ? n : bands[band]!);
    for (let ci = win[0]; ci <= win[1]; ci++) {
      const values: Record<string, number> = {};
      for (const s of series) {
        const c = cellFor(data, ci, new Set(s.groups), major);
        values[s.id] = pick(c.n, c.bands);
      }
      const all = cellFor(data, ci, null, major);
      rows.push({
        key: String(data.congresses[ci]),
        label: String(openYear(data.congresses[ci]!)),
        ci,
        congress: data.congresses[ci]!,
        total: series.reduce((t, s) => t + values[s.id]!, 0),
        values,
        denom: pick(all.n, all.bands),
        all: pick(all.n, all.bands),
      });
    }
    return rows;
  }, [data, win, band, major, series]);

  const segs = useMemo(() => signedMostSegments(data, cols.map((c) => c.ci)), [data, cols]);
  const partialKeys = useMemo(() => new Set(cols.filter((c) => data.partial[c.ci]).map((c) => c.key)), [cols, data]);
  const ctl = controlRowsFor(data, control, win[0], win[1]);

  const noun = `${major ? "major " : ""}laws`;
  const done = cols.filter((c) => !partialKeys.has(c.key));
  const first = cols[0];
  const last = done[done.length - 1] ?? cols[cols.length - 1];
  const windowTotal = cols.reduce((t, c) => t + c.total, 0);
  const lede = !first
    ? ""
    : group === ALL_GROUPS && band === null && !major
      ? cols.length === 1
        ? `${fmtInt(first.total)} laws enacted by the ${ordinal(first.congress)} Congress (${congressYears(data, first.ci)}).`
        : `${fmtInt(first.total)} laws enacted by the ${ordinal(first.congress)} Congress (${congressYears(data, first.ci)}), ${fmtInt(last.total)} by the ${ordinal(last.congress)} (${congressYears(data, last.ci)}).`
      : `${fmtInt(windowTotal)} ${noun} in these years${group === ALL_GROUPS ? "" : `: ${filterLabel(data, group).toLowerCase()}`}${band === null ? "" : `, with ${SUPPORT_LABELS[band]!.toLowerCase()}`}.${major ? ` Major laws are assessed through the ${ordinal(data.majorThrough)} Congress.` : ""}`;
  const filtered = group !== ALL_GROUPS || band !== null || major;
  const ncByCongress = data.counts.map((row) => row.reduce((t, n, ai) => t + (data.areas[ai]!.group === "not-classified" ? n : 0), 0));
  const notClassified = ncByCongress.reduce((a, b) => a + b, 0);
  const ncCongresses = data.congresses.filter((_, i) => ncByCongress[i]! > 0);
  const lastCongress = data.congresses[data.congresses.length - 1]!;

  return (
    <ChartCard
      tight
      title="How many laws does Congress pass?"
      lede={lede || "No laws in this selection."}
      action={
        <PillGroup
          ariaLabel="Laws measure"
          value={mode}
          onChange={setMode}
          options={[
            { value: "count", label: "Number of laws" },
            { value: "share", label: "Share of Congress" },
          ]}
        />
      }
    >
      {cols.length === 0 ? (
        <EmptyWindow majorThrough={data.majorThrough} />
      ) : (
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
          controlRows={ctl}
          partialKeys={partialKeys}
          slotYears={2}
          activeKey={hover === null ? null : String(hover)}
          onActive={(k) => (k === null ? leaveHover() : moveHover(Number(k)))}
          yearTicks
          marginTop={20}
          unit="laws enacted"
          ariaLabel="Stacked bar chart of the public laws enacted, one bar per Congress, by policy area"
          renderTooltip={(c) => (
            <TooltipCard title={congressTitle(data, c.ci)} sub={congressSub(data, c.ci)}>
              <div>
                {fmtInt(c.total)} {noun}
                {band !== null ? ` with ${SUPPORT_LABELS[band]!.toLowerCase()}` : ""}
                {filtered && group !== ALL_GROUPS && c.all ? ` (${Math.round((c.total / c.all) * 100)}% of the Congress)` : ""}
              </div>
              {[...series].reverse().map((s) =>
                (c.values[s.id] ?? 0) > 0 ? (
                  <div key={s.id}>
                    <Swatch color={s.fill} /> {s.label}: {fmtInt(c.values[s.id]!)}
                  </div>
                ) : null,
              )}
            </TooltipCard>
          )}
        />
      )}
      <div className={`mt-2 ${LEGEND_ROW}`}>
        {every.map((s) => (
          <LegendToggle key={s.id} active={group === s.id} dimmed={group !== ALL_GROUPS && group !== s.id} onClick={() => setGroup(group === s.id ? ALL_GROUPS : s.id)}>
            <span className={LEGEND_ITEM}>
              <Swatch color={fillOf.get(s.id)!} />
              {s.label}
            </span>
          </LegendToggle>
        ))}
      </div>
      {otherNames && (
        <p className="mt-1.5 text-[0.8rem] leading-snug text-ink-muted">
          <span className="font-medium text-ink">{every.find((s) => s.id === OTHER_GROUPS)!.label}</span> is {otherNames}.
        </p>
      )}
      <MethodologyNote>
        <p>
          Counts public laws by the Congress that enacted them, from the 93rd (1973) on; private laws and bills that never became law are left out. A law&rsquo;s policy area is the one Congress.gov assigns its bill (one per bill), so a law that touches several topics is counted once. The one exception is &ldquo;Commemorations&rdquo;, which is our own grouping, not Congress.gov&rsquo;s: it used that label in only 1985&ndash;88 and 1997&ndash;2008, so the same kind of law sat under other areas in other years. Here a law counts as a commemoration when Congress.gov filed it there or its title designates a day, week or year, names a building, post office or landmark, awards a medal or coin, or approves a memorial, with the same rule for every year. The page groups Congress.gov&rsquo;s areas into {data.groups.length - 1} topic groups; the five largest get a colour and the rest are &ldquo;Other topics&rdquo;, which the dropdown splits. {fmtInt(notClassified)} laws from the {ordinal(ncCongresses[0]!)} to {ordinal(ncCongresses[ncCongresses.length - 1]!)} Congresses carry no current Congress.gov area, only an older subject term or none, and are shown as &ldquo;Not classified&rdquo; rather than guessed. The {ordinal(lastCongress)} Congress is still in session, so its bar is partial (hatched) and left out of the peak and low labels. The president shown signed most of that Congress&rsquo;s laws; the tooltip lists any split. Major laws are David Mayhew&rsquo;s lists of important enactments, which run through the {ordinal(data.majorThrough)} Congress. Source: Congress.gov, Library of Congress; data through {data.dataThrough}.
        </p>
      </MethodologyNote>
      <TableView
        label="Table of laws enacted per Congress, by topic group"
        head={["Congress", "Opened", "Laws", ...series.map((s) => s.label)]}
        rows={[...cols].reverse().map((c) => [ordinal(c.congress), openYear(c.congress), c.total, ...series.map((s) => c.values[s.id] ?? 0)])}
      />
    </ChartCard>
  );
}
