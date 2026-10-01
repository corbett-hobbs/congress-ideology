import { scaleSymlog, type ScaleContinuousNumeric } from "d3-scale";
import { fmtMoney, fmtTick } from "./trade-chart";
import { dutyRate, partnerBalance, sortPartners, type SortState } from "./trade-derive";
import type { YearPartnerRow } from "./trade-types";

/**
 * Pure model for the partners chart (Chart 3): which rows to draw for a year, in
 * what order, on what scale. No React; the component maps this onto `SwarmRows`.
 */

export interface PartnerChartRow {
  code: string;
  name: string;
  exports: number;
  imports: number;
  balance: number;
  /** Calculated duties over imports for consumption for the year, null without a duties row. */
  rate: number | null;
}

/** Partners with any trade that year, in the requested order. */
export function partnerChartRows(partners: readonly YearPartnerRow[], sort: SortState): PartnerChartRow[] {
  const live = partners.filter((r) => r[2] > 0 || r[3] > 0);
  return sortPartners(live, sort).map((r) => ({
    code: r[0],
    name: r[1],
    exports: r[2],
    imports: r[3],
    balance: partnerBalance(r),
    rate: dutyRate(r[4], r[5]),
  }));
}

/** $ millions where the symmetric-log scale turns from linear to log: values near $1B stay readable, $400B fits too. */
export const SCALE_CONSTANT = 1000;
const TICK_CANDIDATES = [0, 1_000, 10_000, 100_000, 1_000_000];

export interface PartnerScale {
  /** Max domain value, $M. */
  max: number;
  ticks: number[];
  make: (innerWidth: number) => ScaleContinuousNumeric<number, number>;
  format: (v: number) => string;
}

export function partnerScale(rows: readonly PartnerChartRow[]): PartnerScale {
  const raw = Math.max(0, ...rows.flatMap((r) => [r.exports, r.imports]));
  const max = raw > 0 ? raw * 1.02 : 1000;
  return {
    max,
    ticks: TICK_CANDIDATES.filter((t) => t <= max),
    make: (w) => scaleSymlog().constant(SCALE_CONSTANT).domain([0, max]).range([0, w]),
    format: fmtTick,
  };
}

/** The right-hand label: the signed balance. */
export const partnerMeta = (r: PartnerChartRow) => fmtMoney(r.balance, { signed: true });
