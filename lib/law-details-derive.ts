import { LAW_ACTION_TYPES, type LawAction, type LawActionVote } from "./law-details-entities";
import type { ChamberTally } from "./laws-types";

/** Pure shaping for a law page (no file I/O): action labels, vote wording, the cosponsor party split. */

export type ActionKind = "floor" | "conference" | "president" | "law" | "veto" | "other";

const KIND_BY_TYPE: Record<(typeof LAW_ACTION_TYPES)[number], ActionKind> = {
  Floor: "floor",
  ResolvingDifferences: "conference",
  President: "president",
  BecameLaw: "law",
  Veto: "veto",
  NotUsed: "other",
};

export const ACTION_KIND_LABEL: Record<ActionKind, string> = {
  floor: "Floor",
  conference: "Resolving differences",
  president: "President",
  law: "Became law",
  veto: "Veto",
  other: "Other",
};

export interface TimelineAction {
  date: string;
  kind: ActionKind;
  text: string;
  /** "House roll call 442" style labels for the roll calls the action cites. */
  rolls: string[];
}

export const rollLabel = (v: LawActionVote): string => `${v[0] === 0 ? "House" : "Senate"} roll call ${v[1]}`;

/** The stored action tuples as the timeline shows them. A signing entry (type President) reads as "Became law" when it says so. */
export function timeline(actions: readonly LawAction[]): TimelineAction[] {
  return actions.map((a) => {
    const kind = KIND_BY_TYPE[LAW_ACTION_TYPES[a[1]]!];
    const text = a[2];
    return { date: a[0], kind: kind === "president" && /^(?:became public law|signed by president)/i.test(text) ? "law" : kind, text, rolls: (a[3] ?? []).map(rollLabel) };
  });
}

/** Vote method wording for one chamber's final passage. */
export function methodText(t: ChamberTally): string {
  if (t[0] === 0 && t[1] !== null && t[2] !== null) return "Recorded vote";
  if (t[0] === 1) return "Voice vote";
  if (t[0] === 2) return "Unanimous consent";
  return "Method not stated";
}

/** Share of votes cast that were yea, 0-1; null where the vote was not a counted roll call. */
export function yeaShare(yea: number | null, nay: number | null): number | null {
  if (yea === null || nay === null || yea + nay === 0) return null;
  return yea / (yea + nay);
}

export type PartyLetter = "D" | "R" | "I";

/** Counts of cosponsors per party, in D / R / I order, dropping a party with none. */
export function partySplit(parties: readonly PartyLetter[]): { party: PartyLetter; n: number }[] {
  return (["D", "R", "I"] as const).map((party) => ({ party, n: parties.filter((p) => p === party).length })).filter((x) => x.n > 0);
}

/** "Democrats" / "Republicans" / "Independents and others". */
export const PARTY_NAME: Record<PartyLetter, string> = { D: "Democrats", R: "Republicans", I: "Independents and others" };

/** "Sep 30, 2024" from an ISO date, the format the Laws list uses. */
export const longDate = (iso: string): string => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
