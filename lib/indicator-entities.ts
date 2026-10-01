import { z } from "zod";

/**
 * The economic-indicators track's entities (`pipeline/output/indicator_series.json`,
 * `indicator_observations.json`) and the catalog of series in scope. Time series
 * keyed by `(series_id, date)` — no `bioguide_id`, no person key. The track
 * joins to the rest of the site through dates (date -> Congress number, date ->
 * presidential `term_id`). See `docs/DATA_CONVENTIONS.md` ("Indicators track")
 * and `docs/INDICATORS_METHODOLOGY.md`.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date");

/**
 * The single place the display window starts. Ingest and normalization keep each
 * series' full history; only the serving layer (`lib/indicator-data.ts`) applies
 * this. 1991-01-21 is the first date for which every series (GASREGW is the
 * binding one: FRED has no gas price for 1990-12-10..1991-01-14) is present.
 * It falls in the 102nd Congress, which began 1991-01-03.
 */
export const INDICATORS_DISPLAY_START = "1991-01-21";

/**
 * Freddie Mac changed the MORTGAGE30US survey method on this date (a series
 * break; see the series' caveats in `indicator_series.json`). The economy page
 * marks it on the mortgage chart.
 */
export const MORTGAGE_METHOD_CHANGE = "2022-11-17";

export const INDICATOR_FREQUENCIES = ["weekly", "monthly", "quarterly", "annual"] as const;
export const indicatorFrequency = z.enum(INDICATOR_FREQUENCIES);
export type IndicatorFrequency = z.infer<typeof indicatorFrequency>;

/** Nominal spacing, in days, used by the coverage assertion (a gap > 2x fails). */
export const NOMINAL_DAYS: Record<IndicatorFrequency, number> = {
  weekly: 7,
  monthly: 31,
  quarterly: 92,
  annual: 366,
};

/** Metadata only — how a later UI would roll a series up to a coarser period. Not applied here. */
export const suggestedRollup = z.enum(["level", "flow", "end_of_period"]);

export const indicatorSeries = z.strictObject({
  series_id: z.string().regex(/^[A-Z0-9]+$/),
  title: z.string().min(1),
  units: z.string().min(1),
  frequency: indicatorFrequency,
  seasonal_adjustment: z.string().min(1),
  source_agency: z.string().min(1),
  first_observation: isoDate,
  last_observation: isoDate,
  observation_count: z.number().int().positive(),
  attribution: z.string().min(1),
  suggested_rollup: suggestedRollup,
  caveats: z.array(z.string()),
  /** When this series was fetched from FRED (latest revised values as of then; ALFRED vintages are not used). */
  fetched_at: z.iso.datetime(),
});
export type IndicatorSeries = z.infer<typeof indicatorSeries>;

export const indicatorObservation = z.strictObject({
  series_id: z.string().regex(/^[A-Z0-9]+$/),
  date: isoDate,
  /** Exactly as FRED reports it (missing "." values have no row). Never coerced to 0/NaN. */
  value: z.number().finite(),
});
export type IndicatorObservation = z.infer<typeof indicatorObservation>;

/** A committed raw snapshot, `pipeline/raw/fred/<SERIES_ID>.json`. */
export const rawFredSeries = z.strictObject({
  fetched_at: z.iso.datetime(),
  series: z.strictObject({
    id: z.string(),
    title: z.string(),
    units: z.string(),
    frequency: z.string(),
    seasonal_adjustment: z.string(),
    observation_start: isoDate,
    observation_end: isoDate,
    last_updated: z.string(),
    notes: z.string(),
  }),
  /** `[date, value]` with FRED's own string value, `"."` meaning missing. */
  observations: z.array(z.tuple([isoDate, z.string()])).min(1),
});
export type RawFredSeries = z.infer<typeof rawFredSeries>;

export interface CatalogEntry {
  series_id: string;
  frequency: IndicatorFrequency;
  /** FRED's frequency string must start with this (cross-check on every run). */
  fred_frequency_prefix: string;
  source_agency: string;
  attribution: string;
  suggested_rollup: z.infer<typeof suggestedRollup>;
  caveats: string[];
  /**
   * Materiality tolerance for the scheduled refresh: a revision to an existing
   * observation only opens a PR if it exceeds this, in the series' own units.
   * New observations always count. See `docs/INDICATORS_METHODOLOGY.md`.
   */
  revision_tolerance: number;
}

/** The FRED notice the API terms require wherever this data is shown. */
export const FRED_API_NOTICE =
  "This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.";

const FRED = "Federal Reserve Bank of St. Louis, FRED®, https://fred.stlouisfed.org/";

export const CATALOG: readonly CatalogEntry[] = [
  {
    series_id: "GASREGW",
    frequency: "weekly",
    fred_frequency_prefix: "Weekly",
    source_agency: "U.S. Energy Information Administration",
    attribution: `U.S. Energy Information Administration, via ${FRED}`,
    suggested_rollup: "level",
    caveats: [
      "Weekly, dated by the Monday of the survey. FRED has no value for 1990-12-10 through 1991-01-14, so the first observation inside the display window is 1991-01-21.",
      "Nominal dollars, not adjusted for inflation.",
    ],
    revision_tolerance: 0.01,
  },
  {
    series_id: "MORTGAGE30US",
    frequency: "weekly",
    fred_frequency_prefix: "Weekly",
    source_agency: "Freddie Mac",
    attribution: `Freddie Mac, Primary Mortgage Market Survey®. Copyright Freddie Mac, reprinted with permission per FRED; via ${FRED}`,
    suggested_rollup: "level",
    caveats: [
      "Third-party copyright (Freddie Mac). FRED requires contacting the owner for any use beyond personal; served here with attribution on the project owner's decision — see docs/INDICATORS_METHODOLOGY.md.",
      "Freddie Mac changed the survey methodology on 2022-11-17 (now based on lender applications), a series break.",
      "Weekly, dated by the Thursday of the survey.",
    ],
    revision_tolerance: 0.01,
  },
  {
    series_id: "PAYEMS",
    frequency: "monthly",
    fred_frequency_prefix: "Monthly",
    source_agency: "U.S. Bureau of Labor Statistics",
    attribution: `U.S. Bureau of Labor Statistics, via ${FRED}`,
    suggested_rollup: "level",
    caveats: [
      "A level (thousands of persons), not a flow. \"Jobs added\" is derived (month-over-month change) in lib/indicator-derive.ts.",
      "Payrolls are heavily revised for months after first release; this holds the latest revised values at fetch time.",
    ],
    revision_tolerance: 100,
  },
  {
    series_id: "UNRATE",
    frequency: "monthly",
    fred_frequency_prefix: "Monthly",
    source_agency: "U.S. Bureau of Labor Statistics",
    attribution: `U.S. Bureau of Labor Statistics, via ${FRED}`,
    suggested_rollup: "level",
    caveats: [
      "No value for 2025-10-01 (the household survey was not collected that month); the gap is a single month.",
    ],
    revision_tolerance: 0.1,
  },
  {
    series_id: "CPIAUCSL",
    frequency: "monthly",
    fred_frequency_prefix: "Monthly",
    source_agency: "U.S. Bureau of Labor Statistics",
    attribution: `U.S. Bureau of Labor Statistics, via ${FRED}`,
    suggested_rollup: "level",
    caveats: [
      "An index (1982-84=100), not a rate. Inflation is derived (year-over-year percent change) in lib/indicator-derive.ts.",
      "No value for 2025-10-01 (October 2025 prices were not collected); year-over-year inflation is undefined for 2025-10 and 2026-10.",
    ],
    revision_tolerance: 0.1,
  },
  {
    series_id: "MEHOINUSA672N",
    frequency: "annual",
    fred_frequency_prefix: "Annual",
    source_agency: "U.S. Census Bureau",
    attribution: `U.S. Census Bureau, via ${FRED}`,
    suggested_rollup: "level",
    caveats: [
      "Dated January 1 of the calendar year the income was earned; published the following September, so it lags the other series by most of a year.",
      "Real dollars are re-based by the Census Bureau on each release, so every historical value shifts when the base year changes (FRED's units field says 2025 dollars, its notes say 2024).",
    ],
    revision_tolerance: 500,
  },
  {
    series_id: "FYFSGDA188S",
    frequency: "annual",
    fred_frequency_prefix: "Annual",
    source_agency: "U.S. Office of Management and Budget; Federal Reserve Bank of St. Louis",
    attribution: `U.S. Office of Management and Budget; calculated by the Federal Reserve Bank of St. Louis, via ${FRED}`,
    suggested_rollup: "level",
    caveats: [
      "Fiscal year (October-September), dated January 1 of the calendar year the fiscal year ENDS (FY2020 = 2020-01-01). Verified against the series' values (FY2020 = -14.5% of GDP).",
      "Negative = deficit (FRED's sign, kept as-is).",
    ],
    revision_tolerance: 0.1,
  },
  {
    series_id: "FYGFGDQ188S",
    frequency: "quarterly",
    fred_frequency_prefix: "Quarterly",
    source_agency: "U.S. Office of Management and Budget; Federal Reserve Bank of St. Louis",
    attribution: `U.S. Office of Management and Budget; calculated by the Federal Reserve Bank of St. Louis, via ${FRED}`,
    suggested_rollup: "end_of_period",
    caveats: [
      "Headline debt measure: debt held by the public (the measure CBO uses), as % of GDP.",
      "Dated at the first day of the quarter. Begins 1970-01-01 (not 1966).",
    ],
    revision_tolerance: 0.1,
  },
  {
    series_id: "GFDEGDQ188S",
    frequency: "quarterly",
    fred_frequency_prefix: "Quarterly",
    source_agency: "U.S. Office of Management and Budget; Federal Reserve Bank of St. Louis",
    attribution: `U.S. Office of Management and Budget; calculated by the Federal Reserve Bank of St. Louis, via ${FRED}`,
    suggested_rollup: "end_of_period",
    caveats: [
      "Total public debt, including debt the government owes itself (intragovernmental). Ingested alongside the held-by-the-public measure; which to display is deferred.",
      "Dated at the first day of the quarter.",
    ],
    revision_tolerance: 0.1,
  },
  {
    series_id: "USREC",
    frequency: "monthly",
    fred_frequency_prefix: "Monthly",
    source_agency: "National Bureau of Economic Research (via Federal Reserve Bank of St. Louis)",
    attribution: `National Bureau of Economic Research business-cycle dates, as interpreted by the Federal Reserve Bank of St. Louis, via ${FRED}`,
    suggested_rollup: "level",
    caveats: [
      "Context only, for shading future charts: 1 = recession month, 0 = expansion. The month a turning point is assigned to is FRED's convention, not NBER's judgment.",
    ],
    revision_tolerance: 0.5,
  },
];
