/**
 * Shared types and pure helpers for the chamber datasets.
 *
 * Split from `congress-data.ts` (which is `server-only`) so client components —
 * and the lazily-fetched history payload — can use the same shapes and the
 * plottable-filter logic.
 */
import type { Chamber, ChamberView } from "./chamber";

export type PartyGroup = "dem" | "rep" | "other";

export interface ChamberMember {
  bioguideId: string;
  chamber: Chamber;
  /** Display name, e.g. "Chuck Schumer" (nickname + last, no suffix). */
  name: string;
  lastName: string;
  state: string;
  /** House numbered district; `null` for at-large seats and all Senate seats. */
  district: number | null;
  /** Registration, e.g. "Independent". */
  party: string;
  /** Conference the member sits with; drives colour. Defaults to `party`. */
  caucus: string;
  group: PartyGroup;
  /** Per-Congress (nokken_poole) — what the charts plot. `null` if unscored. */
  dim1: number | null;
  dim2: number | null;
  /** Static career (nominate) score, for the readout. */
  careerDim1: number | null;
  careerDim2: number | null;
  nVotes: number | null;
  /**
   * Whether an official photo is committed for this member. Set only for
   * current-Congress members (see lib/member-photo.ts); `undefined` on
   * historical rows, which never render a photo.
   */
  hasPhoto?: boolean;
  /**
   * True for members of the current Congress — the ones with a profile page.
   * `undefined` on every historical row (same stamping as `hasPhoto`). Gate
   * navigate-on-click with `hasProfilePage()` in lib/member-url.ts.
   */
  isCurrent?: boolean;
}

export interface PartyMeanPoint {
  congress: number;
  year: number;
  dem: number | null;
  rep: number | null;
}

export interface MemberSearchEntry {
  bioguideId: string;
  chamber: Chamber;
  name: string;
  state: string;
  district: number | null;
  group: PartyGroup;
}

/** Small payload — shipped inline on the homepage, per chamber and blended. */
export interface ChamberCurrent {
  chamber: ChamberView;
  latestCongress: number;
  minCongress: number;
  /** Every current member (incl. unscored) — table + delegation. By last name. */
  all: ChamberMember[];
  /** Plottable current members, sorted by dim1 — compass / beeswarm / rank. */
  plottable: ChamberMember[];
  /** Full-history party means (small even for the House). */
  trend: PartyMeanPoint[];
}

/**
 * Big payload — one static `/data/{chamber}` asset per chamber, fetched on
 * demand. The blended "both" history is these two merged on the client.
 */
export interface ChamberHistory {
  chamber: ChamberView;
  congresses: number[];
  /** Every member-Congress. The plottable subset is derived client-side. */
  allByCongress: Record<number, ChamberMember[]>;
}

export interface MemberTrajectoryPoint {
  congress: number;
  year: number;
  /** Per-Congress nokken_poole_dim1. `null` where Voteview couldn't estimate. */
  dim1: number | null;
}

export interface MemberProfile {
  bioguideId: string;
  chamber: Chamber;
  name: string;
  fullName: string;
  firstName: string;
  lastName: string;
  state: string;
  stateName: string;
  district: number | null;
  party: string;
  caucus: string;
  group: PartyGroup;
  /** True when the person did not serve the whole latest Congress. */
  partialCurrentTerm: boolean;
  careerDim1: number | null;
  careerDim2: number | null;
  currentDim1: number | null;
  currentDim2: number | null;
  latestCongress: number;
  trajectory: MemberTrajectoryPoint[];
  firstCongress: number;
  chamberCongressCount: number;
  /** Whether an official photo is committed for this member. */
  hasPhoto: boolean;
}

// --- pure helpers ---------------------------------------------------------

/** The modern Republican party dates from the 33rd Congress (1854). Before
 *  that, congress-legislators labels Jeffersonian Democratic-Republicans
 *  "Republican" too — a different party. Keep them out of the R group. */
const MODERN_REPUBLICAN_FROM = 33;

export function partyGroup(caucus: string, congress: number): PartyGroup {
  if (caucus === "Democrat") return "dem";
  if (caucus === "Republican" && congress >= MODERN_REPUBLICAN_FROM) return "rep";
  return "other";
}

export function congressStartYear(congress: number): number {
  return 1789 + (congress - 1) * 2;
}

/** Votes below this in a Congress = did not really serve it. */
export const MIN_VOTES_FOR_SCORE = 10;

/**
 * A per-Congress score is plottable when it exists (not null, not the origin
 * sentinel) and rests on enough votes to mean something.
 */
export function isPlottable(m: ChamberMember): boolean {
  if (m.dim1 == null || m.dim2 == null) return false;
  return (m.nVotes ?? 0) >= MIN_VOTES_FOR_SCORE;
}

/** Plottable members of a Congress, sorted left-to-right by dim1. */
export function plottableSorted(members: ChamberMember[]): ChamberMember[] {
  return members
    .filter(isPlottable)
    .sort((a, b) => (a.dim1 as number) - (b.dim1 as number));
}
