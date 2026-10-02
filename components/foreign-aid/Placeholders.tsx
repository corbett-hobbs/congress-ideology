"use client";

import { fiscalYearSpan, SECTOR_LABEL } from "@/lib/foreign-aid-derive";
import { useAidState } from "./ForeignAidState";

/** Session 4 empty state: shows the shared selection so state propagation is visible before the charts land. */
export function SelectionReadout({ what }: { what: string }) {
  const { year, range, country, sector, term, data, isPartial } = useAidState();
  const { countries, sectors } = data.payload;
  return (
    <p className="m-0 rounded-md border border-dashed border-line-strong px-3 py-8 text-center text-[0.82rem] text-ink-muted" data-testid="selection-readout">
      {what}: FY{year} ({fiscalYearSpan(year)}){isPartial(year) ? " · partial" : ""} · years {range[0]}–{range[1]} · {term ? term.label : "all presidents"} ·{" "}
      {country >= 0 ? countries[country].name : "all countries"} · {sector >= 0 ? (SECTOR_LABEL[sectors[sector] as keyof typeof SECTOR_LABEL] ?? sectors[sector]) : "all sectors"}
    </p>
  );
}
