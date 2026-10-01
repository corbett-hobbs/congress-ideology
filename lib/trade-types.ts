import type { DutiesSource } from "./trade-entities";

/**
 * Client-side shapes for the trade page. Pure types: the wire format is compact
 * fixed-index arrays on one monthly axis (month 0 = January 1991), `null` where a
 * month has no value (not yet published, or before a series starts). Same idea as
 * `lib/indicator-payload.ts`. Values keep the pipeline's units: goods trade in
 * $ millions (Census basis), duties and import value in whole dollars.
 */

/** Month 0 of every monthly array. */
export const AXIS_START_YEAR = 1991;

export type Monthly = (number | null)[];

/** The all-countries series that ship with the page. */
export interface TradeNationalPayload {
  /** Last month with published goods trade, "YYYY-MM". Arrays are `monthCount(lastPeriod)` long. */
  lastPeriod: string;
  /** Goods exports / imports, Census basis, $M. Seasonally adjusted: the national line on the page. */
  sa: { exports: Monthly; imports: Monthly };
  /** Same, not seasonally adjusted. */
  nsa: { exports: Monthly; imports: Monthly };
  /** Calculated duties and imports for consumption, whole $. Null before 1993-01 (no data) and past the last published month. */
  duties: Monthly;
  dutyImports: Monthly;
  /** First month of each duties source (the earlier one is USITC DataWeb, the later the Census API). */
  dutySources: { source: DutiesSource; first: string }[];
}

/** One country's monthly series, fetched on selection. */
export interface TradeCountryPayload {
  code: string;
  name: string;
  /** Goods trade, Census basis, $M, not seasonally adjusted. */
  exports: Monthly;
  imports: Monthly;
  /** Calculated duties and imports for consumption, whole $. */
  duties: Monthly;
  dutyImports: Monthly;
}

/** One partner in one year: the partners chart and the year slider read this. */
export type YearPartnerRow = [
  code: string,
  name: string,
  exportsYear: number,
  importsYear: number,
  /** Calculated duties and imports for consumption, whole $ for the year; null when the country has no duties row. */
  dutiesYear: number | null,
  dutyImportsYear: number | null,
];

export interface TradeYearPayload {
  year: number;
  /** Non-aggregate partners only. Before 1992 Census itemizes fewer partners, so rows fall a little short of the total. */
  partners: YearPartnerRow[];
  /** Duties source for the year, null before 1993. */
  dutySource: DutiesSource | null;
}

/** Selectable country in the filter bar. */
export interface TradeCountryRef {
  code: string;
  name: string;
  firstYear: number | null;
  lastYear: number | null;
}

/** One curated tariff action, trimmed to what the chart needs (`tariff_actions.json`). */
export interface TariffFlag {
  id: string;
  /** Effective date, ISO. */
  date: string;
  label: string;
  description: string;
  authority: string;
  kind: string;
  priority: 1 | 2;
  cutover: boolean;
  status: string;
  statusNote: string | null;
  rateNote: string | null;
}
