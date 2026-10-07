import { z } from "zod";

/**
 * The Supreme Court "Decisions" track: institutional counts from the Supreme Court Database (SCDB),
 * case-centered by citation. Key is `(term, issue_area_id)` - NOT a `bioguide_id` and not a justice id.
 * Case-grain data is never stored, only counts. Unit of analysis, buckets and caveats:
 * `docs/DECISIONS_METHODOLOGY.md`; conventions: `docs/DATA_CONVENTIONS.md` section 14.
 */

/** Dissent buckets: `min(minVotes, 4)`. 0 = unanimous (9-0), 4 = 5-4 (and 4-4 ties). */
export const DISSENT_BUCKETS = 5;
export const DISSENT_BUCKET_LABELS = ["Unanimous", "8–1", "7–2", "6–3", "5–4"] as const;

/** First term the SCDB modern (case-centered) file covers. */
export const DECISIONS_FIRST_TERM = 1946;

export class DecisionsDataError extends Error {
  constructor(message: string) {
    super(`decisions: ${message}`);
    this.name = "DecisionsDataError";
  }
}

const int = z.number().int();

/** The columns read from the raw SCDB CSV (everything else is ignored). */
export const scdbCaseRow = z.object({
  caseId: z.string().min(1),
  term: z.coerce.number().int().min(DECISIONS_FIRST_TERM),
  decisionType: z.coerce.number().int().min(1).max(7),
  majVotes: z.coerce.number().int().min(0).max(9),
  minVotes: z.coerce.number().int().min(0).max(9),
  /** SCDB leaves it blank for most rows, 1 when the vote split is unclear. */
  voteUnclear: z.string().transform((s) => (s.trim() === "" ? 0 : Number(s))).pipe(z.union([z.literal(0), z.literal(1)])),
  /** Blank = no issue area coded. */
  issueArea: z.string().transform((s) => (s.trim() === "" ? null : Number(s))).pipe(z.number().int().min(1).nullable()),
  chief: z.string().min(1),
  dateDecision: z.string(),
  caseName: z.string(),
  usCite: z.string(),
  sctCite: z.string(),
  ledCite: z.string(),
  lexisCite: z.string(),
});
export type ScdbCaseRow = z.infer<typeof scdbCaseRow>;

export const issueAreaCatalogEntry = z.strictObject({
  id: z.string().regex(/^[a-z-]+$/),
  scdb_code: int.min(1),
  label: z.string().min(1),
});
export type IssueAreaCatalogEntry = z.infer<typeof issueAreaCatalogEntry>;
export const issueAreaCatalog = z.object({ areas: z.array(issueAreaCatalogEntry).min(1) });

export const chiefReferenceEntry = z.strictObject({
  scdb_chief: z.string().min(1),
  name: z.string().min(1),
  justice_id: int,
  appointing_president: z.string().min(1),
  appointing_party: z.enum(["Democratic", "Republican"]),
});
export type ChiefReferenceEntry = z.infer<typeof chiefReferenceEntry>;
export const chiefReference = z.object({ chiefs: z.array(chiefReferenceEntry).min(1) });

/** `decisions_counts.json`: one row per (term, issue area); `issue_area_id` null = no issue area coded. */
export const decisionCountRow = z.strictObject({
  term: int.min(DECISIONS_FIRST_TERM),
  issue_area_id: z.string().nullable(),
  n: int.min(1),
  d0: int.min(0),
  d1: int.min(0),
  d2: int.min(0),
  d3: int.min(0),
  d4: int.min(0),
});
export type DecisionCountRow = z.infer<typeof decisionCountRow>;

/** `decisions_cases.json`: one row per case in scope (the list under the charts). Names are title-cased from SCDB's capitals. */
export const decisionCaseRow = z.strictObject({
  case_id: z.string().min(1),
  term: int.min(DECISIONS_FIRST_TERM),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1),
  /** U.S. Reports cite, else S. Ct., else L. Ed., else Lexis; empty only if SCDB has none. */
  cite: z.string(),
  issue_area_id: z.string().nullable(),
  /** Dissent bucket 0-4. */
  band: int.min(0).max(4),
  maj: int.min(0).max(9),
  min: int.min(0).max(9),
});
export type DecisionCaseRow = z.infer<typeof decisionCaseRow>;

export const chiefSpan = z.strictObject({
  scdb_chief: z.string(),
  name: z.string(),
  justice_id: int,
  start_term: int,
  end_term: int,
  appointing_president: z.string(),
  appointing_party: z.enum(["Democratic", "Republican"]),
});
export type ChiefSpan = z.infer<typeof chiefSpan>;

export const decisionsMeta = z.strictObject({
  scdb_version: z.string().regex(/^\d{4}_\d{2}$/),
  /** Display form, e.g. "Version 2026 Release 01". */
  scdb_version_label: z.string(),
  source_file: z.string(),
  first_term: int,
  data_through_term: int,
  case_count: int,
  exclusions: z.strictObject({
    /** Cases of decision type 2 (summary per curiam, no oral argument). */
    summary_dispositions: int,
    /** Cases of decision type 4 (decrees). */
    decrees: int,
    /** Orally argued cases whose vote split SCDB marks unclear. */
    unclear_votes: int,
  }),
  unclassified_count: int,
  citation: z.string(),
  license: z.string(),
  chief_spans: z.array(chiefSpan).min(1),
  issue_areas: z.array(z.strictObject({ id: z.string(), label: z.string() })).min(1),
});
export type DecisionsMeta = z.infer<typeof decisionsMeta>;

export const scdbManifest = z.strictObject({
  version: z.string().regex(/^\d{4}_\d{2}$/),
  url: z.string().url(),
  zip_sha256: z.string().length(64),
  csv_file: z.string(),
  csv_sha256: z.string().length(64),
  rows: int,
  encoding: z.literal("latin1"),
  fetched: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type ScdbManifest = z.infer<typeof scdbManifest>;
