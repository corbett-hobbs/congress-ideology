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

/** One tenure on the slider's term band, in calendar years clamped to the page's span. */
export interface LawsPresident {
  id: string;
  president: string;
  last: string;
  party: "D" | "R";
  from: number;
  to: number;
}

/** A support band as `[none recorded, under 60%, 60-75, 75-90, 90%+]`. */
export type BandCounts = [number, number, number, number, number];

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
  bands: BandCounts[][];
  /** `majorBands[congressIndex][areaIndex]` = the major laws among `bands`; adds up to `major`. */
  majorBands: BandCounts[][];
  /** `major[congressIndex][areaIndex]` = laws Mayhew lists as important; 0 for Congresses after `majorThrough`. */
  major: number[][];
  /** Last Congress with a Mayhew list; later Congresses read "not yet assessed", never zero. */
  majorThrough: number;
  /** Per Congress, same order as `congresses`. */
  signedMost: SignedMost[];
  /** Which party held each chamber for most of each Congress (day-weighted), same order as `congresses`. */
  control: { house: ("D" | "R")[]; senate: ("D" | "R")[] };
  /** Presidents in office from the first Congress's opening year to the last, for the year slider's term band. */
  presidents: LawsPresident[];
  dataThrough: string;
  lawCount: number;
  /** Short hash of the list payload, for its fetch URL (set by `lib/laws-data.ts`). */
  listVersion: string;
}

/** One chamber's final passage: `[kind 0 roll call / 1 voice vote / 2 unanimous consent / 3 method not stated, yea, nay]`. */
export type ChamberTally = [0 | 1 | 2 | 3, number | null, number | null];

/**
 * One law in the list, as a compact tuple (the payload is ~12,600 rows): `[0 Congress, 1 law number, 2 signing date,
 * 3 title, 4 index into `LawsPayload.areas`, 5 support band 0-4, 6 House passage, 7 Senate passage, 8 index into the list's
 * `sponsors` (-1 none), 9 major (1 Mayhew-listed, 0 not, 2 not yet assessed), 10 veto override, 11 CRS first sentence ("" none),
 * 12 bill ("H.R. 1"), 13 index into `signers`, 14 override votes `[House yea, nay, Senate yea, nay]` or null]`.
 */
export type LawListRow = [number, number, string, string, number, 0 | 1 | 2 | 3 | 4, ChamberTally, ChamberTally, number, 0 | 1 | 2, 0 | 1, string, string, number, [number | null, number | null, number | null, number | null] | null];

/** A bill's sponsor as the list shows them: `[name with title, "D-CA-12", party letter, profile path or null]`. */
export type LawSponsor = [string, string, "D" | "R" | "I", string | null];

/** The president who signed a law. */
export type LawSigner = [name: string, party: "D" | "R"];

export interface LawsList {
  rows: LawListRow[];
  sponsors: LawSponsor[];
  signers: LawSigner[];
}
