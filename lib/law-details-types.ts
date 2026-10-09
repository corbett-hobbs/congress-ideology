import type { TimelineAction, PartyLetter } from "./law-details-derive";
import type { ChamberTally } from "./laws-types";

/** Client-safe shape of one law page, joined at build time by `lib/law-details-data.ts`. */

export interface LawPerson {
  name: string;
  /** "D-NY-12" style label. */
  label: string;
  party: PartyLetter;
  /** Profile path, only for a member of the current Congress. */
  path: string | null;
}

export interface LawCommitteeEntry {
  name: string;
  chamber: "House" | "Senate" | "Joint" | null;
  /** Committee page path where the committee is in the current-Congress data. */
  path: string | null;
  subcommittees: string[];
  /** What happened there, lower-case ("referred to", "reported by", ...). */
  steps: string[];
}

export interface LawPageData {
  lawId: string;
  congress: number;
  number: number;
  title: string;
  /** "Public Law 118-90". */
  publicLaw: string;
  /** Signing date, or the date a veto was overridden. */
  date: string;
  billLabel: string;
  originChamber: "House" | "Senate" | null;
  /** The administration in office on `date`. */
  president: { name: string; party: "D" | "R" };
  veto: boolean;
  area: string | null;
  major: boolean | null;
  summary: string[] | null;
  summaryCut: boolean;
  actions: TimelineAction[];
  sponsor: LawPerson | null;
  cosponsors: LawPerson[];
  /** Cosponsor ids with no member record (never expected; reported so the list is not silently short). */
  cosponsorsUnresolved: number;
  passage: { house: ChamberTally; senate: ChamberTally; override: [number | null, number | null, number | null, number | null] | null };
  committees: LawCommitteeEntry[];
  congressGovUrl: string | null;
  /** The Laws page's data-through date. */
  dataThrough: string;
}
