/**
 * Client-safe shapes for the Congress Laws page. Counts are per policy area; shares and topic groups are derived in
 * `lib/laws-derive.ts`, never stored. (The page itself is Session 4; Session 1 ships the data and these shapes.)
 */
export interface LawsArea {
  id: string;
  /** CRS name; null for "Not classified". */
  name: string | null;
  group: string;
  status: "current" | "retired" | "none";
}

export interface LawsGroup {
  id: string;
  label: string;
}

/** The administration that signed the most laws in a Congress, and every administration that signed any. */
export interface SignedMost {
  /** The administration's `term_id` (inauguration date). */
  termId: string;
  president: string;
  party: "D" | "R";
  /** Laws that administration signed in the Congress. */
  n: number;
  /** All signers in the Congress, most laws first; more than one entry = the Congress splits. */
  split: { termId: string; president: string; party: "D" | "R"; n: number }[];
}

export interface LawsPayload {
  /** Congress numbers, ascending (93rd = index 0). */
  congresses: number[];
  /** True for a Congress still in progress (its counts are partial). */
  partial: boolean[];
  areas: LawsArea[];
  groups: LawsGroup[];
  /** `counts[congressIndex][areaIndex]` = laws; areas in `areas` order. */
  counts: number[][];
  /** `bands[congressIndex][areaIndex]` = laws per support band `[none recorded, under 60%, 60-75, 75-90, 90%+]`; adds up to `counts`. */
  bands: [number, number, number, number, number][][];
  /** Per Congress, same order as `congresses`. */
  signedMost: SignedMost[];
  dataThrough: string;
  lawCount: number;
}
