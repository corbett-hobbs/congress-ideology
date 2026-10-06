import type { ControlSpan } from "./congress-control";
import type { EconomyTerm } from "./economy-presidents";
import type { Weekly } from "./indicator-payload";
import type { EnergyAction } from "./energy-actions-entities";

/**
 * Client-safe shapes for the energy page. Same wire idea as `EconomyPayload`: weekly series are `[day, value]`
 * on the shared day axis (whole days since 1991-01-01), monthly series are fixed-index arrays (month 0 = January
 * 1991) with `null` for a missing month, in the source's own units (nothing converted; the UI formats).
 */

/** Monthly series the page draws, keyed by a short name (never a raw EIA id in the UI). */
export const MONTHLY_KEYS = [
  "prod", // PNPRPUS total petroleum field production
  "imp", // PAIMPUS
  "exp", // PAEXPUS
  "supplied", // PATCPUS products supplied
  "net", // PANIPUS net imports
  "cexp", // COEXPUS crude oil exports only
  "coal",
  "gas",
  "nuclear",
  "hydro",
  "wind",
  "solar", // SOETPUS utility-scale
  "other", // ELETPUS minus the six above (derived)
  "total", // ELETPUS
  "small", // ELEC_SMALL_SOLAR
  "lng", // N9133US2
] as const;
export type MonthlyKey = (typeof MONTHLY_KEYS)[number];

/** The EIA series behind each key (`other` is derived, so it has the total's id). */
export const KEY_SERIES: Record<MonthlyKey, string> = {
  prod: "PNPRPUS",
  imp: "PAIMPUS",
  exp: "PAEXPUS",
  supplied: "PATCPUS",
  net: "PANIPUS",
  cexp: "COEXPUS",
  coal: "CLETPUS",
  gas: "NGETPUS",
  nuclear: "NUETPUS",
  hydro: "HVETPUS",
  wind: "WYETPUS",
  solar: "SOETPUS",
  other: "ELETPUS",
  total: "ELETPUS",
  small: "ELEC_SMALL_SOLAR",
  lng: "N9133US2",
};

/** The fuels stacked on the electricity card, bottom to top. */
export const FUEL_KEYS = ["coal", "gas", "nuclear", "hydro", "wind", "solar", "other"] as const;
export type FuelKey = (typeof FUEL_KEYS)[number];

export type EnergyCardId = "spr" | "oil" | "electricity" | "lng";

/** A curated action trimmed for the charts. */
export interface EnergyFlag {
  id: string;
  date: string;
  label: string;
  description: string;
  authority: EnergyAction["authority_type"];
  kind: EnergyAction["kind"];
  area: EnergyAction["area"];
  series: string[];
  lagged: boolean;
  priority: 1 | 2;
}

export interface EnergyPayload {
  /** Axis end (exclusive), in days: the day after the newest weekly SPR reading. */
  span: number;
  /** SPR crude stocks, weekly, thousand barrels. */
  spr: Weekly;
  monthly: Record<MonthlyKey, (number | null)[]>;
  /** First preliminary month index per monthly key (absent = every month is final). */
  prelim: Partial<Record<MonthlyKey, number>>;
  rec: [number, number][];
  terms: EconomyTerm[];
  control: { house: ControlSpan[]; senate: ControlSpan[] };
  flags: EnergyFlag[];
  flagsReviewed: string;
  /** Fetch date of the data (ISO). */
  fetchedAt: string;
}
