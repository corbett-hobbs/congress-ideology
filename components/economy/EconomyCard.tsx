import { memo, type ReactNode } from "react";
import { fiscalBars, quarterlyPoints, yearRows } from "@/lib/economy-series";
import type { EconomyData } from "@/lib/indicator-payload";
import type { Reading } from "@/lib/indicator-lookup";
import { RangeSelector } from "@/components/charts/RangeSelector";
import { EconomyChart, chartPoints } from "./EconomyChart";
import { useEconomyActions } from "./EconomyState";
import { type ChartSpec } from "./specs";

function Readout({ spec, reading, hero }: { spec: ChartSpec; reading: Reading; hero: boolean }) {
  return (
    <div className={`shrink-0 text-right ${hero ? "min-w-[120px]" : "min-w-[110px]"}`}>
      <div className={`font-mono font-medium leading-tight text-ink ${hero ? "text-[1.6rem]" : "text-[1.25rem]"}`}>
        {reading.value === null ? "—" : spec.head(reading.value)}
      </div>
      <div className="mt-0.5 text-[0.75rem] text-ink-muted">{reading.caption}</div>
    </div>
  );
}

/** `<details>` table fallback: one row per year (last reading, low, high), or the values themselves for annual series. */
const DataTable = memo(function DataTable({ data, spec }: { data: EconomyData; spec: ChartSpec }) {
  const pts =
    spec.kind === "fiscal"
      ? fiscalBars(data.def).map((b) => ({ day: b.mid, value: b.value }))
      : spec.kind === "debt"
        ? quarterlyPoints(data.held)
        : chartPoints(data, spec.key);
  const annual = spec.kind === "fiscal" || spec.kind === "income";
  const rows = yearRows(pts);
  const fmt = (v: number) => spec.head(v);
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[0.75rem] text-ink-muted hover:text-ink">View the data as a table</summary>
      <div className="mt-2 max-h-72 overflow-auto">
        <table className="w-full border-collapse text-left text-[0.75rem] tabular-nums">
          <caption className="sr-only">{`${spec.title}, ${spec.unit}${spec.kind === "debt" ? ", held by the public" : ""}`}</caption>
          <thead className="sticky top-0 bg-surface-raised">
            <tr className="font-mono text-[0.65rem] uppercase tracking-[0.05em] text-ink-muted">
              <th scope="col" className="px-2 py-1.5">{spec.kind === "fiscal" ? "Fiscal year" : "Year"}</th>
              <th scope="col" className="px-2 py-1.5">{annual ? "Value" : "Last reading"}</th>
              {!annual && <th scope="col" className="px-2 py-1.5">Low</th>}
              {!annual && <th scope="col" className="px-2 py-1.5">High</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.year} className="border-t border-line">
                <th scope="row" className="px-2 py-1 font-normal">{r.year}</th>
                <td className="px-2 py-1">{fmt(r.last)}</td>
                {!annual && <td className="px-2 py-1">{fmt(r.low)}</td>}
                {!annual && <td className="px-2 py-1">{fmt(r.high)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
});

/** Years-shown control. Every card renders one; they all drive the page's single window. */
function CardRange({ firstYear, lastYear, range }: { firstYear: number; lastYear: number; range: [number, number] }) {
  const { setRange } = useEconomyActions();
  const presets = [20, 10, 5].map((n) => ({ label: `Last ${n} years`, from: Math.max(firstYear, lastYear - n + 1), to: lastYear }));
  return (
    <RangeSelector
      min={firstYear}
      max={lastYear}
      value={range}
      onChange={(r) => setRange(r[0] <= firstYear && r[1] >= lastYear ? null : r)}
      format={String}
      presets={presets}
      ariaLabel="Years shown in every economy chart"
    />
  );
}

export function EconomyCard({
  data,
  spec,
  reading,
  hero = false,
  showCong,
  term,
  view,
  range,
  firstYear,
  lastYear,
  desc,
  footnote,
  legend,
}: {
  data: EconomyData;
  spec: ChartSpec;
  reading: Reading;
  hero?: boolean;
  showCong: boolean;
  term: number | null;
  view: readonly [number, number];
  range: [number, number];
  firstYear: number;
  lastYear: number;
  desc: string;
  footnote?: ReactNode;
  legend?: ReactNode;
}) {
  const Heading = hero ? "h2" : "h3";
  return (
    <section className={`min-w-0 rounded-[10px] border border-line bg-surface ${hero ? "p-5 sm:p-6" : "p-[1.1rem_1.1rem_0.9rem]"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Heading className={`m-0 font-serif font-medium leading-tight ${hero ? "text-[1.6rem]" : "text-[1.3rem]"}`}>{spec.title}</Heading>
          {!hero && <p className="m-0 mt-1 text-[0.8rem] leading-[1.45] text-ink-muted">{desc}</p>}
        </div>
        <Readout spec={spec} reading={reading} hero={hero} />
      </div>
      {hero && <p className="m-0 mt-2 text-[0.875rem] leading-[1.5] text-ink-muted">{desc}</p>}
      <div className={hero ? "mt-3.5" : "mt-3"}>
        <EconomyChart data={data} spec={spec} hero={hero} showCong={showCong} term={term} view={view} reading={reading} />
      </div>
      {legend}
      <CardRange firstYear={firstYear} lastYear={lastYear} range={range} />
      {footnote && <p className="m-0 mt-2 text-[0.75rem] leading-[1.45] text-ink-muted">{footnote}</p>}
      <DataTable data={data} spec={spec} />
    </section>
  );
}
