import { z } from "zod";

/**
 * The Congress "Laws" track: every public law from the 93rd Congress on, one row per law.
 * Key is `law_id` (`118-pub-90`) - NOT a `bioguide_id`; the sponsor is a column. Counts only for
 * charts, case-grain rows for the list. Methodology: `docs/LAWS_METHODOLOGY.md`; conventions:
 * `docs/DATA_CONVENTIONS.md` section 15; source behaviour measured in `docs/LAWS_PREFLIGHT.md`.
 */

/** First Congress on the page (1973). Everything earlier lacks the structured fields. */
export const LAWS_FIRST_CONGRESS = 93;
/** First Congress GovInfo publishes Bill Status XML for (2003). Earlier Congresses come from the Congress.gov API. */
export const BILLSTATUS_FIRST_CONGRESS = 108;
/** A law may be signed up to this many days into January after its Congress ends (the pre-flight found 35 of 1,080 sampled). */
export const LAW_DATE_GRACE_END = "01-20";

export class LawsDataError extends Error {
  constructor(message: string) {
    super(`laws: ${message}`);
    this.name = "LawsDataError";
  }
}

/** "93rd", "101st", "112th". */
export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** The first calendar year of a Congress (93rd = 1973). */
export const congressStartYear = (congress: number) => 1789 + 2 * (congress - 1);
/** Inclusive window a law of this Congress may be dated in: 3 January of its first year to 20 January after it ends. */
export const congressDateWindow = (congress: number): { start: string; end: string } => ({
  start: `${congressStartYear(congress)}-01-03`,
  end: `${congressStartYear(congress) + 2}-${LAW_DATE_GRACE_END}`,
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const int = z.number().int();

export const BILL_TYPES = ["hr", "s", "hjres", "sjres"] as const;
export const billType = z.enum(BILL_TYPES);
export type BillType = z.infer<typeof billType>;
export const chamber = z.enum(["House", "Senate"]);

/** A roll-call reference attached to an action (`recordedVotes`). Session 2 reads these; Session 1 only keeps them. */
export const rawVote = z.object({
  chamber,
  roll: int,
  session: int.nullable(),
  /** ISO date of the vote (the source gives a UTC timestamp; only the date is kept). */
  date: isoDate.nullable(),
});

/** One action, slimmed to what Sessions 1-2 read: passage, conference, concurrence, veto, becoming law. */
export const rawAction = z.object({
  date: isoDate,
  type: z.string(),
  text: z.string(),
  /** Source system code: 9 = Library of Congress, 2 = House floor actions, null = Senate / unlabelled. */
  src: int.nullable(),
  votes: z.array(rawVote).optional(),
});
export type RawAction = z.infer<typeof rawAction>;

/** A dated committee step on a bill ("Referred to", "Reported by", "Markup by", "Hearings by"). */
export const rawCommitteeActivity = z.object({ name: z.string(), date: isoDate.nullable() });

/**
 * A committee (or subcommittee) a bill went through, as the source codes it: `hsif00` (House Energy and Commerce),
 * `hsif14` (its Health Subcommittee). The code is the join key to `committees.json` / `subcommittees.json` once uppercased
 * and stripped of the trailing `00` of a full committee.
 */
export const rawCommittee = z.object({
  code: z.string().regex(/^[a-z]{4}\d{2}$/),
  name: z.string(),
  chamber: z.string().nullable(),
  activities: z.array(rawCommitteeActivity),
  subcommittees: z.array(z.object({ code: z.string().regex(/^[a-z]{4}\d{2}$/), name: z.string(), activities: z.array(rawCommitteeActivity) })),
});
export type RawCommittee = z.infer<typeof rawCommittee>;

/**
 * One public law as either fetcher keeps it. Identical shape from GovInfo Bill Status XML and the Congress.gov
 * API, so the transform and the overlap gate treat them the same. A bill that became two laws (99th H.J.Res. 738)
 * is two records with the same bill fields.
 */
export const rawLaw = z.object({
  law_id: z.string().regex(/^\d+-pub-\d+$/),
  congress: int.min(LAWS_FIRST_CONGRESS),
  number: int.min(1),
  bill_type: billType,
  bill_number: z.string().regex(/^\d+$/),
  origin_chamber: chamber.nullable(),
  title: z.string(),
  introduced: isoDate.nullable(),
  sponsor: z.string().regex(/^[A-Z]\d{6}$/).nullable(),
  /** The sponsor's name as the source prints it; only used to report an unresolved id. */
  sponsor_name: z.string().nullable(),
  /** Bioguide ids of current (not withdrawn) cosponsors, in the source's order. */
  cosponsors: z.array(z.string().regex(/^[A-Z]\d{6}$/)),
  /** Policy area exactly as the source names it, or null. Mapping to a catalog id happens in the transform. */
  policy_area: z.string().nullable(),
  /** The CRS summary the source shows for the enacted version (else the latest), HTML as given, capped. Session 3 reads it. */
  summary_html: z.string().nullable(),
  summary_stage: z.string().nullable(),
  /** Dates of every `BecameLaw` action (usually one). The signing date is the earliest. */
  became_law: z.array(isoDate),
  latest_action_date: isoDate.nullable(),
  /** The source's own `updateDate` (date part), used by the incremental API fetch. */
  updated: isoDate.nullable(),
  actions: z.array(rawAction),
  /** Committees and subcommittees the bill was referred to, with their dated steps. */
  committees: z.array(rawCommittee),
});
export type RawLaw = z.infer<typeof rawLaw>;

export const RAW_SOURCES = ["govinfo-billstatus", "congress-gov"] as const;
export const rawSource = z.enum(RAW_SOURCES);
export type RawSource = z.infer<typeof rawSource>;

/** One Congress as a fetcher stores it: `pipeline/raw/<source>/<congress>.json`. */
export const rawCongressFile = z.object({
  source: rawSource,
  congress: int.min(LAWS_FIRST_CONGRESS),
  /** Date the file was last (re)built. */
  fetched: isoDate,
  /** Rows the source's own law list reports (`pagination.count`); null for bulk, which has no list. */
  list_count: int.nullable(),
  /** Highest law number seen. The law numbers must run 1..max with none missing (the list endpoint is known to repeat and omit rows). */
  max_number: int.min(1),
  /** Source typos the fetcher repaired, one line each (e.g. a law number citing the wrong Congress). */
  corrections: z.array(z.string()).optional(),
  laws: z.array(rawLaw).min(1),
});
export type RawCongressFile = z.infer<typeof rawCongressFile>;

/** `pipeline/raw/govinfo-billstatus/manifest.json`: which ZIPs the raw files were built from. */
export const billstatusManifest = z.object({
  base_url: z.string(),
  zips: z.array(
    z.object({
      congress: int,
      type: billType,
      bytes: int,
      last_modified: z.string(),
      public_law_bills: int,
    }),
  ),
});
export type BillstatusManifest = z.infer<typeof billstatusManifest>;

// ---- reference data: policy areas and topic groups ----

/** `pipeline/reference/law-policy-areas.json`. The CRS names as the source prints them, their catalog ids and topic groups. */
export const lawPolicyAreas = z.object({
  areas: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z][a-z0-9-]*$/),
        /** The CRS name exactly as the source prints it. */
        name: z.string(),
        /** Id of the topic group this area belongs to (the page shows groups, not areas). */
        group: z.string(),
        /** "current" = one of CRS's 32 policy areas; "retired" = a CRS label used for older laws only (Commemorations). */
        status: z.enum(["current", "retired"]),
      }),
    )
    .min(1),
  groups: z.array(z.object({ id: z.string().regex(/^[a-z][a-z0-9-]*$/), label: z.string() })).min(1),
  /** Subject terms the 1970s laws carry in the policy-area field. They count as "Not classified"; we never map them. */
  legacy_terms: z.array(z.string()),
});
export type LawPolicyAreas = z.infer<typeof lawPolicyAreas>;

export const NOT_CLASSIFIED_AREA = "not-classified";
export const NOT_CLASSIFIED_GROUP = "not-classified";

// ---- outputs ----

/** `laws.json`: one row per public law. */
export const lawRow = z.object({
  law_id: z.string(),
  congress: int,
  number: int,
  /** Signing date: the earliest `BecameLaw` action. */
  date: isoDate,
  title: z.string(),
  bill_type: billType,
  bill_number: z.string(),
  origin_chamber: chamber.nullable(),
  sponsor_bioguide_id: z.string().nullable(),
  /** Catalog id of the policy area; `not-classified` for legacy terms and laws with none. */
  area_id: z.string(),
  /** True when Congress passed it over a presidential veto. */
  veto_override: z.boolean(),
});
export type LawRow = z.infer<typeof lawRow>;

/** `laws_counts.json`: one row per `(congress, area_id)` with at least one law. Counts only; shares and groups are derived in `lib`. */
export const lawCountRow = z.object({ congress: int, area_id: z.string(), n: int.min(1) });
export type LawCountRow = z.infer<typeof lawCountRow>;

/** `laws_cosponsors.json`: law id -> cosponsor bioguide ids (kept apart so the list payload stays small). */
export const lawCosponsorsFile = z.record(z.string(), z.array(z.string()));

/**
 * `laws_committees.json`: for the Laws list to link to committee pages. `laws` maps a law id to `[committee_id, subcommittee_ids, steps]`
 * (steps lower-cased: "referred to", "reported by", ...). `committees` names every id used and says whether a committee or
 * subcommittee page exists (`page`: the committee is in the current-Congress data; older and renamed committees have none).
 */
export const lawCommitteeCatalogEntry = z.object({ name: z.string(), chamber: z.enum(["House", "Senate", "Joint"]).nullable(), parent: z.string().nullable(), page: z.boolean() });
export const lawCommitteesFile = z.object({
  committees: z.record(z.string(), lawCommitteeCatalogEntry),
  laws: z.record(z.string(), z.array(z.tuple([z.string(), z.array(z.string()), z.array(z.string())]))),
});
export type LawCommitteesFile = z.infer<typeof lawCommitteesFile>;

export const lawsMeta = z.object({
  first_congress: int,
  /** Latest Congress in the data. */
  last_congress: int,
  /** Congresses still in progress: their counts are partial. */
  partial_congresses: z.array(int),
  /** Latest signing date in the data. */
  data_through: isoDate,
  law_count: int,
  sources: z.array(z.object({ source: rawSource, first_congress: int, last_congress: int })),
  areas: z.array(z.object({ id: z.string(), name: z.string().nullable(), group: z.string(), status: z.enum(["current", "retired", "none"]) })),
  groups: z.array(z.object({ id: z.string(), label: z.string() })),
});
export type LawsMeta = z.infer<typeof lawsMeta>;
