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

export interface DecisionsPayload {
  /** Every term from the first to the last, dense. */
  terms: number[];
  areas: DecisionsArea[];
  /** Every case, unclassified included: `all[termIndex]`. */
  all: Bucket[];
  /** `by[areaIndex][termIndex]`, areas in catalog order. */
  by: Bucket[][];
  chiefs: DecisionsChief[];
  /** "Version 2026 Release 01". */
  versionLabel: string;
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
