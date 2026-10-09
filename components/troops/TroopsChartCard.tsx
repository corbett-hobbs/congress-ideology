"use client";

import { useMemo, useState } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { LEGEND_ITEM } from "@/components/charts/legend";
import { MethodologyNote } from "@/components/MethodologyNote";
import { REGIONS } from "@/lib/troops-regions";
import { changeVsPrior, formatCount, measureLabel, stackByRegion } from "@/lib/troops-derive";
import { useTroopsState } from "./TroopsState";
import { TroopsChart } from "./TroopsChart";
import { RegionLegend, TD, TH, TableView } from "./shared";

/** "How many troops are stationed abroad": the stacked-bar time series and everything that explains it. */
export function TroopsChartCard() {
  const { data, yi, range, country, measure } = useTroopsState();
  const { periods, years, places } = data.payload;
  const stacks = useMemo(() => stackByRegion(data, measure, range[0], range[1], country), [data, measure, range, country]);
  const [pick, setPick] = useState<string | null>(null);
  const shown = useMemo(() => {
    const k = pick === null ? -1 : REGIONS.findIndex((r) => r.id === pick);
    if (k < 0 || country >= 0) return stacks;
    return stacks.map((s) => {
      const regions = s.regions.map((v, j) => (j === k ? v : 0));
      return { ...s, regions, total: regions[k] };
    });
  }, [stacks, pick, country]);
  const cur = stacks.find((s) => s.yi === yi);
  const change = changeVsPrior(data, measure, yi, country);
  const showing = [country >= 0 ? places[country].name : null, measure > 0 ? measureLabel(measure) : null].filter(Boolean);
  const anyUnavailable = stacks.some((s) => s.unavailable);
  const only = country >= 0 ? places[country].region : null;
  const anyEstimate = stacks.some((x) => periods[x.pi].estimate && !x.unavailable);
  const year = years[yi];
  const p = periods[year.period];
    const when = year.partial ? `${year.fy} (partial, through ${p.label})` : `${year.fy} (${p.snapshot === "june" ? "June" : "Sep"} 30)`;

  const lede = cur?.unavailable ? (
    <>
      {when} · the Army did not report, so there is no {measure === 0 ? "all-branch" : "Army"} figure · active-duty personnel by place of duty
    </>
  ) : (
    <>
      {when} · <b className="font-semibold text-ink">{formatCount(cur?.total ?? 0)}</b> {country >= 0 ? `in ${places[country].name}` : "abroad"}
      {change && ` · ${change.pct > 0 ? "+" : change.pct < 0 ? "−" : ""}${Math.abs(Math.round(change.pct * 1000) / 10)}% vs. ${years[change.prev].fy}`}
      {!change && yi > 0 && !year.partial && !cur?.unavailable && " · no change shown: a different source or definition from the previous bar"}
      {" · active-duty personnel by place of duty"}
    </>
  );

  return (
    <ChartCard
      title="How many troops are stationed abroad"
      lede={lede}
      action={showing.length > 0 ? <span className="rounded-md border border-line-strong bg-surface-raised px-2 py-0.5 text-[0.75rem] text-ink">Showing {showing.join(" · ")} only</span> : undefined}
    >
      <TroopsChart stacks={shown} />
      <RegionLegend only={only} picked={pick} onPick={(id) => setPick((c) => (c === id ? null : id))}>
        {anyUnavailable && (
          <span className={LEGEND_ITEM}>
            <i className="inline-block h-[10px] w-[10px] rounded-[2px] border border-dashed border-ink-faint" />
            Army did not report
          </span>
        )}
        {anyEstimate && (
          <span className={LEGEND_ITEM}>
            <i className="inline-block h-[10px] w-[10px] rounded-[2px] border border-dashed border-ink-muted" style={{ background: "color-mix(in oklab, var(--ink) 25%, transparent)" }} />
            Estimate (lighter bars)
          </span>
        )}
      </RegionLegend>
      <MethodologyNote>
        <p>
          Band under the axis: the president in office on the snapshot date (<span style={{ color: "var(--rep)" }}>■</span> Republican <span style={{ color: "var(--dem)" }}>■</span> Democratic). Sep 2006 and 2007 are estimates (lighter bars) and the latest year is partial (hatched). For Iraq and Afghanistan in 2003&ndash;2005, DMDC&rsquo;s country tables print zero, so bars use its separate theatre totals, a different basis from the country counts (dashed boxes mark them).
        </p>
      </MethodologyNote>
      <TableView caption="Active-duty personnel abroad by region and year">
        <thead>
          <tr>
            <th className={TH}>Year</th>
            <th className={TH}>Total</th>
            {REGIONS.map((r) => (
              <th key={r.id} className={TH}>
                {r.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stacks.map((s) => (
            <tr key={s.yi}>
              <td className={TD}>
                {years[s.yi].fy}
                {years[s.yi].partial ? " (partial)" : periods[s.pi].estimate ? " (estimate)" : ""}
              </td>
              <td className={TD}>{s.unavailable ? "n/a" : formatCount(s.total)}</td>
              {s.regions.map((v, k) => (
                <td key={k} className={TD}>
                  {s.unavailable ? "n/a" : formatCount(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </TableView>
    </ChartCard>
  );
}
