import type { Legislator as RawLegislator } from "../validate/schemas";

export type LeaderRole = "speaker" | "majority_leader" | "minority_leader";

export interface LeadershipRow {
  bioguide_id: string;
  chamber: "house" | "senate";
  role: LeaderRole;
}

/** congress-legislators titles for the three posts the explorer labels. */
const ROLE_BY_TITLE: Record<string, LeaderRole> = {
  "Speaker of the House": "speaker",
  "House Majority Leader": "majority_leader",
  "House Minority Leader": "minority_leader",
  "Senate Majority Leader": "majority_leader",
  "Senate Minority Leader": "minority_leader",
};

/**
 * Who holds the Speaker / Majority Leader / Minority Leader posts right now (a post with no `end`).
 * The explorer labels these on the latest Congress's compass; earlier Congresses carry no such data.
 */
export function buildLeadership(raw: readonly RawLegislator[]): LeadershipRow[] {
  const rows: LeadershipRow[] = [];
  for (const L of raw) {
    for (const r of L.leadership_roles ?? []) {
      const role = ROLE_BY_TITLE[r.title];
      if (!role || r.end !== undefined) continue;
      rows.push({ bioguide_id: L.id.bioguide, chamber: r.chamber, role });
    }
  }
  return rows.sort((a, b) => a.chamber.localeCompare(b.chamber) || a.role.localeCompare(b.role) || a.bioguide_id.localeCompare(b.bioguide_id));
}
