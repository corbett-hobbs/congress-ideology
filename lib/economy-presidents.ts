import type { Administration } from "./executive-orders-entities";
import { dayOfIso } from "./indicator-time";
import { fitTermLabel, initialsOf } from "./term-label";

/**
 * Presidential terms for the economy page: the administrations table the
 * executive-orders pipeline settled on (`administrations.json`, keyed by
 * `term_id`), plus Bush 41. That table starts at 1994 because the Federal
 * Register EO data does, so George H. W. Bush (in office until 1993-01-19,
 * inside this page's 1991 window) is prepended here with the same shape and
 * the same `term_id` convention (inauguration date). Not a second key.
 */
export const BUSH_41: Administration = {
  term_id: "1989-01-20",
  president: "George H. W. Bush",
  president_slug: "george-h-w-bush",
  party: "Republican",
  start: "1989-01-20",
  end: "1993-01-19",
};

/** The 45th..47th etc. are numbered by inauguration order; keyed by term_id. */
const ORDINALS: Record<string, number> = {
  "1989-01-20": 41,
  "1993-01-20": 42,
  "2001-01-20": 43,
  "2009-01-20": 44,
  "2017-01-20": 45,
  "2021-01-20": 46,
  "2025-01-20": 47,
};

export interface EconomyTerm {
  termId: string;
  /** "George H. W. Bush" */
  full: string;
  /** "Bush" */
  last: string;
  /** "Bush 41" for the two Bushes (the ordinal disambiguates them); the plain last name for everyone else. */
  label: string;
  /** "GB", for the band when even the four-letter form doesn't fit. */
  initials: string;
  party: "D" | "R";
  startYear: number;
  /** Year the term ends (the inauguration year of the successor), or null while in office. */
  endYear: number | null;
  /** Axis days, `e` exclusive, clipped to the axis. */
  s: number;
  e: number;
}

export function buildEconomyTerms(admins: readonly Administration[], span: number): EconomyTerm[] {
  const all = [BUSH_41, ...admins.filter((a) => a.term_id !== BUSH_41.term_id)].sort((a, b) => a.start.localeCompare(b.start));
  return all.map((a) => {
    const ord = ORDINALS[a.term_id];
    if (ord === undefined) throw new Error(`economy-presidents: no ordinal for term ${a.term_id}; add the new inauguration to ORDINALS`);
    const last = a.president.split(" ").pop() ?? a.president;
    const next = a.end === null ? null : new Date(Date.parse(`${a.end}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    return {
      termId: a.term_id,
      full: a.president,
      last,
      label: last === "Bush" ? `${last} ${ord}` : last,
      initials: initialsOf(a.president),
      party: a.party === "Democratic" ? "D" : "R",
      startYear: Number(a.start.slice(0, 4)),
      endYear: next ? Number(next.slice(0, 4)) : null,
      s: Math.max(0, dayOfIso(a.start)),
      e: next === null ? span : Math.min(span, dayOfIso(next)),
    };
  });
}

/** Band text that fits `width`: the preferred names first, then last name, four letters, initials, last initial. */
export function termBandText(t: EconomyTerm, width: number, charW: number, preferred: readonly string[] = []): string | null {
  return fitTermLabel(width, t.last, t.initials, preferred, charW);
}
