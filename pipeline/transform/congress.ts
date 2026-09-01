/**
 * Congress <-> calendar-date mapping.
 *
 * congress-legislators term records are date ranges (`start`, `end`), not
 * Congress numbers. To emit one row per (legislator x Congress) we expand each
 * term over the Congresses its dates cover.
 *
 * Rule: a Congress convenes on March 4 of its first year through the 73rd
 * (1933); the 20th Amendment moved that to January 3 starting with the 74th
 * (1935). First year of Congress `c` is `1789 + 2 * (c - 1)`.
 *
 * Pure, no I/O — unit-tested directly.
 */

const FIRST_JAN3_CONGRESS = 74;

function firstYear(congress: number): number {
  return 1789 + 2 * (congress - 1);
}

/** UTC instant a Congress convenes. */
export function congressStartDate(congress: number): Date {
  const y = firstYear(congress);
  return congress >= FIRST_JAN3_CONGRESS
    ? new Date(Date.UTC(y, 0, 3)) // January 3
    : new Date(Date.UTC(y, 2, 4)); // March 4
}

function parseIsoDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`not an ISO date: ${iso}`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

/** The Congress in session on `date`, or null if before the 1st Congress. */
export function congressOnDate(date: Date): number | null {
  const t = date.getTime();
  if (t < congressStartDate(1).getTime()) return null;

  const year = date.getUTCFullYear();
  let c =
    year >= firstYear(FIRST_JAN3_CONGRESS)
      ? FIRST_JAN3_CONGRESS + Math.floor((year - firstYear(FIRST_JAN3_CONGRESS)) / 2)
      : 1 + Math.floor((year - 1789) / 2);

  // Correct for the March-4 / January-3 boundary and odd/even-year rounding.
  while (congressStartDate(c + 1).getTime() <= t) c++;
  while (congressStartDate(c).getTime() > t) c--;
  return c;
}

/**
 * The Congresses a term covers. `end` is treated as exclusive: congress-
 * legislators sets a full term's `end` to the next term's `start` (a Congress
 * convening date), and that next Congress should not be counted. A term that
 * ends mid-Congress (death, resignation) still counts that Congress.
 *
 * `capCongress` clamps the result to data we actually have — a sitting
 * senator's term runs years past the current Congress.
 */
export function congressesForTerm(
  start: string,
  end: string,
  capCongress: number,
): number[] {
  const first = congressOnDate(parseIsoDate(start));
  const lastDay = new Date(parseIsoDate(end).getTime() - 86_400_000);
  const last = congressOnDate(lastDay);
  if (first == null || last == null) return [];

  const hi = Math.min(last, capCongress);
  const out: number[] = [];
  for (let c = first; c <= hi; c++) out.push(c);
  return out;
}
