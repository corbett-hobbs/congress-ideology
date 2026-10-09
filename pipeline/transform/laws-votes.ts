import type { ChamberVoteTuple, LawRow, RawAction, RawLaw } from "../../lib/laws-entities";
import type { RollcallTuple } from "../fetch/voteview-rollcalls-lib";

/**
 * Final-passage votes of a public law, from the action history the fetchers kept (pure; no file I/O). Rules and edge cases were
 * measured in docs/LAWS_PREFLIGHT.md section 4 and are written up in docs/LAWS_METHODOLOGY.md.
 *
 *  - A chamber's final passage is its newest `Passed/agreed to in <chamber>` or `Conference report agreed to in <chamber>` action
 *    from the Library of Congress feed: a plain passage, a concurrence in the other chamber's amendment, or a conference report.
 *  - It was a roll call if the source attached a roll-call reference or the text cites a roll number or a yea-nay count; voice vote
 *    and unanimous consent are read from the text; anything else says nothing about the method ("Measure passed House." in the 1970s).
 *    The preflight showed that a passage with no roll cited has no Voteview vote on the same bill and day in 99.3% of cases, so
 *    "no roll cited" is read as "no recorded vote".
 *  - The tally comes from the action text; Voteview is the cross-check and fills in when the text has a roll but no count.
 */
export type VoteKind = "roll" | "voice" | "consent" | "unstated";
export type Chamber = "House" | "Senate";

export interface ChamberVote {
  kind: VoteKind;
  date: string;
  roll: number | null;
  session: number | null;
  yea: number | null;
  nay: number | null;
  /** Where yea / nay came from: the action text, or Voteview when the text carries a roll number but no count. */
  tally: "text" | "voteview" | null;
  /** The action text, for the report. */
  text: string;
}

const PASSAGE = /^(?:Passed\/agreed to in (House|Senate)|Conference report agreed to in (House|Senate))\b/i;
/** A concurrence or recession recorded as "Resolving differences -- House actions: House agreed to Senate amendment, roll call #744 (242-138)". */
const RESOLVING = /^Resolving differences -- (House|Senate) actions:/i;
const ROLL_HINT = /roll call #|record vote|roll no|yea-nay|yeas and nays|recorded vote/i;

/** The text of an action without its feed prefix ("Passed/agreed to in House: ") and its Congressional Record references. */
export function voteBody(text: string): string {
  return text
    .replace(/^(?:Passed\/agreed to in (?:House|Senate)|Conference report agreed to in (?:House|Senate)|Resolving differences -- (?:House|Senate) actions|Passed (?:House|Senate) over veto):\s*/i, "")
    .replace(/\((?:consideration|text)[^)]*\)?\.?/gi, "")
    .trim();
}

/** `[yea, nay]` out of an action's wording, or null. */
export function textTally(body: string): [number, number] | null {
  const m =
    /(?:Yea-Nay Vote[.:]?|Yeas and Nays:?|Vote:|roll call #\d+ \(|\bthe affirmative:?|:)\s*\(?(\d+)\s*-\s*(\d+)/i.exec(body) ??
    /\((\d+)\s*-\s*(\d+)\)/.exec(body);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** The roll number written in the text ("roll call #660", "Record Vote Number: 372", "Roll no. 190"), or null. */
export function textRoll(body: string): number | null {
  const m = /(?:roll call #|record vote (?:number|no\.?):? ?|roll no\.? ?)(\d+)/i.exec(body);
  return m ? Number(m[1]) : null;
}

interface Candidate {
  chamber: Chamber;
  action: RawAction;
  index: number;
}

/**
 * Newest action per chamber that matches `pick`: the latest date; on the same date one that records a roll call beats one that
 * does not (the feed lists "Measure passed Senate" beside the concurrence vote on the same day); otherwise the first one listed.
 */
function newestPerChamber(actions: readonly RawAction[], pick: (a: RawAction) => Chamber | null): Map<Chamber, Candidate> {
  const best = new Map<Chamber, Candidate>();
  const rolled = (a: RawAction) => (a.votes?.length ?? 0) > 0 || ROLL_HINT.test(a.text) || textTally(voteBody(a.text)) !== null;
  actions.forEach((action, index) => {
    const chamber = pick(action);
    if (!chamber) return;
    const cur = best.get(chamber);
    if (!cur || action.date > cur.action.date || (action.date === cur.action.date && ((rolled(action) && !rolled(cur.action)) || (rolled(action) === rolled(cur.action) && action.src === 9 && cur.action.src !== 9 && !/^Resolving differences/i.test(action.text))))) best.set(chamber, { chamber, action, index });
  });
  return best;
}

/**
 * Concurrences and recessions the Library of Congress feed does not repeat (the 1987-88 files have only the House or Senate line:
 * "House Agreed to Senate Amendments by Unanimous Consent.", "Senate concurred in the House amendment ... by Voice Vote."). The wording is
 * the chamber's own, so the chamber is read from its first word and the feed code (2 = House floor actions).
 */
function feedConcurrence(a: RawAction): Chamber | null {
  if (a.src === 9 || (a.type !== "ResolvingDifferences" && a.type !== "Floor")) return null;
  const t = a.text.trim();
  if (/disagree|insist|\bmotion to (table|reconsider|recommit)|laid on the table|rule\b/i.test(t)) return null;
  const house = /^(House|On motion that the House|On motion to suspend the rules and (agree|concur)|On agreeing to the conference report)/i.test(t) && /\b(agree|agreed|concur|concurred|recede|receded)\b/i.test(t);
  const senate = /^Senate\b/i.test(t) && /^Senate (agreed|concurred|receded|Agreed|Concurred|Receded)\b/i.test(t);
  if (house && !/^Senate/i.test(t)) return "House";
  if (senate) return "Senate";
  return null;
}

export function finalPassage(actions: readonly RawAction[]): Map<Chamber, ChamberVote> {
  const picked = newestPerChamber(actions, (a) => {
    if (a.src === 9) {
      const m = PASSAGE.exec(a.text);
      if (m) return (m[1] ?? m[2])!.toLowerCase() === "house" ? "House" : "Senate";
      const r = RESOLVING.exec(a.text);
      if (r && /\b(agreed|concurred|receded)\b/i.test(voteBody(a.text)) && !/disagreed/i.test(voteBody(a.text))) return r[1]!.toLowerCase() === "house" ? "House" : "Senate";
      return null;
    }
    return feedConcurrence(a);
  });
  const out = new Map<Chamber, ChamberVote>();
  for (const [chamber, { action }] of picked) {
    const body = voteBody(action.text);
    // The roll-call reference sits on the action, or on its twin from the other feed: same day, same wording. (A vote on an
    // amendment the same day is not this passage, so a reference on a differently worded action does not count.)
    const ref = [action, ...actions.filter((a) => a !== action && a.date === action.date && voteBody(a.text) === body)].flatMap((a) => a.votes ?? []).find((v) => v.chamber === chamber) ?? null;
    const tally = textTally(body);
    // Wording that names a voice vote or consent decides the method, whatever else is attached to the action.
    const kind: VoteKind = /voice vote/i.test(body) ? "voice" : /unanimous consent|without objection/i.test(body) ? "consent" : ref || ROLL_HINT.test(body) || tally ? "roll" : "unstated";
    out.set(chamber, {
      kind,
      date: action.date,
      roll: ref?.roll ?? textRoll(body),
      session: ref?.session ?? null,
      yea: tally ? tally[0] : null,
      nay: tally ? tally[1] : null,
      tally: tally ? "text" : null,
      text: action.text,
    });
  }
  return out;
}

/** Votes that overrode a veto: "Passed House over veto … 284 - 135". Kept apart from passage; they do not set the support band. */
export function overrideVotes(actions: readonly RawAction[]): Map<Chamber, { yea: number | null; nay: number | null; roll: number | null }> {
  const picked = newestPerChamber(actions, (a) => {
    const m = /^Passed (House|Senate) over veto/i.exec(a.text);
    return a.type === "Veto" && a.src === 9 && m ? (m[1]!.toLowerCase() === "house" ? "House" : "Senate") : null;
  });
  const out = new Map<Chamber, { yea: number | null; nay: number | null; roll: number | null }>();
  for (const [chamber, { action }] of picked) {
    const body = voteBody(action.text);
    const t = textTally(body);
    out.set(chamber, { yea: t ? t[0] : null, nay: t ? t[1] : null, roll: action.votes?.[0]?.roll ?? textRoll(body) });
  }
  return out;
}

// ---- Voteview join ----

export interface RollcallIndex {
  byClerk: Map<string, RollcallTuple>;
  byDate: Map<string, RollcallTuple[]>;
  /** Highest `rollnumber`-continuous roll of the first session, per Congress and chamber (offset for the second session). */
  lastDate: { H: string; S: string };
}

const key = (congress: number, c: "H" | "S", ...rest: (string | number)[]) => [congress, c, ...rest].join("|");

export function indexRollcalls(rows: readonly RollcallTuple[], lastDate: { H: string; S: string }): RollcallIndex {
  const byClerk = new Map<string, RollcallTuple>();
  const byDate = new Map<string, RollcallTuple[]>();
  for (const r of rows) {
    if (r[4] !== null && r[5] !== null) byClerk.set(key(r[0], r[1], r[4], r[5]), r);
    const k = key(r[0], r[1], r[3]);
    byDate.set(k, [...(byDate.get(k) ?? []), r]);
  }
  return { byClerk, byDate, lastDate };
}

const day = (d: string, n: number) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);

/**
 * The Voteview roll call for a passage vote, or null. From the 101st on Voteview carries the clerk's session and roll number, so the
 * match is exact; before that it is by chamber, date (+/- 1 day, since the source dates by UTC) and bill number, narrowed by the tally.
 */
export function joinRollcall(congress: number, chamber: Chamber, v: ChamberVote, bill: string, idx: RollcallIndex): { row: RollcallTuple; how: "clerk" | "date+bill" | "date+tally" } | null {
  const c = chamber === "House" ? "H" : "S";
  if (v.session !== null && v.roll !== null) {
    const row = idx.byClerk.get(key(congress, c, v.session, v.roll));
    if (row && Math.abs(Date.parse(row[3]) - Date.parse(v.date)) <= 2 * 864e5) return { row, how: "clerk" };
  }
  const same = [0, -1, 1].flatMap((n) => idx.byDate.get(key(congress, c, day(v.date, n))) ?? []);
  const wanted = bill.toUpperCase();
  let cand = same.filter((r) => r[8].toUpperCase() === wanted);
  if (cand.length > 1 && v.yea !== null) cand = cand.filter((r) => r[6] === v.yea && r[7] === v.nay);
  if (cand.length === 1) return { row: cand[0]!, how: "date+bill" };
  if (cand.length === 0 && v.yea !== null) {
    const byTally = same.filter((r) => r[6] === v.yea && r[7] === v.nay);
    if (byTally.length === 1) return { row: byTally[0]!, how: "date+tally" };
  }
  return null;
}

// ---- support band ----

/** 0 = no recorded vote, 1 = under 60% yes, 2 = 60-75, 3 = 75-90, 4 = 90% or more. Display order is a UI constant. */
export type Band = 0 | 1 | 2 | 3 | 4;
export const BAND_LABELS = ["No recorded vote", "Under 60%", "60–75%", "75–90%", "90%+"] as const;

/** Yes share of the votes cast (yea ÷ (yea + nay)); null when nobody voted. */
export const yesShare = (yea: number, nay: number): number | null => (yea + nay === 0 ? null : yea / (yea + nay));

export function bandOf(share: number): Band {
  return share < 0.6 ? 1 : share < 0.75 ? 2 : share < 0.9 ? 3 : 4;
}

/** The law's band: its closest recorded final-passage vote in either chamber; none recorded in either chamber = 0. */
export function supportBand(votes: readonly ChamberVote[]): { band: Band; share: number | null } {
  const shares = votes.flatMap((v) => (v.kind === "roll" && v.yea !== null && v.nay !== null ? [yesShare(v.yea, v.nay)] : [])).filter((s): s is number => s !== null);
  if (shares.length === 0) return { band: 0, share: null };
  const narrowest = Math.min(...shares);
  return { band: bandOf(narrowest), share: narrowest };
}

export type LawVotes = { votes: Map<Chamber, ChamberVote>; override: Map<Chamber, { yea: number | null; nay: number | null; roll: number | null }> };

export const lawVotes = (law: Pick<RawLaw, "actions">): LawVotes => ({ votes: finalPassage(law.actions), override: overrideVotes(law.actions) });

// ---- resolving tallies: action text first, Voteview as the cross-check ----

/** Most votes a chamber can cast: 435 members + 5 delegates + the Resident Commissioner; 100 senators + the Vice President's tie-break. */
export const MAX_VOTES: Record<Chamber, number> = { House: 441, Senate: 101 };
/** Text and Voteview agree if they differ by at most this many votes in total and put the law in the same band. */
export const TOLERANCE = 2;

export type CheckResult = "exact" | "minor" | "unverified" | "exception" | "unchecked" | "not-a-roll";

export interface ResolvedVote {
  vote: ChamberVote;
  check: CheckResult;
  join: "clerk" | "date+bill" | "date+tally" | null;
  /** Voteview's tally when joined. */
  voteview: [number, number] | null;
}

export class VoteGateError extends Error {
  constructor(message: string) {
    super(`laws: ${message}`);
    this.name = "VoteGateError";
  }
}

export interface VoteException {
  law_id: string;
  chamber: Chamber;
  use: "text" | "voteview" | [number, number];
  reason: string;
}

/**
 * Settle one law's two chamber votes. A roll call's tally is the action text's; Voteview is the check. A disagreement the exact (clerk-number)
 * join finds, or a tally larger than the chamber can cast, stops the build until a person records which tally is right in
 * `pipeline/reference/law-vote-exceptions.json`. A disagreement found only through a date-and-bill join is reported, not fatal, because
 * on a day with several votes on one bill the join can land on the wrong one. A roll call with no tally in the text takes Voteview's.
 */
export function resolveVotes(law: { law_id: string; congress: number; bill: string }, votes: ReadonlyMap<Chamber, ChamberVote>, idx: RollcallIndex, exceptions: readonly VoteException[]): Map<Chamber, ResolvedVote> {
  const out = new Map<Chamber, ResolvedVote>();
  for (const [chamber, v0] of votes) {
    const v: ChamberVote = { ...v0 };
    if (v.kind !== "roll") {
      out.set(chamber, { vote: v, check: "not-a-roll", join: null, voteview: null });
      continue;
    }
    const covered = v.date <= idx.lastDate[chamber === "House" ? "H" : "S"];
    const j = covered ? joinRollcall(law.congress, chamber, v, law.bill, idx) : null;
    const vv: [number, number] | null = j ? [j.row[6], j.row[7]] : null;
    const exc = exceptions.find((e) => e.law_id === law.law_id && e.chamber === chamber);
    const fail = (why: string) => new VoteGateError(`${law.law_id} ${chamber} ${v.date}: ${why}. Check the official roll call and record the right tally in pipeline/reference/law-vote-exceptions.json`);
    let check: CheckResult;
    if (v.yea === null || v.nay === null) {
      if (!vv) throw new VoteGateError(`${law.law_id} ${chamber} ${v.date} is a roll call (roll ${v.roll ?? "?"}) with no tally in the action text and no Voteview match: "${v.text.slice(0, 120)}"`);
      v.yea = vv[0];
      v.nay = vv[1];
      v.tally = "voteview";
      check = "unchecked";
    } else if (exc) {
      if (exc.use === "voteview") {
        if (!vv) throw new VoteGateError(`${law.law_id} ${chamber}: exception says use Voteview, but there is no Voteview match`);
        [v.yea, v.nay] = vv;
        v.tally = "voteview";
      } else if (Array.isArray(exc.use)) {
        [v.yea, v.nay] = exc.use;
      }
      check = "exception";
    } else if (!vv) {
      check = "unchecked";
    } else {
      const d = Math.abs(vv[0] - v.yea) + Math.abs(vv[1] - v.nay);
      const sameBand = bandOf(v.yea / (v.yea + v.nay || 1)) === bandOf(vv[0] / (vv[0] + vv[1] || 1));
      if (d === 0) check = "exact";
      else if (d <= TOLERANCE && sameBand) check = "minor";
      else if (j!.how === "clerk") throw fail(`the action text says ${v.yea}-${v.nay}, Voteview (matched by clerk roll number) says ${vv[0]}-${vv[1]}`);
      else check = "unverified";
    }
    if (v.yea! + v.nay! > MAX_VOTES[chamber] && check !== "exception") throw fail(`${v.yea}-${v.nay} is more votes than the ${chamber} can cast (${MAX_VOTES[chamber]})`);
    out.set(chamber, { vote: v, check, join: j?.how ?? null, voteview: vv });
  }
  return out;
}

const KIND_CODE: Record<VoteKind, 0 | 1 | 2 | 3> = { roll: 0, voice: 1, consent: 2, unstated: 3 };

/** `[kind code, yea, nay, roll]` for `laws.json`; a chamber with no found passage action reads as "method not stated". */
export function voteTuple(r: ResolvedVote | undefined): ChamberVoteTuple {
  if (!r) return [3, null, null, null];
  const v = r.vote;
  return v.kind === "roll" ? [0, v.yea, v.nay, v.roll] : [KIND_CODE[v.kind], null, null, null];
}

export interface Passage {
  house: ChamberVoteTuple;
  senate: ChamberVoteTuple;
  band: Band;
  override_votes: LawRow["override_votes"];
  resolved: Map<Chamber, ResolvedVote>;
}

/** Everything `laws.json` records about a law's passage votes. */
export function buildPassage(law: RawLaw, idx: RollcallIndex, exceptions: readonly VoteException[]): Passage {
  const { votes, override } = lawVotes(law);
  const resolved = resolveVotes({ law_id: law.law_id, congress: law.congress, bill: (law.bill_type + law.bill_number).toUpperCase() }, votes, idx, exceptions);
  const { band } = supportBand([...resolved.values()].map((r) => r.vote));
  const h = override.get("House");
  const s = override.get("Senate");
  return {
    house: voteTuple(resolved.get("House")),
    senate: voteTuple(resolved.get("Senate")),
    band,
    override_votes: h || s ? [h?.yea ?? null, h?.nay ?? null, s?.yea ?? null, s?.nay ?? null] : null,
    resolved,
  };
}
