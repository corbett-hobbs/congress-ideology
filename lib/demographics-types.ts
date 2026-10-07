import type { ChamberView } from "./chamber";

/** Client-safe shapes for /congress/demographics. Built at build time by `lib/demographics-derive.ts`. */

export type CaucusGroup = "D" | "R" | "O";

/** Age in whole years on the Congress's convening day, for members with a full birthdate. */
export interface AgeStat {
  /** One decimal; null when nobody in the group has a birthdate. */
  median: number | null;
  average: number | null;
  /** Members the figures cover. */
  n: number;
}

/** One Congress, one chamber view. */
export interface DemoCongress {
  congress: number;
  /** Convening day, ISO; the date ages are counted on. */
  date: string;
  /** Calendar year the Congress convened. */
  year: number;
  /** `term_id` of the president in office on the convening day. */
  termId: string;
  /** Voting members who held a seat at any time in the Congress (each person once). */
  seats: number;
  age: { D: AgeStat; R: AgeStat };
  /** Members left out of the age figures for want of a birthdate. */
  ageMissing: number;
  /** Women by caucus. */
  women: Record<CaucusGroup, number>;
  /** Members by Congresses served, counting this one: 1 / 2-5 / 6-10 / 11 or more. */
  tenure: [number, number, number, number];
}

export interface DemoPresident {
  id: string;
  president: string;
  last: string;
  party: "D" | "R";
}

export interface DemographicsPayload {
  firstCongress: number;
  lastCongress: number;
  presidents: DemoPresident[];
  views: Record<ChamberView, DemoCongress[]>;
}

export const TENURE_LABELS = ["First Congress", "2–5", "6–10", "11 or more"] as const;
