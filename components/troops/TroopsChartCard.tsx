"use client";

import { useMemo } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { MethodologyNote } from "@/components/MethodologyNote";
import { REGIONS } from "@/lib/troops-regions";
import { changeVsPrior, formatCount, measureLabel, stackByRegion } from "@/lib/troops-derive";
import { useTroopsState } from "./TroopsState";
import { TroopsChart } from "./TroopsChart";
import { RegionLegend, TD, TH, TableView } from "./shared";

/** "How many troops are stationed abroad": the stacked-bar time series and everything that explains it. */
export function TroopsChartCard() {
  const { data, pi, range, country, measure } = useTroopsState();
  const { periods, places, breakPeriod } = data.payload;
  const stacks = useMemo(() => stackByRegion(data, measure, range[0], range[1], country), [data, measure, range, country]);
  const cur = stacks.find((s) => s.pi === pi);
  const change = changeVsPrior(data, measure, pi, country);
  const showing = [country >= 0 ? places[country].name : null, measure > 0 ? measureLabel(measure) : null].filter(Boolean);
  const anyUnavailable = stacks.some((s) => s.unavailable);
  const only = country >= 0 ? places[country].region : null;
  const p = periods[pi];

  const lede = cur?.unavailable ? (
    <>
      {p.label} · the Army did not report this quarter, so there is no {measure === 0 ? "all-branch" : "Army"} figure · active-duty personnel by place of duty
    </>
  ) : (
    <>
      {p.label} · <b className="font-semibold text-ink">{formatCount(cur?.total ?? 0)}</b> {country >= 0 ? `in ${places[country].name}` : "abroad"}
      {change && ` · ${change.pct > 0 ? "+" : change.pct < 0 ? "−" : ""}${Math.abs(Math.round(change.pct * 1000) / 10)}% vs. ${periods[change.prev].label}`}
      {!change && pi === breakPeriod && " · a new definition starts here, so no change is shown"}
      {" · active-duty personnel by place of duty"}
    </>
  );

  return (
    <ChartCard
      title="How many troops are stationed abroad"
      lede={lede}
      action={showing.length > 0 ? <span className="rounded-md border border-line-strong bg-surface-raised px-2 py-0.5 text-[0.75rem] text-ink">Showing {showing.join(" · ")} only</span> : undefined}
    >
      <TroopsChart stacks={stacks} />
      <RegionLegend only={only}>
        {anyUnavailable && (
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-[11px] w-[11px] rounded-[2px] border border-dashed border-ink-faint" />
            Army did not report
          </span>
        )}
      </RegionLegend>
      <MethodologyNote>
        <p>
          Band under the axis: administration in office on the quarter’s last day (<span style={{ color: "var(--rep)" }}>■</span> Republican <span style={{ color: "var(--dem)" }}>■</span> Democratic). Each bar is the active-duty
          personnel DMDC places at a foreign host, plus the “afloat and unassigned” rows; U.S. territories (Guam, Puerto Rico, American Samoa, the Northern Mariana Islands, the U.S. Virgin Islands) are left out.
          Bars add up the country rows, so a few quarters differ from DMDC’s printed overseas total by a documented amount (at most 612 people).
        </p>
        <p>
          DMDC published one table a year (September) for 2008 to 2012, so those years have a single bar. A count that is blank in the source (Afghanistan, Iraq and Syria, Dec 2017 to Sep 2021) is not reported, not
          zero, and adds nothing to its bar. Tap or hover the numbered markers for what changes at Dec 2017 and in the three Army-N/A quarters.
        </p>
      </MethodologyNote>
      <TableView caption="Active-duty personnel abroad by region and quarter">
        <thead>
          <tr>
            <th className={TH}>Quarter</th>
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
            <tr key={s.pi}>
              <td className={TD}>{periods[s.pi].label}</td>
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
