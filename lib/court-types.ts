/**
 * Client payload for the Supreme Court explorer (`/supreme-court`) and the hub
 * card. Built at build time by `lib/court-derive.ts` (via the server-only
 * `lib/justice-data.ts`); these types and the small pure helpers below are
 * safe to import from client components. Split the same way as
 * `congress-types.ts` / `congress-data.ts`.
 *
 * Scores are Martin-Quinn: one dimension, NEGATIVE = liberal, NOT comparable
 * with DW-NOMINATE. Field names here are short because the payload ships to
 * the browser; see `CourtJustice` for the mapping from the pipeline fields.
 */

export type CourtParty = "D" | "R";

export interface CourtJustice {
  /** SCDB numeric `justice_id`. */
  id: number;
  /** "First Last [Suffix]" for search and tooltips. */
  name: string;
  /** Chart label — last name, first initial added only where two justices share one. */
  short: string;
  /** Appointing president's short key (see `CourtPresident.key`). */
  pres: string;
  party: CourtParty;
  /** First and last scored term; `s`/`lo`/`hi` hold one value per term t0..t1. */
  t0: number;
  t1: number;
  /** `mq_score` per term. */
  s: number[];
  /** `mq_lo95` / `mq_hi95` per term (the 95% interval, may pass the fixed domain). */
  lo: number[];
  hi: number[];
  /** Unweighted mean of `s` — computed at build time, never in the client. */
  career: number;
}

export interface CourtTerm {
  term: number;
  /** Court median score. For the four split terms this is the post-replacement (`b`) record. */
  median: number;
  /** Most likely median justice, straight from the court record. */
  medianJusticeId: number;
  medianProb: number;
  /** Justices who left / joined mid-term, where the data says so. Empty otherwise. */
  left: number[];
  joined: number[];
}

export interface CourtPresident {
  /** Short label, unique per person ("F. Roosevelt", "G.H.W. Bush"). */
  key: string;
  full: string;
  party: CourtParty;
  justiceIds: number[];
}

export interface CourtPayload {
  firstTerm: number;
  lastTerm: number;
  /** Fixed score domain [min, max] shared by all three charts. */
  domain: [number, number];
  justices: CourtJustice[];
  /** One entry per term, index = term - firstTerm. */
  terms: CourtTerm[];
  /** Chronological, oldest first. Only presidents with a justice in the data. */
  presidents: CourtPresident[];
}

export interface CourtHubSummary {
  lastTerm: number;
  /** Full name of the most likely median justice in the latest term. */
  medianJusticeName: string;
  /** Court median per term (same a/b rule as the trajectory chart). */
  medianSeries: { term: number; median: number }[];
  domain: [number, number];
}

/** Term `t` runs October t to June t+1: label it "2023–2024". */
export const termLabel = (t: number) => `${t}–${t + 1}`;

export const partyLabel = (p: CourtParty) =>
  p === "D" ? "Democratic" : "Republican";

export const isSeated = (j: Pick<CourtJustice, "t0" | "t1">, term: number) =>
  j.t0 <= term && term <= j.t1;

export interface CourtFilter {
  appointed: "all" | CourtParty;
  /** A `CourtPresident.key`, or null for all presidents. */
  president: string | null;
}

/** Filters dim, never remove: true when the justice does not match. */
export function isDimmed(
  j: Pick<CourtJustice, "party" | "pres">,
  f: CourtFilter,
): boolean {
  return (
    (f.appointed !== "all" && j.party !== f.appointed) ||
    (f.president != null && j.pres !== f.president)
  );
}

export const scoreAt = (j: CourtJustice, term: number) => j.s[term - j.t0];

/** Signed score with a true minus sign, two decimals. */
export const fmtScore = (v: number) =>
  `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`;

export const presidentOf = (p: CourtPayload, key: string) =>
  p.presidents.find((x) => x.key === key);
