import type { ChamberMember, PartyGroup } from "./congress-types";

/**
 * Extended party palette for the main-page member charts (compass, per-state
 * beeswarm, "How each state votes"). Real historical parties get their own
 * muted colour instead of the single neutral "other" bucket.
 *
 * The colour comes from Voteview's own `party_code` for that member-Congress
 * (see lib/entities.ts / lib/congress-data.ts) — the same source as the dot's
 * position. Codes without a dedicated colour fall through to `dem` / `rep` (for
 * modern Democrat / Republican) or the neutral `oth`.
 *
 * NOT used on the trend chart (Dem/Rep means only) or member profile pages,
 * which only ever show the current Congress anyway — there every code is
 * 100 / 200 / independent, so this resolver returns exactly the old colours.
 *
 * Tokens live in app/globals.css (light + dark). The palette was validated
 * OKLab / CVD (protan・deutan) + WCAG-contrast the same way as --dem/--rep;
 * see the session report.
 */
export type PartyColorKey =
  | "dem"
  | "rep"
  | "federalist"
  | "demrep"
  | "whig"
  | "jackson"
  | "antijackson"
  | "adams"
  | "proadmin"
  | "antiadmin"
  | "oth";

/** Voteview party_code → colour key. Lineage-adjacent 1820s faction codes fold
 *  into the faction they became (Adams-Clay → adams, Jackson-* → jackson). */
const CODE_KEY: Readonly<Record<number, PartyColorKey>> = {
  100: "dem",
  200: "rep",
  1: "federalist",
  6000: "federalist", // Crawford Federalist
  13: "demrep",
  22: "adams",
  8000: "adams", // Adams-Clay Federalist
  8888: "adams", // Adams-Clay Republican
  29: "whig",
  555: "jackson",
  7000: "jackson", // Jackson Federalist
  1346: "jackson", // Jackson Republican
  1275: "antijackson",
  4000: "antiadmin",
  5000: "proadmin",
};

interface PartyMeta {
  /** Legend label (reads as a group). */
  label: string;
  /** Compact count-label abbreviation ("9F·7D-R"). */
  abbr: string;
  /** CSS custom property. */
  token: string;
}

export const PARTY_META: Readonly<Record<PartyColorKey, PartyMeta>> = {
  dem: { label: "Democrats", abbr: "D", token: "--dem" },
  rep: { label: "Republicans", abbr: "R", token: "--rep" },
  federalist: { label: "Federalists", abbr: "F", token: "--federalist" },
  demrep: {
    label: "Democratic-Republicans",
    abbr: "D-R",
    token: "--demrep",
  },
  whig: { label: "Whigs", abbr: "W", token: "--whig" },
  jackson: { label: "Jacksonians", abbr: "Jck", token: "--jackson" },
  antijackson: {
    label: "Anti-Jacksonians",
    abbr: "A-J",
    token: "--antijackson",
  },
  adams: { label: "Adams faction", abbr: "Ad", token: "--adams" },
  proadmin: {
    label: "Pro-Administration",
    abbr: "Pro",
    token: "--proadmin",
  },
  antiadmin: {
    label: "Anti-Administration",
    abbr: "Anti",
    token: "--antiadmin",
  },
  oth: { label: "Other", abbr: "Oth", token: "--oth" },
};

/** Legend / label order — Democrat, Republican, then roughly chronological, then
 *  the neutral fallback last. */
export const PARTY_COLOR_ORDER: readonly PartyColorKey[] = [
  "dem",
  "rep",
  "proadmin",
  "antiadmin",
  "federalist",
  "demrep",
  "adams",
  "antijackson",
  "jackson",
  "whig",
  "oth",
];

type ColorInput = Pick<ChamberMember, "partyCode" | "group">;

function groupFallback(group: PartyGroup): PartyColorKey {
  return group === "dem" ? "dem" : group === "rep" ? "rep" : "oth";
}

export function partyColorKey(m: ColorInput): PartyColorKey {
  if (m.partyCode != null) {
    return CODE_KEY[m.partyCode] ?? groupFallback(m.group);
  }
  return groupFallback(m.group);
}

/** SVG fill class (see .fill-* rules in app/globals.css). */
export function partyFillClass(m: ColorInput): string {
  return `fill-${partyColorKey(m)}`;
}

/** `var(--token)` for inline styles / legend swatches. */
export function partyCssVar(key: PartyColorKey): string {
  return `var(${PARTY_META[key].token})`;
}

/**
 * The colour keys present in a set of members, in legend order, with counts.
 * Empty parties are dropped — so the legend only shows what's in the Congress.
 */
export function presentParties(
  members: readonly ColorInput[],
): { key: PartyColorKey; count: number }[] {
  const counts = new Map<PartyColorKey, number>();
  for (const m of members) {
    const k = partyColorKey(m);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return PARTY_COLOR_ORDER.filter((k) => counts.has(k)).map((key) => ({
    key,
    count: counts.get(key) as number,
  }));
}
