/**
 * Constants the demographics page's derivations rest on. Each is verified against the committed data by
 * `lib/demographics-derive.test.ts`; see `docs/DEMOGRAPHICS_METHODOLOGY.md` and `docs/DEMOGRAPHICS_PREFLIGHT.md`.
 */

export const FIRST_DEMO_CONGRESS = 73;

/**
 * The day each Congress convened, 73rd (1933) on. `congress-legislators` dates a House or Senate term from the day the
 * member was sworn in, which is the day the Congress convened (not always Jan 3: the 92nd convened Jan 21, 1971). Each
 * date is the most common House term start in January-March of the Congress's first year; the test re-derives that
 * from the raw terms. The 73rd's terms start at the March 9 special session.
 */
export const CONVENING: Readonly<Record<number, string>> = {
  73: "1933-03-09", 74: "1935-01-03", 75: "1937-01-05", 76: "1939-01-03", 77: "1941-01-03", 78: "1943-01-06",
  79: "1945-01-03", 80: "1947-01-03", 81: "1949-01-03", 82: "1951-01-03", 83: "1953-01-03", 84: "1955-01-05",
  85: "1957-01-03", 86: "1959-01-07", 87: "1961-01-03", 88: "1963-01-09", 89: "1965-01-04", 90: "1967-01-10",
  91: "1969-01-03", 92: "1971-01-21", 93: "1973-01-03", 94: "1975-01-14", 95: "1977-01-04", 96: "1979-01-15",
  97: "1981-01-05", 98: "1983-01-03", 99: "1985-01-03", 100: "1987-01-06", 101: "1989-01-03", 102: "1991-01-03",
  103: "1993-01-05", 104: "1995-01-04", 105: "1997-01-07", 106: "1999-01-06", 107: "2001-01-03", 108: "2003-01-07",
  109: "2005-01-04", 110: "2007-01-04", 111: "2009-01-06", 112: "2011-01-05", 113: "2013-01-03", 114: "2015-01-06",
  115: "2017-01-03", 116: "2019-01-03", 117: "2021-01-03", 118: "2023-01-03", 119: "2025-01-03",
};

/** Non-voting delegates and resident commissioners: the site counts voting members only. */
export const NON_VOTING_STATES: ReadonlySet<string> = new Set(["DC", "PR", "VI", "GU", "AS", "MP", "PI", "DK", "OL"]);

/** Alaska and Hawaii sent delegates until statehood (Alaska Jan 1959; Hawaii Aug 1959, so its 86th-Congress delegate Burns is excluded by id). */
export const LAST_TERRITORY_CONGRESS: Readonly<Record<string, number>> = { AK: 85, HI: 85 };
export const NON_VOTING_MEMBER_CONGRESS: ReadonlySet<string> = new Set(["B001127@86"]);

/**
 * Caucus group overrides for one member-Congress. Jo Ann Emerson (E000172) is recorded as an Independent for the whole
 * 105th Congress; she was a Republican apart from that single year, so she is counted as one.
 */
export const CAUCUS_OVERRIDE: Readonly<Record<string, "D" | "R">> = { "E000172@105": "R" };

/** Tenure band cut-offs: First Congress (1), 2-5, 6-10, 11 or more. */
export function tenureBand(served: number): 0 | 1 | 2 | 3 {
  return served <= 1 ? 0 : served <= 5 ? 1 : served <= 10 ? 2 : 3;
}
