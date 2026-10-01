/**
 * The year slider's play button: advance one year per tick, stop at the latest
 * year (no loop), and restart from the first year when play is pressed there.
 */
export function startYear(current: number, first: number, last: number): number {
  return current >= last ? first : current;
}

/** The next year while playing, and whether playback is finished (the latest year was just reached). */
export function stepYear(current: number, last: number): { year: number; done: boolean } {
  const year = Math.min(last, current + 1);
  return { year, done: year >= last };
}
