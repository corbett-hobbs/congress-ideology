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
  const { data, yi, range, country, measure } = useTroopsState();
  const { periods, years, places, breakYear } = data.payload;
  const stacks = useMemo(() => stackByRegion(data, measure, range[0], range[1], country), [data, measure, range, country]);
  const cur = stacks.find((s) => s.yi === yi);
  const change = changeVsPrior(data, measure, yi, country);
  const showing = [country >= 0 ? places[country].name : null, measure > 0 ? measureLabel(measure) : null].filter(Boolean);
  const anyUnavailable = stacks.some((s) => s.unavailable);
  const only = country >= 0 ? places[country].region : null;
  const year = years[yi];
  const p = periods[year.period];
  const when = year.partial ? `FY${year.fy} (partial, through ${p.label})` : `FY${year.fy} (Sep 30, ${year.fy})`;

  const lede = cur?.unavailable ? (
    <>
      {when} · the Army did not report, so there is no {measure === 0 ? "all-branch" : "Army"} figure · active-duty personnel by place of duty
    </>
  ) : (
    <>
      {when} · <b className="font-semibold text-ink">{formatCount(cur?.total ?? 0)}</b> {country >= 0 ? `in ${places[country].name}` : "abroad"}
      {change && ` · ${change.pct > 0 ? "+" : change.pct < 0 ? "−" : ""}${Math.abs(Math.round(change.pct * 1000) / 10)}% vs. FY${years[change.prev].fy}`}
      {!change && yi === breakYear && " · a new definition starts here, so no change is shown"}
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
          Band under the axis: administration in office for most of the fiscal year (<span style={{ color: "var(--rep)" }}>■</span> Republican <span style={{ color: "var(--dem)" }}>■</span> Democratic). A fiscal year runs October 1 to
          September 30, and each bar is DMDC’s September 30 table, the one table it has published every year since 2008. Each bar is the active-duty personnel DMDC places at a foreign host, plus the “afloat and unassigned” rows; U.S.
          territories (Guam, Puerto Rico, American Samoa, the Northern Mariana Islands, the U.S. Virgin Islands) are left out. Bars add up the country rows, so a few years differ from DMDC’s printed overseas total by a documented
          amount (at most 612 people).
        </p>
        <p>
          The latest year is partial (hatched): it shows the newest quarter DMDC has published, not a September table. Quarterly tables exist from 2013 and are in the pipeline data; the page shows the September one. A count that is blank in the
          source (Afghanistan, Iraq and Syria, FY2018 to FY2021) is not reported, not zero, and adds nothing to its bar. The Army did not report in the Dec 2022, Mar 2023 and Jun 2023 quarters, which do not fall on a September table, so
          every fiscal year here has an Army figure. Tap or hover the numbered marker for what changes at FY2018.
        </p>
      </MethodologyNote>
      <TableView caption="Active-duty personnel abroad by region and fiscal year">
        <thead>
          <tr>
            <th className={TH}>Fiscal year</th>
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
                FY{years[s.yi].fy}
                {years[s.yi].partial ? " (partial)" : ""}
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
