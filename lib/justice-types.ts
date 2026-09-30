/**
 * Client payload for a justice profile page (`/supreme-court/justices/<id>/<slug>`).
 * One flat, page-shaped object per justice, built at build time by
 * `lib/justice-derive.ts` (via the server-only `lib/justice-data.ts`). Client-safe:
 * types and tiny pure helpers only. Scores are Martin-Quinn — NEGATIVE = liberal,
 * not comparable with DW-NOMINATE.
 */
import type { CourtJustice, CourtParty } from "./court-types";

/** A justice who shared at least one term with the subject, clipped to those terms. */
export interface PeerTrace {
  id: number;
  name: string;
  short: string;
  party: CourtParty;
  /** First shared term; `s`/`lo`/`hi` hold one value per shared term. */
  t0: number;
  t1: number;
  s: number[];
  lo: number[];
  hi: number[];
  career: number;
  sharedTerms: number;
  /** True when this peer's shared span runs to the subject's last term. */
  endsAtEdge: boolean;
  /** One of the four nearest to the subject's career average, league-wide. */
  isNeighbor: boolean;
}

/** One dot in the swarm: every justice in the data set at career average. */
export interface SwarmPoint {
  id: number;
  name: string;
  short: string;
  party: CourtParty;
  career: number;
  /** Shared at least one term with the subject ("Served alongside"). */
  alongside: boolean;
  /** One of the four nearest career averages ("Nearest neighbors"). */
  neighbor: boolean;
}

export interface RosterRow {
  id: number;
  name: string;
  party: CourtParty;
  href: string;
  /** Shared term years, e.g. "1975–2009" (null never — every row shared or is a neighbor). */
  together: string | null;
  /** The justice's own service years, e.g. "1994–2022" or "2009–present". */
  tenure: string;
  career: number;
}

export interface JusticeProfile {
  justice: CourtJustice;
  /** "Stevens"; "J. Roberts" where two justices share a last name. Used in headings. */
  last: string;
  identity: {
    /** "Chief Justice" or "Associate Justice" — the highest role held. */
    role: string;
    appointedBy: { president: string; party: CourtParty };
    /** "Served 1975–2010 · 35 terms" (+ " in the data" when service began before the data). */
    served: string;
    /** "Confirmed 98–0" / "Confirmed by voice vote". */
    confirmed: string;
    /** "Elevated to Chief Justice by Ronald Reagan, 1986", or null. */
    elevated: string | null;
  };
  bio: { extract: string; url: string } | null;
  /** Public-domain portrait only; null = omit the slot. */
  photoSrc: string | null;
  chart: {
    /** Score domain shared by every justice page (includes interval bounds). */
    domain: [number, number];
    subtitle: string;
    peers: PeerTrace[];
    /** Court median per term over the subject's terms. */
    median: { term: number; median: number }[];
    /** Subject still sitting in the latest term. */
    sitting: boolean;
  };
  swarm: {
    points: SwarmPoint[];
    range: { min: number; max: number; minTerm: number; maxTerm: number };
  };
  roster: { alongside: RosterRow[]; neighbors: RosterRow[] };
}

export interface JusticeRef {
  id: number;
  name: string;
}
