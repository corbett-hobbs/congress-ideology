/**
 * Client-safe shapes for /supreme-court/decisions. Counts are dissent buckets `[d0..d4]`
 * (0 = unanimous ... 4 = 5-4, 4-4 ties included); shares are derived in `lib/decisions-derive.ts`, never stored.
 */
export type Bucket = [number, number, number, number, number];

/** The five bands, bottom to top in the stacked area. Fixed order; a band's colour follows the band, never its rank. */
export const BAND_SHORT = ["Unanimous", "8–1", "7–2", "6–3", "5–4"] as const;
export const BAND_LONG = ["No dissent (9–0)", "1 dissent (8–1)", "2 dissents (7–2)", "3 dissents (6–3)", "4 dissents (5–4)"] as const;
export const BAND_COLORS = ["var(--split-0)", "var(--split-1)", "var(--split-2)", "var(--split-3)", "var(--split-4)"] as const;
export const BAND_KEYS = [0, 1, 2, 3, 4] as const;

export interface DecisionsChief {
  id: string;
  /** Full name ("Earl Warren"): the term band shortens it with `lib/term-label`. */
  name: string;
  last: string;
  /** Appointing president (as Chief Justice) and that president's party. */
  president: string;
  party: "D" | "R";
  /** First and last term (inclusive). */
  start: number;
  end: number;
}

export interface DecisionsArea {
  id: string;
  label: string;
}

/** Per-term bucket arrays for a subset of cases, shaped like the payload's own `all` / `by` / `other`. */
export interface LandmarkCells {
  all: Bucket[];
  by: Bucket[][];
  other: Bucket[];
  caseCount: number;
  /** Cases in the subset with no issue area. */
  unclassified: number;
}

export interface DecisionsPayload {
  /** Every term from the first to the last, dense. */
  terms: number[];
  areas: DecisionsArea[];
  /** Every case, unclassified included: `all[termIndex]`. */
  all: Bucket[];
  /** `by[areaIndex][termIndex]`, areas in catalog order. */
  by: Bucket[][];
  /** The same arrays for the landmark cases only (Wikipedia's list of landmark decisions), for the "Landmark cases" filter. */
  landmark: LandmarkCells;
  /** Where the landmark flag comes from. */
  landmarkSource: { url: string; page: string; revisionDate: string; license: string; count: number };
  /** Where the case-name links come from (Wikipedia's volume and term lists): how many cases link to an article, and when the lists were read. */
  articleSource: { count: number; fetched: string };
  /** Where the one-sentence case summaries come from (the opening of each Wikipedia article): how many cases have one. */
  summarySource: { count: number; claude: number; fetched: string };
  /** Cases the list tags Liberal / Conservative, and those with no direction coded (no tag). */
  outcomeSource: { coded: number; none: number };
  /** Counts of the areas outside `topAreas`, summed ("Other areas"): `other[termIndex]`. */
  other: Bucket[];
  /** Indexes (into `areas`) of the six biggest issue areas by total cases: card 1 draws each as its own series. */
  topAreas: number[];
  chiefs: DecisionsChief[];
  /** "Version 2026 Release 01". */
  versionLabel: string;
  /** Changes whenever the case list does: the list is fetched as `/data/decisions/cases?v=<this>`, so a cached older copy is never reused. */
  casesVersion: string;
  citation: string;
  caseCount: number;
  unclearVotes: number;
  unclassified: number;
}

export type SplitMode = "share" | "count";
export type AreaSortKey = "n" | "u" | "f";
export interface AreaSort {
  key: AreaSortKey;
  /** False = largest first (every key's default); true = reversed. */
  reversed: boolean;
}

/** SCDB's coding of who prevailed: 1 conservative, 2 liberal. Unspecifiable and not-coded cases carry neither (0 in a case tuple). */
export type DecisionDirection = 1 | 2;

/** Area filter values: an index into `areas`, ALL_AREAS, or OTHER_AREAS (every area outside `topAreas`). */
export const ALL_AREAS = -1;
export const OTHER_AREAS = -2;

/**
 * One case in the list: `[term, date (ISO), name, cite, area index or -1, dissent band 0-4, majority, minority, landmark
 * article title or "", landmark topics ("Fourth Amendment rights \u00b7 Search and seizure") or "", Wikipedia article
 * title / "" when no list names the case / null when the lists say it has no article, one sentence from that article saying how
 * the Court ruled or "", 1 when that sentence was written by the model rather than taken from the article, outcome direction:
 * 1 conservative / 2 liberal / 0 none coded]`.
 * Arrays, not objects: 8,000+ of them travel to the browser.
 */
export type DecisionCase = [number, string, string, string, number, number, number, number, string, string, string | null, string, 0 | 1, DecisionDirection | 0];
