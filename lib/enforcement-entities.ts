import { z } from "zod";

/**
 * The immigration-enforcement track's entities (`pipeline/output/enforcement_series.json`,
 * `enforcement_notes.json`) and the curated source catalog
 * (`pipeline/reference/ice-removals-catalog.json`). A time series keyed by
 * `(period, metric, scope)` — no `bioguide_id`, no person key. It joins to the
 * rest of the site through dates: each fiscal year is attributed to a
 * presidential tenure (`term_id` into `administrations.json`). See
 * `docs/DATA_CONVENTIONS.md` ("Enforcement track") and
 * `docs/IMMIGRATION_ENFORCEMENT_METHODOLOGY.md`.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date");
/** Fiscal year, named by the calendar year it ends in (FY2013 = 2012-10-01..2013-09-30). */
export const fiscalYear = z.number().int().gte(2003).lte(2100);

/** `scope` is required with no default, so a future CBP or DHS-wide series cannot be spliced in silently. */
export const ENFORCEMENT_SCOPES = ["ice"] as const;
export const ENFORCEMENT_METRICS = ["removals"] as const;

// ---- curated source catalog (pipeline/reference/ice-removals-catalog.json) ----

export const iceSource = z.strictObject({
  id: z.string().min(1),
  title: z.string().min(1),
  publisher: z.string().min(1),
  url: z.url(),
  /** Snapshot in `pipeline/raw/ice/`. */
  file: z.string().min(1),
  /** Plain-text extract of the snapshot (`pnpm fetch:ice`); the transform reads only this. */
  text_file: z.string().min(1),
  kind: z.enum(["pdf", "html", "xlsx"]),
});
export type IceSource = z.infer<typeof iceSource>;

const quote = z.strictObject({
  source: z.string().min(1),
  /** Verbatim text from the source's text extract (whitespace-insensitive). Must contain the value. */
  evidence: z.string().min(1),
});

export const iceYear = z.strictObject({
  fy: fiscalYear,
  value: z.number().int().nonnegative(),
  status: z.enum(["final", "preliminary"]),
  source: z.string().min(1),
  /**
   * `text`: `evidence` is a verbatim quote from the source's text extract.
   * `figure`: the number is read from a chart image (`figure_file`), not
   * checkable by text; corroboration of the neighbouring years in the same
   * chart is what vouches for the reading.
   */
  evidence_kind: z.enum(["text", "figure"]),
  evidence: z.string().min(1),
  figure_file: z.string().min(1).optional(),
  /** Other ICE documents that print the same number. Each is checked like `evidence`. */
  corroboration: z.array(quote).default([]),
  note_ids: z.array(z.string().min(1)).default([]),
});
export type IceYear = z.infer<typeof iceYear>;

/** The FY2013 split (interior + border = total), checked at transform time. */
export const iceBreakdown = z.strictObject({
  fy: fiscalYear,
  source: z.string().min(1),
  interior: z.number().int().nonnegative(),
  border: z.number().int().nonnegative(),
  evidence_interior: z.string().min(1),
  evidence_border: z.string().min(1),
});

export const enforcementNote = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(["definition_change", "caveat", "context"]),
  /** First and last fiscal year the note applies to (`fy_end: null` = through the latest year). */
  fy_start: fiscalYear,
  fy_end: fiscalYear.nullable(),
  title: z.string().min(1),
  text: z.string().min(1),
  /** Catalog source id that documents it, or null where the note records general knowledge. */
  source: z.string().min(1).nullable(),
});
export type EnforcementNote = z.infer<typeof enforcementNote>;

export const iceCatalog = z.strictObject({
  /** Date the snapshots were retrieved (`as_of` on every series row). */
  retrieved_at: isoDate,
  sources: z.array(iceSource).min(1),
  years: z.array(iceYear).min(1),
  breakdowns: z.array(iceBreakdown),
  notes: z.array(enforcementNote),
});
export type IceCatalog = z.infer<typeof iceCatalog>;

// ---- outputs ----

export const administrationDays = z.strictObject({
  /** `term_id` into administrations.json. */
  term_id: isoDate,
  days: z.number().int().positive(),
});

export const enforcementRow = z.strictObject({
  /** Fiscal year (Oct 1 of the prior calendar year – Sep 30). */
  period: fiscalYear,
  period_type: z.literal("fiscal_year"),
  metric: z.enum(ENFORCEMENT_METRICS),
  scope: z.enum(ENFORCEMENT_SCOPES),
  value: z.number().int().nonnegative(),
  source: z.string().min(1),
  source_url: z.url(),
  /** Retrieval date of the snapshot. */
  as_of: isoDate,
  status: z.enum(["final", "preliminary"]),
  note_ids: z.array(z.string().min(1)),
  /** Administration in office on the year's last day (Sep 30) — computed from administrations.json. */
  administration_term_id: isoDate,
  /** True when the administration changed within the fiscal year. */
  blended: z.boolean(),
  /** Calendar days of the fiscal year under each administration (a Jan 20 day belongs to the incoming one). Not a split of the count. */
  administration_days: z.array(administrationDays).min(1),
});
export type EnforcementRow = z.infer<typeof enforcementRow>;

/**
 * `enforcement_report.json`: only the fields the page reads (the transform
 * writes more). Loose on purpose; the invariants the page depends on are
 * asserted in `lib/immigration-derive.ts`.
 */
export const enforcementReport = z.object({
  first_period: fiscalYear,
  last_period: fiscalYear,
  by_status: z.record(z.string(), z.number().int()),
  blended_periods: z.array(fiscalYear),
  corroborated_periods: z.array(fiscalYear),
  single_source_periods: z.array(fiscalYear),
  figure_read_periods: z.array(fiscalYear),
  anchors: z.array(z.object({ period: fiscalYear, value: z.number().int(), ok: z.boolean() })),
});
export type EnforcementReport = z.infer<typeof enforcementReport>;

// ---- annual-report freshness ----

/** Days after a fiscal year ends before ICE's locked annual report is expected (its report lands Dec–Jan). */
export const ICE_REPORT_GRACE_DAYS = 60;

/** Newest fiscal year whose end plus the grace period is on or before `today` (YYYY-MM-DD): the year that should be `final` by now. */
export function expectedFinalFiscalYear(today: string): number {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ICE_REPORT_GRACE_DAYS);
  // A fiscal year ends Sep 30 of its own number; Oct 1 onward belongs to the next one.
  return d.getUTCMonth() >= 9 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

/** Newest fiscal year the catalog carries as `final`, or null. */
export function latestFinalFiscalYear(years: readonly Pick<IceYear, "fy" | "status">[]): number | null {
  const final = years.filter((y) => y.status === "final").map((y) => y.fy);
  return final.length ? Math.max(...final) : null;
}
