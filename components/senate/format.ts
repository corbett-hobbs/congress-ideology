import type { PartyGroup, SenateMember } from "@/lib/senate-data";

export const fmt3 = (v: number | null | undefined) =>
  v == null ? "—" : v.toFixed(3);
export const fmt2 = (v: number | null | undefined) =>
  v == null ? "—" : v.toFixed(2);

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function congressYears(congress: number): string {
  const start = 1789 + (congress - 1) * 2;
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

/** "Independent (caucuses with Democrats)", "Democrat", "Whig", … */
export function partyLabel(m: Pick<SenateMember, "party" | "caucus">): string {
  if (m.party === m.caucus || m.caucus === "Unknown") return m.party;
  if (m.caucus === "Democrat" || m.caucus === "Republican") {
    return `${m.party} (caucuses with ${m.caucus}s)`;
  }
  return `${m.party} (caucuses ${m.caucus})`;
}

export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin",
  WY: "Wyoming",
};

export const stateName = (abbr: string) => STATE_NAMES[abbr] ?? abbr;
