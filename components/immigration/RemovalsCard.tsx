"use client";

import { ChartCard } from "@/components/charts/ChartCard";
import { RETURNS_COUNTED_FROM, filterYears, showsPendingSlot, type ImmigrationPageData } from "@/lib/immigration-derive";
import { RemovalsChart } from "./RemovalsChart";

const SWATCH = "inline-block h-2.5 w-2.5 flex-none align-[-1px]";

export function RemovalsCard({ data, selection }: { data: ImmigrationPageData; selection: string }) {
  const years = filterYears(data.years, selection);
  const pending = showsPendingSlot(data, selection);
  const termsById = new Map(data.terms.map((t) => [t.termId, t]));
  return (
    <ChartCard
      title="Removals by fiscal year"
      lede="ICE’s headline figure for each year, as locked in early October. FY2025 is preliminary — it comes from ICE’s FY2027 budget overview, not a locked statistics release."
    >
      <RemovalsChart
        years={years}
        terms={data.terms}
        markers={data.markers}
        yMax={data.yMax}
        pending={pending}
        pendingFy={data.lastFy + 1}
      />

      <ul className="m-0 mt-3 flex list-none flex-wrap gap-x-5 gap-y-1.5 p-0 text-[0.72rem] text-ink-muted">
        <li className="flex items-center gap-1.5">
          <span className={SWATCH} style={{ background: "var(--dem)" }} />
          Democratic
        </li>
        <li className="flex items-center gap-1.5">
          <span className={SWATCH} style={{ background: "var(--rep)" }} />
          Republican
        </li>
      </ul>

      <p className="m-0 mt-3 text-[0.75rem] leading-[1.6] text-ink-muted">
        Smaller caveats sit on each bar’s hover or tap card — for example, FY2010 leaves out 76,732 expedited removals ICE
        closed for CBP, and counts lock around October 5, so late closures roll into the next year. ICE figures only:
        Border Patrol actions, including Title 42 expulsions, are not included. Across the full series,{" "}
        {data.finalCount} of {data.years.length} years are final and {data.corroboratedCount} are confirmed by a second
        source.
      </p>

      <details className="mt-3 text-[0.8rem] text-ink-muted">
        <summary className="cursor-pointer text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          View as table
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left">
            <caption className="sr-only">ICE removals by fiscal year</caption>
            <thead>
              <tr className="border-b border-line-strong text-[0.7rem] uppercase tracking-[0.06em] text-ink-faint">
                <th className="py-1.5 pr-3 font-medium">Fiscal year</th>
                <th className="py-1.5 pr-3 text-right font-medium">Removals</th>
                <th className="py-1.5 pr-3 font-medium">Status</th>
                <th className="py-1.5 pr-3 font-medium">Administration</th>
                <th className="py-1.5 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {years.map((y) => (
                <tr key={y.fy} className="border-b border-line align-top">
                  <th scope="row" className="py-1.5 pr-3 font-mono font-medium text-ink">
                    {`FY${y.fy}`}
                  </th>
                  <td className="py-1.5 pr-3 text-right font-mono text-ink">{y.value.toLocaleString("en-US")}</td>
                  <td className="py-1.5 pr-3">
                    {y.status === "final" ? "Final" : "Preliminary"}
                    {y.fy < RETURNS_COUNTED_FROM ? ", returns not counted" : ""}
                  </td>
                  <td className="py-1.5 pr-3">
                    {y.blended
                      ? y.days.map((d) => `${d.last} ${d.days} days`).join(" · ")
                      : (termsById.get(y.termId)?.president ?? "")}
                  </td>
                  <td className="py-1.5">
                    <a href={y.sourceUrl} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
                      {y.source}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </ChartCard>
  );
}
