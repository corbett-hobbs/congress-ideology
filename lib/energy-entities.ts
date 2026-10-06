import { z } from "zod";
import { INDICATORS_DISPLAY_START } from "./indicator-entities";

/**
 * The energy track's entities (`pipeline/output/energy_series.json`,
 * `energy_observations.json`) and the catalog of EIA series in scope. Time series keyed by
 * `(series_id, date)`: no `bioguide_id`, no person key. Joins to presidents and Congress through
 * dates, exactly like the indicators track (DATA_CONVENTIONS section 8). Definitions, the tier of
 * each series and the revision policy: `docs/ENERGY_METHODOLOGY.md`; pre-flight findings:
 * `docs/ENERGY_PREFLIGHT.md`.
 */

/** One display window for every time-series page; the energy track does not add its own. */
export const ENERGY_DISPLAY_START = INDICATORS_DISPLAY_START;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date");

export const ENERGY_FREQUENCIES = ["weekly", "monthly"] as const;
export const energyFrequency = z.enum(ENERGY_FREQUENCIES);
export type EnergyFrequency = z.infer<typeof energyFrequency>;

export const ENERGY_GROUPS = ["petroleum", "spr", "natural_gas", "electricity"] as const;
export const energyGroup = z.enum(ENERGY_GROUPS);
export type EnergyGroup = z.infer<typeof energyGroup>;

/**
 * Attribution tier (pre-flight section 6): 1 = directly presidential (shared with Congress),
 * 2 = policy-enabled but mostly market/technology-driven, 3 = weakly attributable context.
 */
export const energyTier = z.union([z.literal(1), z.literal(2), z.literal(3)]);

/**
 * Which observations are still preliminary:
 * - `trailing_12_months`: the 12 months up to the series' last observation (petroleum and gas
 *   monthly data are preliminary until EIA's annual volumes; the true lag is not verified).
 * - `current_and_prior_calendar_year`: EIA's Electric Power Monthly says values for 2024 and
 *   earlier are final and 2025 and 2026 are preliminary; the rule is "fetch year and the year before".
 * - `none`: a stock reading, never hatched.
 */
export const STATUS_RULES = ["trailing_12_months", "current_and_prior_calendar_year", "none"] as const;
export const statusRule = z.enum(STATUS_RULES);
export type StatusRule = z.infer<typeof statusRule>;

export const observationStatus = z.enum(["final", "preliminary"]);
export type ObservationStatus = z.infer<typeof observationStatus>;

export const energySeries = z.strictObject({
  series_id: z.string().regex(/^[A-Z0-9_]+$/),
  title: z.string().min(1),
  /** Display units (the source's own units, spelled out). */
  units: z.string().min(1),
  frequency: energyFrequency,
  group: energyGroup,
  tier: energyTier,
  seasonal_adjustment: z.string().min(1),
  source_agency: z.string().min(1),
  first_observation: isoDate,
  last_observation: isoDate,
  observation_count: z.number().int().positive(),
  attribution: z.string().min(1),
  status_rule: statusRule,
  caveats: z.array(z.string()),
  /** When this series was fetched (latest values as of then; no vintages are kept). */
  fetched_at: z.iso.datetime(),
});
export type EnergySeries = z.infer<typeof energySeries>;

export const energyObservation = z.strictObject({
  series_id: z.string().regex(/^[A-Z0-9_]+$/),
  /** Monthly series: the first day of the month. Weekly: the week-ending day as published. */
  date: isoDate,
  value: z.number().finite(),
  status: observationStatus,
});
export type EnergyObservation = z.infer<typeof energyObservation>;

/** A committed raw snapshot, `pipeline/raw/eia/<SERIES_ID>.json`. */
export const rawEnergySeries = z.strictObject({
  fetched_at: z.iso.datetime(),
  series: z.strictObject({
    id: z.string(),
    /** The title and units the API itself returned (cross-checked against the catalog). */
    title: z.string(),
    units: z.string(),
    /** API route (no key) and the query that produced this file, for reproducibility. */
    route: z.string(),
    query: z.string(),
    /** `response.total` for the query; the fetch fails unless every row arrived. */
    total: z.number().int().nonnegative(),
  }),
  /** `[period, value]`: period `YYYY-MM` or `YYYY-MM-DD`; value is the API's string, or null when missing. */
  observations: z.array(z.tuple([z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/), z.string().nullable()])).min(1),
});
export type RawEnergySeries = z.infer<typeof rawEnergySeries>;

export type EnergySource =
  | { route: "total-energy"; facets: { msn: string }; frequency: "monthly" }
  | { route: string; facets: Record<string, string>; valueField: string; frequency: EnergyFrequency };

export interface EnergyCatalogEntry {
  series_id: string;
  title: string;
  units: string;
  /** The `units` string the API returns for this series; a change means the series was redefined. */
  source_units: string;
  frequency: EnergyFrequency;
  group: EnergyGroup;
  tier: 1 | 2 | 3;
  source: EnergySource;
  status_rule: StatusRule;
  caveats: string[];
  /** Materiality tolerance for revisions of PRELIMINARY values, in the series' own units (about 1%). Revisions of final values always count. */
  revision_tolerance: number;
  /** True when the series legitimately begins after the display window starts. */
  late_start?: boolean;
}

export const EIA_SOURCE_AGENCY = "U.S. Energy Information Administration";
export const EIA_ATTRIBUTION = "Source: U.S. Energy Information Administration";
const NSA = "Not seasonally adjusted";
export const ENERGY_SEASONAL_ADJUSTMENT = NSA;

const MER_NOTE = "Monthly Energy Review series; the newest month is preliminary and sometimes estimated or forecasted.";
const PETRO = "Thousand barrels per day";

const mer = (
  series_id: string,
  title: string,
  units: string,
  source_units: string,
  group: EnergyGroup,
  tier: 1 | 2 | 3,
  status_rule: StatusRule,
  revision_tolerance: number,
  caveats: string[] = [],
): EnergyCatalogEntry => ({
  series_id,
  title,
  units,
  source_units,
  frequency: "monthly",
  group,
  tier,
  source: { route: "total-energy", facets: { msn: series_id }, frequency: "monthly" },
  status_rule,
  caveats: [MER_NOTE, ...caveats],
  revision_tolerance,
});

const GEN = "Million kilowatthours";
const GEN_NOTE = "Utility-scale generation only: excludes small-scale solar photovoltaic (see ENERGY_SMALL_SOLAR). All sectors from 1989; through 1988 electric utilities only.";

/**
 * Series in scope (pre-flight section 3). Order is the output order. CO2, total-energy balances and
 * crude price are deliberately not here (deferred / dropped in the pre-flight).
 */
export const ENERGY_CATALOG: readonly EnergyCatalogEntry[] = [
  mer("PNPRPUS", "Total petroleum field production (crude oil plus natural gas liquids)", PETRO, "Thousand Barrels per Day", "petroleum", 2, "trailing_12_months", 220, ["Total petroleum, not crude only: adds natural gas liquids."]),
  mer("PAPRPUS", "Crude oil production", PETRO, "Thousand Barrels per Day", "petroleum", 2, "trailing_12_months", 140),
  mer("PAIMPUS", "Petroleum imports (crude oil plus products)", PETRO, "Thousand Barrels per Day", "petroleum", 2, "trailing_12_months", 80),
  mer("PAEXPUS", "Petroleum exports (crude oil plus products)", PETRO, "Thousand Barrels per Day", "petroleum", 2, "trailing_12_months", 120),
  mer("PANIPUS", "Petroleum net imports (crude oil plus products)", PETRO, "Thousand Barrels per Day", "petroleum", 2, "trailing_12_months", 120, ["Imports minus exports, as EIA publishes it; negative means the U.S. exported more than it imported."]),
  mer("PATCPUS", "Petroleum products supplied (the consumption proxy)", PETRO, "Thousand Barrels per Day", "petroleum", 3, "trailing_12_months", 200, ["Products supplied approximates consumption; it is not a direct measure of use."]),
  mer("COIMPUS", "Crude oil imports", PETRO, "Thousand Barrels per Day", "petroleum", 2, "trailing_12_months", 70, ["Crude oil only; includes imports for the Strategic Petroleum Reserve."]),
  mer("COEXPUS", "Crude oil exports", PETRO, "Thousand Barrels per Day", "petroleum", 2, "trailing_12_months", 40, ["Crude oil only. The statutory restriction on crude exports was repealed in December 2015; see energy_actions.json."]),
  {
    series_id: "WCSSTUS1",
    title: "Strategic Petroleum Reserve crude oil stocks",
    units: "Thousand barrels",
    source_units: "MBBL",
    frequency: "weekly",
    group: "spr",
    tier: 1,
    source: { route: "petroleum/stoc/wstk", facets: { series: "WCSSTUS1" }, valueField: "value", frequency: "weekly" },
    status_rule: "none",
    caveats: ["A stock reading at the end of the week, not a flow. Levels are shared between executive drawdowns and exchanges, congressionally mandated sales and refills."],
    revision_tolerance: 1000,
  },
  mer("NGPRPUS", "Natural gas production (dry)", "Billion cubic feet", "Billion Cubic Feet", "natural_gas", 2, "trailing_12_months", 35),
  {
    series_id: "N9133US2",
    title: "Liquefied natural gas exports",
    units: "Million cubic feet",
    source_units: "MMCF",
    frequency: "monthly",
    group: "natural_gas",
    tier: 2,
    source: { route: "natural-gas/move/expc", facets: { series: "N9133US2" }, valueField: "value", frequency: "monthly" },
    status_rule: "trailing_12_months",
    caveats: [
      "The series starts in January 1997. Large-scale exports from the lower 48 begin in February 2016; what the earlier, much smaller volumes were is not verified.",
      "Export permits precede exports by years, so a policy flag on this series marks an action, not a cause.",
    ],
    revision_tolerance: 5000,
    late_start: true,
  },
  mer("CLETPUS", "Electricity net generation from coal, all sectors", GEN, "Million Kilowatthours", "electricity", 3, "current_and_prior_calendar_year", 560, [GEN_NOTE]),
  mer("NGETPUS", "Electricity net generation from natural gas, all sectors", GEN, "Million Kilowatthours", "electricity", 3, "current_and_prior_calendar_year", 1600, [GEN_NOTE]),
  mer("NUETPUS", "Electricity net generation from nuclear, all sectors", GEN, "Million Kilowatthours", "electricity", 3, "current_and_prior_calendar_year", 700, [GEN_NOTE]),
  mer("HVETPUS", "Electricity net generation from conventional hydroelectric, all sectors", GEN, "Million Kilowatthours", "electricity", 3, "current_and_prior_calendar_year", 300, [GEN_NOTE, "Pumped storage is a separate series from 1990; through 1989 it is included here."]),
  mer("WYETPUS", "Electricity net generation from wind, all sectors", GEN, "Million Kilowatthours", "electricity", 3, "current_and_prior_calendar_year", 400, [GEN_NOTE]),
  mer("SOETPUS", "Electricity net generation from utility-scale solar, all sectors", GEN, "Million Kilowatthours", "electricity", 3, "current_and_prior_calendar_year", 400, [GEN_NOTE]),
  mer("PAETPUS", "Electricity net generation from petroleum, all sectors", GEN, "Million Kilowatthours", "electricity", 3, "current_and_prior_calendar_year", 15, [GEN_NOTE]),
  mer("ELETPUS", "Electricity net generation, all fuels, all sectors", GEN, "Million Kilowatthours", "electricity", 3, "current_and_prior_calendar_year", 4000, [GEN_NOTE, "Includes sources not listed separately (wood, waste, geothermal, other gases, pumped storage); the reader derives \"other\" as this total minus the named fuels."]),
  {
    series_id: "ELEC_SMALL_SOLAR",
    title: "Small-scale solar photovoltaic generation (estimated)",
    units: "Thousand megawatthours",
    source_units: "thousand megawatthours",
    frequency: "monthly",
    group: "electricity",
    tier: 3,
    source: {
      route: "electricity/electric-power-operational-data",
      facets: { fueltypeid: "DPV", sectorid: "99", location: "US" },
      valueField: "generation",
      frequency: "monthly",
    },
    status_rule: "current_and_prior_calendar_year",
    caveats: [
      "EIA's estimate of rooftop and other small-scale solar; starts January 2014 and is not part of the utility-scale series above.",
      "Thousand megawatthours equal million kilowatthours, so it adds directly to the utility-scale solar series.",
    ],
    revision_tolerance: 110,
    late_start: true,
  },
];

/** `ELEC_SMALL_SOLAR` is the one series on a different route and start date; named so the UI cannot confuse it with `SOETPUS`. */
export const ENERGY_SMALL_SOLAR = "ELEC_SMALL_SOLAR";

/** Whole-row cap the API enforces; the fetch asks for this many and pages by `offset`. */
export const EIA_PAGE_LENGTH = 5000;
