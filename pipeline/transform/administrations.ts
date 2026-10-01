import type { Administration } from "../../lib/executive-orders-entities";

/**
 * Presidential tenures, hand-maintained (a handful of rows that change every
 * four years — no source to fetch). `term_id` is the inauguration date; a
 * president who serves non-consecutive stints (Trump) gets one row per stint,
 * and consecutive terms by the same president are one tenure (Clinton, Bush,
 * Obama).
 *
 * An EO belongs to the tenure in force on its signing date: `start <= date <
 * next start`. A Jan 20 signing therefore belongs to the incoming president
 * (inauguration is at noon; the Federal Register's own `president` field
 * agrees, and the transform fails if it ever disagrees with this table).
 *
 * Add the next row at the next inauguration and close the previous `end`.
 */
export const ADMINISTRATIONS: readonly Administration[] = [
  { term_id: "1993-01-20", president: "Bill Clinton", president_slug: "william-j-clinton", party: "Democratic", start: "1993-01-20", end: "2001-01-19" },
  { term_id: "2001-01-20", president: "George W. Bush", president_slug: "george-w-bush", party: "Republican", start: "2001-01-20", end: "2009-01-19" },
  { term_id: "2009-01-20", president: "Barack Obama", president_slug: "barack-obama", party: "Democratic", start: "2009-01-20", end: "2017-01-19" },
  { term_id: "2017-01-20", president: "Donald Trump", president_slug: "donald-trump", party: "Republican", start: "2017-01-20", end: "2021-01-19" },
  { term_id: "2021-01-20", president: "Joe Biden", president_slug: "joe-biden", party: "Democratic", start: "2021-01-20", end: "2025-01-19" },
  { term_id: "2025-01-20", president: "Donald Trump", president_slug: "donald-trump", party: "Republican", start: "2025-01-20", end: null },
];
