/**
 * Client-safe shapes for the legislation card on a committee page. The shard rows (`CommitteeBillRow`) are served as they are
 * stored; the sponsor table gains what the browser needs to show and link a sponsor. Stages and filters are derived in
 * `lib/committee-bills-derive.ts`, never stored.
 */
import type { CommitteeBillRow } from "./committee-bills-entities";

/** A sponsor as the list shows them: `[name "Andy Biggs", party-place "R-AZ-5", party letter, profile path (current members only) or null]`. */
export type BillSponsorCell = [string, string, string, string | null];

export interface CommitteeBillsPayload {
  committeeId: string;
  congress: number;
  chamber: "house" | "senate" | "joint";
  /** Latest dated event in the data, for "data through" and for how long a bill has waited. */
  dataThrough: string;
  areas: string[];
  subs: { id: string; name: string }[];
  sponsors: BillSponsorCell[];
  /** Newest referral first. */
  rows: CommitteeBillRow[];
}

/** What the page knows before the rows arrive: enough for the card's heading and its loading state. */
export interface CommitteeBillsSummary {
  committeeId: string;
  congress: number;
  total: number;
  dataThrough: string;
  /** Short hash for the fetch URL (`?v=`), so a refresh is never served from an old cache. */
  version: string;
}

/** The six steps a bill can have reached in a committee, 1 (referred) to 6 (became law). */
export type Stage = 1 | 2 | 3 | 4 | 5 | 6;
