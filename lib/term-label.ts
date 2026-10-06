/**
 * The one label rule for every presidential-term band (slider band, chart bands, run/span cards): the last name, else a
 * four-letter form ("Obam."), else the initials ("BO"), else the last initial. A label that doesn't fit is shortened,
 * never dropped (unless even one letter won't fit). `preferred` goes first (the Bushes' "Bush 41" where room allows).
 */
export const TERM_CHAR_W = 6.4;

export const initialsOf = (president: string): string => president.split(" ").map((w) => w[0]).join("");

export function termLabelCandidates(last: string, initials: string, preferred: readonly string[] = []): string[] {
  return [...preferred, last, `${last.slice(0, 4)}.`, initials, initials.slice(-1)];
}

/** Pixel width a label needs (padding included). */
export const termLabelWidth = (s: string, charW = TERM_CHAR_W): number => s.length * charW + (s.length > 1 ? 8 : 4);

export function fitTermLabel(width: number, last: string, initials: string, preferred: readonly string[] = [], charW = TERM_CHAR_W): string | null {
  return termLabelCandidates(last, initials, preferred).find((s) => termLabelWidth(s, charW) <= width) ?? null;
}
