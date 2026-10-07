import { termIdForDate, windowPoints, type Point } from "./indicator-derive";
import type { Administration } from "./executive-orders-entities";
import type { EnergyAction } from "./energy-actions-entities";
import { ENERGY_DISPLAY_START, type EnergyObservation } from "./energy-entities";
import { dayOfIso, dateOfDay, monthIndexOfIso, MONTH_ABBR, MONTH_NAMES } from "./indicator-time";
import { monthlySeries, weeklyTuples } from "./indicator-payload";
import {
  FUEL_KEYS,
  KEY_SERIES,
  MONTHLY_KEYS,
  type EnergyCardId,
  type EnergyFlag,
  type EnergyPayload,
  type MonthlyKey,
} from "./energy-types";
import { placeFlags, type FlagInput, type PlaceOptions, type PlacedFlag } from "./trade-flags";
import type { EconomyTerm } from "./economy-presidents";

/**
 * Pure derivations for the energy page: windowing, "other" generation, preliminary boundaries, date lookups
 * and flag layout. No file I/O (that is `lib/energy-data.ts`), so it is unit-tested over the real committed
 * files. Reuses the indicators track's display window, day axis and term lookup; nothing is duplicated.
 */

/** Rounding per key (the payload keeps source units; this only trims float noise). */
const DP: Partial<Record<MonthlyKey, number>> = {};

export type SeriesRows = ReadonlyMap<string, readonly EnergyObservation[]>;

export function groupObservations(rows: readonly EnergyObservation[]): Map<string, EnergyObservation[]> {
  const out = new Map<string, EnergyObservation[]>();
  for (const r of rows) {
    const list = out.get(r.series_id) ?? [];
    list.push(r);
    out.set(r.series_id, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

const pointsOf = (rows: readonly EnergyObservation[] | undefined): Point[] => (rows ?? []).map((r) => ({ date: r.date, value: r.value }));

/** Total generation minus the six named stacked fuels, month by month (petroleum, biomass, geothermal, waste, pumped storage, other gases). Null if any input month is missing. */
export function otherGeneration(bySeries: SeriesRows): Point[] {
  const total = bySeries.get(KEY_SERIES.total) ?? [];
  const named = FUEL_KEYS.filter((k) => k !== "other").map((k) => new Map((bySeries.get(KEY_SERIES[k]) ?? []).map((r) => [r.date, r.value])));
  const out: Point[] = [];
  for (const t of total) {
    const parts = named.map((m) => m.get(t.date));
    if (parts.some((p) => p === undefined)) continue;
    out.push({ date: t.date, value: t.value - (parts as number[]).reduce((a, b) => a + b, 0) });
  }
  return out;
}

/** First month index (0 = Jan 1991) whose observation is preliminary, or undefined when none is. */
export function firstPreliminary(rows: readonly EnergyObservation[] | undefined): number | undefined {
  const r = (rows ?? []).find((o) => o.status === "preliminary" && o.date >= ENERGY_DISPLAY_START);
  return r ? monthIndexOfIso(r.date) : undefined;
}

/** Display-windowed monthly arrays plus the SPR weekly tuples and each key's preliminary boundary. */
export function buildSeries(bySeries: SeriesRows): Pick<EnergyPayload, "spr" | "monthly" | "prelim"> {
  const monthly = {} as EnergyPayload["monthly"];
  const prelim: EnergyPayload["prelim"] = {};
  for (const key of MONTHLY_KEYS) {
    const id = KEY_SERIES[key];
    const pts = key === "other" ? otherGeneration(bySeries) : pointsOf(bySeries.get(id));
    monthly[key] = monthlySeries(windowPoints(pts, "monthly"), DP[key] ?? 0);
    const p = firstPreliminary(bySeries.get(id));
    if (p !== undefined) prelim[key] = p;
  }
  const spr = weeklyTuples(windowPoints(pointsOf(bySeries.get("WCSSTUS1")), "weekly"), 0);
  return { spr, monthly, prelim };
}

/** Axis end (exclusive): the day after the newest weekly SPR reading. */
export const spanOf = (spr: readonly [number, number][]): number => (spr.length ? spr[spr.length - 1][0] + 1 : 0);

// --------------------------------------------------------------------------- flags

export const AUTHORITY_LABEL: Record<EnergyAction["authority_type"], string> = {
  executive: "Executive",
  congressional: "Congress",
  agency: "Agency",
  court: "Court",
};

/** SPR actions say what physically happened to the oil. */
export const KIND_LABEL: Partial<Record<EnergyAction["kind"], string>> = {
  release_sale: "Sale",
  release_exchange: "Exchange",
  release_mixed: "Sale and exchange",
  refill: "Refill",
};

export const toFlag = (a: EnergyAction): EnergyFlag => ({
  id: a.action_id,
  date: a.date,
  label: a.label_short,
  description: a.description,
  authority: a.authority_type,
  kind: a.kind,
  area: a.area,
  series: a.series,
  lagged: a.lagged_effect,
  priority: a.flag_priority,
});

/** Which EIA series a card can carry flags for. Event markers with no series (Paris, Keystone, general orders) sit on no card. */
export const CARD_SERIES: Record<EnergyCardId, readonly string[]> = {
  spr: ["WCSSTUS1"],
  oil: ["COEXPUS", "PAEXPUS", "PNPRPUS", "PAIMPUS", "PANIPUS", "PATCPUS"],
  electricity: ["CLETPUS", "NGETPUS", "NUETPUS", "HVETPUS", "WYETPUS", "SOETPUS", "PAETPUS", "ELETPUS", "ELEC_SMALL_SOLAR"],
  lng: ["N9133US2"],
};

export const flagsForCard = (flags: readonly EnergyFlag[], card: EnergyCardId): EnergyFlag[] =>
  flags.filter((f) => f.series.some((s) => CARD_SERIES[card].includes(s)));

export const dateText = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTH_ABBR[m - 1]} ${d}, ${y}`;
};

/** "Executive · Sale · SPR sale of up to 180 million barrels authorized": authority first, then (SPR) what happened to the oil. */
export function flagLabel(f: EnergyFlag): string {
  const kind = KIND_LABEL[f.kind];
  return [AUTHORITY_LABEL[f.authority], kind, f.label].filter(Boolean).join(" · ");
}

/** An action this recent (two years or less) has not had time to show up in the data. */
const RECENT_YEARS = 2;

/** The note every flagged-with-delay action carries: "came years after" for an old action, "may yet" for a recent one. */
export function laggedNote(isoDate: string, now: Date = new Date()): string {
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  cutoff.setFullYear(cutoff.getFullYear() - RECENT_YEARS);
  if (new Date(`${isoDate}T00:00:00`) >= cutoff) {
    return "Enabled, not caused: this action is recent, so any effect on this series may not show yet, and the date marks the action, not the change.";
  }
  return "Enabled, not caused: the effect on this series, if any, came years after the action, so the date marks the action, not the change.";
}

export function flagInputs(flags: readonly EnergyFlag[]): FlagInput[] {
  return flags.map((f) => ({ id: f.id, day: dayOfIso(f.date), label: flagLabel(f), priority: f.priority, dateText: dateText(f.date) }));
}

/** Flag layout is `placeFlags` (pure, tested in trade-flags.test.ts); this only fixes the energy defaults. */
export const layoutFlags = (flags: readonly FlagInput[], o: PlaceOptions): PlacedFlag[] => placeFlags(flags, { lanes: 3, extraLanes: 2, ...o });

// --------------------------------------------------------------------------- lookups

/** Month index (0 = Jan 1991) of an axis day. */
export const monthOfDay = (day: number): number => {
  const { year, month } = dateOfDay(day);
  return (year - 1991) * 12 + month;
};

export const monthLabel = (m: number) => `${MONTH_NAMES[((m % 12) + 12) % 12]} ${1991 + Math.floor(m / 12)}`;

/** The monthly value for an axis day, or null (gap, before the series starts, or not yet published). */
export const monthlyAt = (series: readonly (number | null)[], day: number): number | null => series[monthOfDay(day)] ?? null;

/** True when the month is in the series' preliminary stretch. */
export const isPreliminary = (payload: Pick<EnergyPayload, "prelim">, key: MonthlyKey, month: number): boolean => {
  const p = payload.prelim[key];
  return p !== undefined && month >= p;
};

/** The latest weekly SPR reading on or before `day` (null before the first), with its date. */
export function sprAt(spr: readonly [number, number][], day: number): { day: number; value: number } | null {
  let lo = 0;
  let hi = spr.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (spr[mid][0] <= day) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best < 0 ? null : { day: spr[best][0], value: spr[best][1] };
}

export const termAtDay = (terms: readonly EconomyTerm[], day: number): EconomyTerm | undefined =>
  terms.find((t) => day >= t.s && day < t.e) ?? terms[terms.length - 1];

/** Presidential tenure on an ISO date, through the shared `termIdForDate`. */
export const termIdOn = (date: string, administrations: readonly Administration[]) => termIdForDate(date, administrations);

// --------------------------------------------------------------------------- formatting

const trim = (v: number, dp: number) => v.toFixed(dp);
/** Thousand barrels (SPR stock) -> "283.8 million barrels". */
export const fmtMillionBarrels = (thousand: number) => `${trim(thousand / 1000, 1)} million barrels`;
/** Thousand barrels per day -> "13.85 million b/d". */
export const fmtMbd = (thousandBpd: number) => `${thousandBpd < 0 ? "−" : ""}${trim(Math.abs(thousandBpd) / 1000, 2)} million b/d`;
/** Million kWh -> "388.8 TWh". */
export const fmtTwh = (millionKwh: number) => `${trim(millionKwh / 1000, 1)} TWh`;
/** Million cubic feet -> "518.8 Bcf". */
export const fmtBcf = (mmcf: number) => `${trim(mmcf / 1000, 1)} Bcf`;
