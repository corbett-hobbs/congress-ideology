"use client";

import { FiscalYearPlayer } from "@/components/charts/FiscalYearPlayer";
import { fiscalYearSpan } from "@/lib/foreign-aid-derive";
import { useAidState } from "./ForeignAidState";

/** Fiscal-year slider with play/pause for the foreign-aid filter bar; the range is the President filter's window. */
export function FiscalYearControl() {
  const { year, range, setYear, isPartial } = useAidState();
  return (
    <FiscalYearPlayer
      year={year}
      range={range}
      onYear={setYear}
      valueText={`FY${year}, ${fiscalYearSpan(year)}${isPartial(year) ? ", partial year" : ""}`}
      note={isPartial(year) ? "partial year" : undefined}
      span={fiscalYearSpan(year)}
    />
  );
}
