import { fmtMoney } from "./trade-chart";
import { partnerChartRows, type PartnerChartRow } from "./trade-partners";
import type { YearPartnerRow } from "./trade-types";

/**
 * Pure model for the trade map: one value per partner for the selected year, put into fixed
 * absolute bins so years stay comparable while the year changes. No React.
 */

export type TradeMeasure = "total" | "balance";

/** Upper bounds ($ millions) of every class but the last. Total trade: <$1B … $200B+. */
export const TOTAL_BINS = { thresholds: [1_000, 10_000, 50_000, 200_000], labels: ["<$1B", "$1–10B", "$10–50B", "$50–200B", "$200B+"] };
/** Balance size, either sign. */
export const BALANCE_BINS = { thresholds: [1_000, 10_000, 50_000], labels: ["<$1B", "$1–10B", "$10–50B", "$50B+"] };
/** Percent of the base colour mixed into the surface, per class (1-based). */
export const TOTAL_MIX = [16, 34, 56, 78, 100];
export const BALANCE_MIX = [30, 55, 78, 100];

const classOf = (v: number, thresholds: readonly number[]) => {
  const i = thresholds.findIndex((t) => v < t);
  return i === -1 ? thresholds.length + 1 : i + 1;
};

export interface MapFill {
  /** 0 = no trade. */
  cls: number;
  /** Balance only: which side of zero. */
  side: "deficit" | "surplus" | null;
}

export function mapFill(row: PartnerChartRow | undefined, measure: TradeMeasure): MapFill {
  if (!row) return { cls: 0, side: null };
  if (measure === "total") {
    const t = row.exports + row.imports;
    return { cls: t > 0 ? classOf(t, TOTAL_BINS.thresholds) : 0, side: null };
  }
  if (row.balance === 0) return { cls: 0, side: null };
  return { cls: classOf(Math.abs(row.balance), BALANCE_BINS.thresholds), side: row.balance < 0 ? "deficit" : "surplus" };
}

export interface MapModel {
  byCode: Map<string, PartnerChartRow>;
  /** Partners with trade this year that have no outline on the map (small economies). */
  undrawn: PartnerChartRow[];
  /** Total trade and signed balance across the listed partners, $ millions. */
  totals: { total: number; balance: number };
}

export function buildMapModel(partners: readonly YearPartnerRow[], outlineKeys: ReadonlySet<string>): MapModel {
  const rows = partnerChartRows(partners, { key: "total", reversed: false });
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const undrawn = rows.filter((r) => !outlineKeys.has(r.code));
  const totals = rows.reduce((a, r) => ({ total: a.total + r.exports + r.imports, balance: a.balance + r.balance }), { total: 0, balance: 0 });
  return { byCode, undrawn, totals };
}

/** The `n` largest partners by total trade, biggest first (codes only). */
export function topByTotal(partners: readonly YearPartnerRow[], n: number): string[] {
  return partnerChartRows(partners, { key: "total", reversed: false })
    .slice(0, n)
    .map((r) => r.code);
}

export const fmtTotal = (r: PartnerChartRow) => fmtMoney(r.exports + r.imports);
