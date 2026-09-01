import type { PartyGroup, SenateMember } from "@/lib/senate-data";
import { STATE_NAMES, stateName } from "@/lib/states";

export const fmt3 = (v: number | null | undefined) =>
  v == null ? "—" : v.toFixed(3);
export const fmt2 = (v: number | null | undefined) =>
  v == null ? "—" : v.toFixed(2);

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export const congressStartYear = (congress: number) => 1789 + (congress - 1) * 2;

export function congressYears(congress: number): string {
  const start = congressStartYear(congress);
  return `${start}–${start + 2}`;
}

export const GROUP_LABEL: Record<PartyGroup, string> = {
  dem: "Democrats",
  rep: "Republicans",
  other: "Independent / other",
};

export const GROUP_FILL_CLASS: Record<PartyGroup, string> = {
  dem: "fill-dem",
  rep: "fill-rep",
  other: "fill-other",
};

export const GROUP_VAR: Record<PartyGroup, string> = {
  dem: "var(--dem)",
  rep: "var(--rep)",
  other: "var(--oth)",
};

/** "D" / "R" / "I" — the news-style single-letter party abbreviation. */
export function partyAbbr(party: string): string {
  return party.charAt(0).toUpperCase() || "?";
}

/** "Independent (caucuses with Democrats)", "Democrat", "Whig", … */
export function partyLabel(m: Pick<SenateMember, "party" | "caucus">): string {
  if (m.party === m.caucus || m.caucus === "Unknown") return m.party;
  if (m.caucus === "Democrat" || m.caucus === "Republican") {
    return `${m.party} (caucuses with ${m.caucus}s)`;
  }
  return `${m.party} (caucuses ${m.caucus})`;
}

export { STATE_NAMES, stateName };
