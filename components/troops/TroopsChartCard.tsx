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
          Band under the axis: the president in office on the snapshot date (<span style={{ color: "var(--rep)" }}>■</span> Republican <span style={{ color: "var(--dem)" }}>■</span> Democratic). Each bar is one year’s table:
          DMDC’s September 30 report (June 30 for 1953–56, the only snapshot those years have). From 1977 that is also the federal fiscal year; before it the fiscal year ended June 30, so the axis says “year”. Each bar is the
          active-duty personnel placed at a foreign host, plus the “afloat and unassigned” rows where the source has them; U.S. territories (Guam, Puerto Rico, American Samoa, the Northern Mariana Islands, the U.S. Virgin
          Islands) are left out. From 2008 the bars add up the country rows, so a few years differ from DMDC’s printed overseas total by a documented amount (at most 612 people).
        </p>
        <p>
          <b className="font-semibold text-ink">Sources.</b> 2008 on: DMDC’s location tables. 1996 and 1998–2005: DMDC’s own 309A country tables, with afloat and unassigned personnel and four branches. Everything else from 1953 to 2007
          is the troopdata compilation of DMDC reports (Allen, Flynn and Martinez Machain 2022), which has no afloat or unassigned rows, so its bars run lower by that amount and the source change at 1996 and 2008 is not a change in
          troops; 1997 and 2006–07 are also troopdata. No percent change is shown between bars from different sources. Sep 2006 and 2007 are estimates (DMDC
          published no table): lighter bars. The latest year is partial (hatched): the newest quarter published so far.
        </p>
        <p>
          <b className="font-semibold text-ink">Iraq and Afghanistan, 2003–2005,</b> are not reported in DMDC’s country tables (printed as zero beside a pointer to a separate table, and the 2003–04 foreign total is labelled “Less
          OIF”). The bars use DMDC’s separate totals for forces in and around Iraq (183,002 active duty in 2003; 170,647 in 2004 and 192,600 in 2005 including deployed Reserve and National Guard) and Afghanistan (19,500 in 2005, same basis,
          rounded), so those years’ bars are DMDC’s foreign total plus these figures. They are a different basis from the country counts: they cover the whole theatre, so Iraq is somewhat overstated and some troops may also appear in
          a neighbouring country’s row. Kuwait is still not reported. A count that is blank in the 2008+ tables (Afghanistan, Iraq and Syria, 2018 to 2021) is likewise not reported, not zero. Tap or hover the numbered markers for each change.
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
