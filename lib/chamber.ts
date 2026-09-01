/**
 * Chamber constants and chamber-aware terminology.
 *
 * The UI was written Senate-only. Every user-visible "senator" flips with the
 * active chamber: "representative" for singular/specific references, and
 * "member of Congress" only where a chamber-neutral collective reads better
 * (a shared page title, a search box that spans both chambers).
 */

export type Chamber = "house" | "senate";

/** Senate first — the default, and the order the switcher shows. */
export const CHAMBERS: readonly Chamber[] = ["senate", "house"];

export function isChamber(v: unknown): v is Chamber {
  return v === "house" || v === "senate";
}

/** "Senate" / "House". */
export function chamberLabel(c: Chamber): string {
  return c === "house" ? "House" : "Senate";
}

/** "U.S. Senate" / "U.S. House of Representatives". */
export function chamberFullName(c: Chamber): string {
  return c === "house" ? "U.S. House of Representatives" : "U.S. Senate";
}

interface NounOptions {
  plural?: boolean;
  /** Capitalize the first letter. */
  cap?: boolean;
}

/** "senator" / "representative", with plural and capitalization options. */
export function memberNoun(c: Chamber, opts: NounOptions = {}): string {
  const base = c === "house" ? "representative" : "senator";
  const word = opts.plural ? `${base}s` : base;
  return opts.cap ? word[0].toUpperCase() + word.slice(1) : word;
}

/** Chamber-neutral collective term. */
export const MEMBER_COLLECTIVE = "member of Congress";
export const MEMBER_COLLECTIVE_PLURAL = "members of Congress";

/** "Sen." / "Rep." — the abbreviation used before a name. */
export function memberTitleAbbr(c: Chamber): string {
  return c === "house" ? "Rep." : "Sen.";
}
