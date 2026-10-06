import { z } from "zod";

/**
 * Schemas for the troops-abroad track (DMDC "Military and Civilian Personnel by Service/Agency by State/Country",
 * active duty only). See docs/TROOPS_METHODOLOGY.md. The join key to the trade/aid tracks is `iso3` =
 * `countries.json`'s `country_code` where the place is a real country.
 */
export class TroopsDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TroopsDataError";
  }
}

/** The active-duty columns carried per row. `total` is DMDC's own printed Total column (includes Coast Guard). */
export const BRANCH_FIELDS = ["army", "navy", "marine_corps", "air_force", "space_force", "coast_guard", "total"] as const;
export type BranchField = (typeof BRANCH_FIELDS)[number];

/** `host` = a country or place that hosts forces; `territory` = U.S. territory inside DMDC's overseas section; `afloat_unassigned` = UNKNOWN/ZZ-UNKNOWN/UNDEFINED. */
export const ROW_CLASSES = ["host", "territory", "afloat_unassigned"] as const;

/** `value` = a printed number; `suppressed` = a blank starred (`*`) row, not zero; `null` = `N/A` (Army did not report). */
export const ROW_STATES = ["value", "suppressed", "null"] as const;

const count = z.number().int().nonnegative().nullable();

export const troopsRow = z
  .object({
    /** Quarter end, `YYYY-MM` (03, 06, 09, 12). */
    period: z.string().regex(/^\d{4}-(03|06|09|12)$/),
    /** Canonical place name (alias table), one per `source_name` family. */
    name: z.string().min(1),
    /** DMDC's own label for the place in this file (without a trailing `*`). */
    source_name: z.string().min(1),
    class: z.enum(ROW_CLASSES),
    /** ISO 3166-1 alpha-3 (plus XKX) where the place is a real country or territory with a code; null otherwise. */
    iso3: z.string().regex(/^[A-Z]{3}$/).nullable(),
    state: z.enum(ROW_STATES),
    army: count,
    navy: count,
    marine_corps: count,
    air_force: count,
    /** Null when the file has no Space Force column or Space Force is folded into `air_force` (see meta.space_force). */
    space_force: count,
    coast_guard: count,
    total: count,
  })
  .strict();
export type TroopsRow = z.infer<typeof troopsRow>;

const printed = z.partialRecord(z.enum(BRANCH_FIELDS), count);

export const periodMeta = z
  .object({
    period: z.string().regex(/^\d{4}-(03|06|09|12)$/),
    as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    file: z.string().min(1),
    /** `separate` = own column; `merged_into_air_force` = column header reads AIR FORCE/SPACE FORCE; `none` = no Space Force reporting. */
    space_force: z.enum(["none", "merged_into_air_force", "separate"]),
    army_not_reported: z.boolean(),
    /** Contingency/deployed forces: included through Sep 2017, excluded from Dec 2017 (permanent assignment only). */
    basis: z.enum(["includes_deployed", "permanently_assigned"]),
    printed: z.object({ united_states_total: printed, overseas_total: printed, grand_total: printed }).strict(),
    /** Σ overseas row totals − printed overseas total; null when untestable (Army/Total N/A). */
    overseas_gap: z.number().int().nullable(),
    overseas_gate: z.enum(["exact", "documented_exception", "untestable"]),
    /** Σ U.S. row totals − printed U.S. total; null when untestable. */
    us_gap: z.number().int().nullable(),
    /** Printed grand total − (printed U.S. + printed overseas); null when untestable. */
    grand_gap: z.number().int().nullable(),
    /** Source rows dropped as exact repeats of an earlier row (kept in the gate sum, not in the output). */
    duplicate_rows_dropped: z.array(z.object({ source_name: z.string(), total: z.number().int() }).strict()),
    /** Overseas rows that are blank starred (suppressed). */
    suppressed_rows: z.array(z.string()),
    /** Territory rows (inside DMDC's overseas total). */
    territory_total: z.number().int().nonnegative().nullable(),
    /** Σ UNKNOWN/ZZ-UNKNOWN/UNDEFINED rows (inside the overseas total, and so inside `abroad_total`). */
    afloat_unassigned_total: z.number().int().nonnegative().nullable(),
    /** Overseas total minus territories; null when `overseas_total` is untestable or the Total column is N/A. */
    abroad_total: z.number().int().nonnegative().nullable(),
    flags: z.array(z.string()),
  })
  .strict();
export type PeriodMeta = z.infer<typeof periodMeta>;

export const troopsMeta = z
  .object({
    source: z.string(),
    source_url: z.string(),
    periods_covered: z.array(z.string()),
    first_period: z.string(),
    latest_period: z.string(),
    data_through: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** The Dec 2017 change in what DMDC counts. Series are not like-for-like across it. */
    break: z
      .object({
        first_period_after: z.string(),
        before: z.string(),
        after: z.string(),
        evidence: z.string(),
        contingency_hosts_not_reported: z.array(z.string()),
        not_reported_periods: z.array(z.string()),
      })
      .strict(),
    removal: z
      .object({
        hosts: z.array(z.object({ name: z.string(), last_row_period: z.string(), first_period_without_rows: z.string().nullable() }).strict()),
        note: z.string(),
      })
      .strict(),
    space_force: z.object({ merged_periods: z.array(z.string()), separate_from: z.string(), note: z.string() }).strict(),
    army_not_reported_periods: z.array(z.string()),
    territories: z.array(z.string()),
    /** The documented gaps the overseas gate allows, and why. */
    exceptions: z.array(z.object({ period: z.string(), gate: z.enum(["overseas", "grand"]), gap: z.number().int(), reason: z.string() }).strict()),
    derived: z.object({ abroad_definition: z.string(), abroad_omitted_periods: z.array(z.string()), abroad_omitted_reason: z.string() }).strict(),
    periods: z.array(periodMeta),
  })
  .strict();
export type TroopsMeta = z.infer<typeof troopsMeta>;

export const aliasEntry = z
  .object({
    /** DMDC label as printed (uppercase, trailing `*` removed). */
    source: z.string().min(1),
    name: z.string().min(1),
    class: z.enum(ROW_CLASSES),
    iso3: z.string().regex(/^[A-Z]{3}$/).nullable(),
  })
  .strict();
export type AliasEntry = z.infer<typeof aliasEntry>;
export const aliasTable = z.array(aliasEntry);

// --- History (1950-2007): troopdata + DMDC 309A -----------------------------------------------------------------------

export const HISTORY_SOURCES = ["troopdata", "dmdc_309a"] as const;
/** `june` only for 1950-1956 (the earliest years have no September snapshot); `september` from 1957. */
export const HISTORY_SNAPSHOTS = ["june", "september"] as const;
/** `estimate`: Sep 2006 and Sep 2007, which DMDC does not publish (compiled/press-based in troopdata). */
export const HISTORY_QUALITIES = ["reported", "estimate"] as const;

export const historyRow = z
  .object({
    year: z.number().int().min(1950).max(2007),
    snapshot: z.enum(HISTORY_SNAPSHOTS),
    name: z.string().min(1),
    source_name: z.string().min(1),
    class: z.enum(ROW_CLASSES),
    iso3: z.string().regex(/^[A-Z]{3}$/).nullable(),
    /** `suppressed` = the source marks the figure unavailable or elsewhere (Iraq/Kuwait/Afghanistan 2003-05), never 0. */
    state: z.enum(["value", "suppressed"]),
    army: count,
    navy: count,
    marine_corps: count,
    air_force: count,
    total: count,
    source: z.enum(HISTORY_SOURCES),
    quality: z.enum(HISTORY_QUALITIES),
  })
  .strict();
export type HistoryRow = z.infer<typeof historyRow>;

export const historyYearMeta = z
  .object({
    year: z.number().int(),
    snapshot: z.enum(HISTORY_SNAPSHOTS),
    source: z.enum(HISTORY_SOURCES),
    quality: z.enum(HISTORY_QUALITIES),
    hosts: z.number().int().nonnegative(),
    /** Σ host rows + afloat/unassigned (DMDC years only); territories out. */
    abroad_total: z.number().int().nonnegative(),
    /** Null for troopdata-only years: troopdata carries no afloat/undistributed rows. */
    afloat_unassigned_total: z.number().int().nonnegative().nullable(),
    territory_total: z.number().int().nonnegative().nullable(),
    /** DMDC years: the printed "Total - Foreign Countries". */
    dmdc_foreign_total: z.number().int().nullable(),
    suppressed: z.array(z.string()),
    flags: z.array(z.string()),
  })
  .strict();

/**
 * DMDC's separate "in/around Iraq" (OIF) and "in/around Afghanistan" (OEF) deployment totals under the 309A table, for the
 * years the country rows print those hosts as unavailable. An annotation, not a row: it is a different basis (see `basis`),
 * may overlap country rows (forces deployed from Germany are also in Germany), and is never added to an abroad total.
 */
export const historyContingency = z
  .object({
    year: z.number().int().min(2003).max(2005),
    operation: z.enum(["OIF", "OEF"]),
    name: z.string().min(1),
    iso3: z.string().regex(/^[A-Z]{3}$/),
    total: z.number().int().positive(),
    army: z.number().int().nonnegative(),
    navy: z.number().int().nonnegative(),
    marine_corps: z.number().int().nonnegative(),
    air_force: z.number().int().nonnegative(),
    /** `active_duty`: Sep 2003 (the active-duty table). `includes_reserve_guard`: 2004 and 2005 add deployed Reserve/National Guard, so not comparable with the 2003 figure or the country rows. */
    basis: z.enum(["active_duty", "includes_reserve_guard"]),
    /** DMDC prints the 2005 deployments as "not complete - rounded strengths". */
    rounded: z.boolean(),
    dmdc_label: z.string().min(1),
  })
  .strict();
export type HistoryContingency = z.infer<typeof historyContingency>;

export const historyMeta = z
  .object({
    source: z.string(),
    credits: z.array(z.string()),
    first_year: z.number().int(),
    last_year: z.number().int(),
    handoff: z.string(),
    comparability: z.array(z.string()),
    gaps: z.array(z.object({ years: z.array(z.number().int()), reason: z.string() }).strict()),
    substitutions: z.array(z.object({ year: z.number().int(), note: z.string() }).strict()),
    dmdc_years: z.array(z.number().int()),
    /** Iraq/Afghanistan deployment totals DMDC prints beside the unavailable country rows; annotation only. */
    contingency: z.array(historyContingency),
    troopdata_commit: z.string(),
    years: z.array(historyYearMeta),
  })
  .strict();
export type HistoryMeta = z.infer<typeof historyMeta>;
export type HistoryYearMeta = z.infer<typeof historyYearMeta>;

export const historyAliasEntry = aliasEntry.extend({ system: z.enum(HISTORY_SOURCES) }).strict();
export type HistoryAliasEntry = z.infer<typeof historyAliasEntry>;
export const historyAliasTable = z.array(historyAliasEntry);
