import type { RawCommittee, RawCommitteeMember } from "../validate/schemas";
import type {
  Committee,
  CommitteeMembership,
  CommitteeRole,
} from "../../lib/entities";

/**
 * committees-current.yaml + committee-membership-current.yaml ->
 *   committees.json             one row per top-level committee
 *   committee_memberships.json  one row per (legislator, committee), member-keyed
 *
 * Current Congress only (there is no historical committee-membership file).
 * Subcommittees are intentionally dropped — their rosters are keyed
 * `<parent><digits>` in the membership file and skipped here; the raw snapshot
 * still carries them so a later subcommittee pass is additive.
 */

type CommitteeType = RawCommittee["type"];

/**
 * The marquee name a committee is known by — used on charts and as the URL
 * slug. Strips the "House/Senate Committee on (the)" boilerplate; for joint
 * committees the leading "Joint" is kept ("Joint Economic", not "Economic").
 */
export function shortCommitteeName(name: string, type: CommitteeType): string {
  const s = name.trim();

  if (type === "joint") {
    return s
      .replace(/\bCommittee of Congress on the\b/i, "")
      .replace(/\bCommittee on the\b/i, "")
      .replace(/\bCommittee on\b/i, "")
      .replace(/\s+Committee\b/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  return s
    .replace(/^United States\s+/i, "")
    .replace(/^(House|Senate)\s+/i, "")
    .replace(/\b(Permanent Select|Select|Special)\s+Committee on the\b/i, "")
    .replace(/\b(Permanent Select|Select|Special)\s+Committee on\b/i, "")
    .replace(/\bCommittee on the\b/i, "")
    .replace(/\bCommittee on\b/i, "")
    .replace(/\bCaucus on\b/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Source `title` -> normalised role. Chairmen/chairwomen/co-chairmen collapse to
 * `chair`; everything untitled or styled "Vice Chair" / "Ex Officio" is a plain
 * `member`. (Verified against the real title set: Chair, Chairman, Chairwoman,
 * Cochairman, Ranking Member, Vice Chair(man/woman), Ex Officio.)
 */
const ROLE_BY_TITLE: Readonly<Record<string, CommitteeRole>> = {
  chair: "chair",
  chairman: "chair",
  chairwoman: "chair",
  cochairman: "chair",
  cochair: "chair",
  "ranking member": "ranking_member",
};

function roleOf(title: string | undefined): CommitteeRole {
  if (!title) return "member";
  return ROLE_BY_TITLE[title.trim().toLowerCase()] ?? "member";
}

/** chair > ranking_member > member — used when one roster lists a member twice. */
const ROLE_RANK: Record<CommitteeRole, number> = {
  chair: 2,
  ranking_member: 1,
  member: 0,
};

export interface CommitteesResult {
  committees: Committee[];
  memberships: CommitteeMembership[];
  /** (bioguide, committee) pairs that appeared more than once in a roster. */
  duplicateSeats: string[];
  /** Committee ids from committees-current.yaml with no roster block. */
  committeesWithoutRoster: string[];
}

export function buildCommittees(
  rawCommittees: readonly RawCommittee[],
  membership: Readonly<Record<string, readonly RawCommitteeMember[]>>,
): CommitteesResult {
  const committees: Committee[] = rawCommittees
    .map((c) => ({
      committee_id: c.thomas_id,
      name: c.name.trim(),
      short_name: shortCommitteeName(c.name, c.type),
      chamber: c.type,
    }))
    .sort((a, b) => a.committee_id.localeCompare(b.committee_id));

  const committeeIds = new Set(committees.map((c) => c.committee_id));

  const seatByKey = new Map<string, CommitteeMembership>();
  const duplicateSeats: string[] = [];

  for (const [committeeId, roster] of Object.entries(membership)) {
    if (!committeeIds.has(committeeId)) continue; // subcommittee roster
    for (const m of roster) {
      const key = `${m.bioguide}|${committeeId}`;
      const seat: CommitteeMembership = {
        bioguide_id: m.bioguide,
        committee_id: committeeId,
        party: m.party,
        role: roleOf(m.title),
        rank: m.rank,
      };
      const prior = seatByKey.get(key);
      if (!prior) {
        seatByKey.set(key, seat);
        continue;
      }
      duplicateSeats.push(key);
      // Keep the more senior role / lower rank.
      const better =
        ROLE_RANK[seat.role] !== ROLE_RANK[prior.role]
          ? ROLE_RANK[seat.role] > ROLE_RANK[prior.role]
          : seat.rank < prior.rank;
      if (better) seatByKey.set(key, seat);
    }
  }

  const memberships = [...seatByKey.values()].sort(
    (a, b) =>
      a.bioguide_id.localeCompare(b.bioguide_id) ||
      a.committee_id.localeCompare(b.committee_id),
  );

  return {
    committees,
    memberships,
    duplicateSeats,
    committeesWithoutRoster: committees
      .map((c) => c.committee_id)
      .filter((id) => !membership[id]),
  };
}
