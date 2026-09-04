/**
 * Shared shapes for the committees feature — the client half of the
 * `committee-data.ts` / `committee-types.ts` split (same reason as
 * `congress-data` / `congress-types`: chart components and the lazily-shipped
 * payloads need the types without pulling in `server-only` file reads).
 *
 * A committee's blended position lives in `dim1` / `dim2` — the same fields a
 * member carries — so `lib/neighbors.ts` and the compass primitive work on
 * committees unchanged.
 */
import type { Chamber, ChamberView } from "./chamber";
import type { PartyGroup } from "./congress-types";

export type CommitteeChamber = Chamber | "joint";
export type CommitteeRole = "chair" | "ranking_member" | "member";
export type CommitteeSide = "majority" | "minority";

/** The committee-view analogue of the explorer's chamber filter. */
export type CommitteeChamberView = ChamberView;

/** One roster seat, joined to that member's latest-Congress ideology score. */
export interface CommitteeMemberRow {
  bioguideId: string;
  name: string;
  lastName: string;
  /** The member's own chamber — differs across a joint committee's roster. */
  chamber: Chamber;
  state: string;
  district: number | null;
  /** Registration ("Republican", "Independent"). */
  party: string;
  group: PartyGroup;
  role: CommitteeRole;
  side: CommitteeSide;
  /** Latest-Congress nokken_poole coords; `null` when the member is unscored. */
  dim1: number | null;
  dim2: number | null;
  hasPhoto: boolean;
  /** Every current committee member has a profile page; kept explicit for the
   *  shared navigate-on-click gate. */
  isCurrent: boolean;
}

/** A committee blended to one point, plus the counts a card/tooltip needs. */
export interface CommitteeSummary {
  committeeId: string;
  name: string;
  shortName: string;
  chamber: CommitteeChamber;
  /** Unweighted mean of the roster's plottable dims; `null` if none are. */
  dim1: number | null;
  dim2: number | null;
  /** `max(dim1) − min(dim1)` over the plottable roster; `null` if < 2. */
  spread: number | null;
  /** Party group holding the majority seats. */
  controlGroup: PartyGroup;
  /** Compass dot fill class, resolved once from `chamber` at the data-prep
   *  layer (see lib/committee-palette.ts) — the compass primitive just reads
   *  it, no member-vs-committee branching in the chart component. */
  compassColorClass: string;
  demCount: number;
  repCount: number;
  otherCount: number;
  memberCount: number;
  /** Sorted by `dim1` ascending, unscored members last. */
  roster: CommitteeMemberRow[];
}

export interface CommitteeProfile extends CommitteeSummary {
  chair: RosterLead | null;
  rankingMember: RosterLead | null;
  latestCongress: number;
}

export interface RosterLead {
  bioguideId: string;
  name: string;
  chamber: Chamber;
  group: PartyGroup;
  /** Registration abbreviation-friendly party string. */
  party: string;
}

export interface CommitteeSearchEntry {
  committeeId: string;
  name: string;
  shortName: string;
  chamber: CommitteeChamber;
  controlGroup: PartyGroup;
  memberCount: number;
}

/** Is a committee plottable on the compass (has a blended position)? */
export function committeeIsPlottable(c: CommitteeSummary): boolean {
  return c.dim1 != null && c.dim2 != null;
}
