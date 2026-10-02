"use client";

import { useMemo } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { MethodologyNote } from "@/components/MethodologyNote";
import { SLOT_NAME, changeVsPrior, formatAidMoney, spendingByYear } from "@/lib/foreign-aid-derive";
import { useAidState } from "./ForeignAidState";
import { SpendingChart } from "./SpendingChart";
import { SectorLegend, TD, TH, TableView, useSectorLabel } from "./shared";

/** "How much the U.S. spends": the stacked-bar time series and everything that explains it. */
export function SpendingCard() {
  const { data, year, range, country, sector, isPartial } = useAidState();
  const sectorLabel = useSectorLabel();
  const rows = useMemo(() => spendingByYear(data, range[0], range[1], country, sector), [data, range, country, sector]);
  const cur = rows.find((r) => r.fy === year);
  const change = changeVsPrior(data, year, country, sector);
  const showing = [country >= 0 ? data.payload.countries[country].name : null, sectorLabel].filter(Boolean);
  const anyPartial = rows.some((r) => isPartial(r.fy));

  const lede = (
    <>
      FY{year} · <b className="font-semibold text-ink">{formatAidMoney(cur?.total ?? 0)}</b>
      {isPartial(year) && " · partial year"}
      {change !== null && ` · ${change > 0 ? "+" : change < 0 ? "−" : ""}${Math.abs(Math.round(change * 100))}% vs. FY${year - 1}`} · nominal dollars
    </>
  );

  return (
    <ChartCard
      title="How much the U.S. spends"
      lede={lede}
      action={showing.length > 0 ? <span className="rounded-md border border-line-strong bg-surface-raised px-2 py-0.5 text-[0.75rem] text-ink">Showing {showing.join(" · ")} only</span> : undefined}
    >
      <SpendingChart rows={rows} />
      <SectorLegend partial={anyPartial} />
      <MethodologyNote>
        <p>
          Band under the axis: administration in office for most of the year (<span style={{ color: "var(--rep)" }}>■</span> Republican <span style={{ color: "var(--dem)" }}>■</span> Democratic).
        </p>
      </MethodologyNote>
      <TableView caption="Disbursements by fiscal year and sector">
        <thead>
          <tr>
            <th className={TH}>Fiscal year</th>
            <th className={TH}>Total</th>
            {sector < 0 && SLOT_NAME.map((s) => <th key={s} className={TH}>{s}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.fy}>
              <td className={TD}>
                FY{r.fy}
                {isPartial(r.fy) ? " (partial)" : ""}
              </td>
              <td className={TD}>{formatAidMoney(r.total)}</td>
              {sector < 0 && r.slots.map((v, k) => <td key={k} className={TD}>{formatAidMoney(v)}</td>)}
            </tr>
          ))}
        </tbody>
      </TableView>
    </ChartCard>
  );
}
