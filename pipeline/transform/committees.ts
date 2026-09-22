import type { RawCommittee, RawCommitteeMember } from "../validate/schemas";
import type {
  Committee,
  CommitteeMembership,
  CommitteeRole,
  Subcommittee,
  SubcommitteeMembership,
} from "../../lib/entities";

/**
 * committees-current.yaml + committee-membership-current.yaml ->
 *   committees.json                one row per top-level committee
 *   committee_memberships.json     one row per (legislator, committee), member-keyed
 *   subcommittees.json             one row per subcommittee (buildSubcommittees)
 *   subcommittee_memberships.json  one row per (legislator, subcommittee), member-keyed
 *
 * Current Congress only (there is no historical committee-membership file).
 * Subcommittee rosters are keyed `<parent><digits>` in the membership file;
 * `buildCommittees` skips them (it only builds top-level rows) and
 * `buildSubcommittees` picks them up separately, joining each roster's key
 * back to the parent's `subcommittees[]` entry for the subcommittee's name.
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

export interface SubcommitteesResult {
  subcommittees: Subcommittee[];
  memberships: SubcommitteeMembership[];
  /** (bioguide, subcommittee) pairs that appeared more than once in a roster. */
  duplicateSeats: string[];
  /** Subcommittee ids from committees-current.yaml with no roster block. */
  subcommitteesWithoutRoster: string[];
  /**
   * Membership keys that are neither a top-level committee id nor a known
   * `<parent><digits>` subcommittee id — a data-shape drift upstream. Fatal
   * in the pipeline (see DATA_CONVENTIONS §4); `transform/index.ts` throws
   * when this is non-empty rather than silently dropping the roster.
   */
  unrecognizedRosterKeys: string[];
}

/**
 * The subcommittee-grain analogue of `buildCommittees`: flattens each
 * top-level committee's `subcommittees[]` into its own identity rows (id =
 * parent THOMAS id + subcommittee THOMAS id), then inverts the same
 * `membership` map `buildCommittees` reads — this time picking out exactly
 * the keys that aren't a top-level committee id — into member-keyed
 * subcommittee seats. Reuses `roleOf`/`ROLE_RANK` and the duplicate-seat
 * handling from `buildCommittees` so both grains normalise roles identically.
 */
export function buildSubcommittees(
  rawCommittees: readonly RawCommittee[],
  membership: Readonly<Record<string, readonly RawCommitteeMember[]>>,
): SubcommitteesResult {
  const committeeIds = new Set(rawCommittees.map((c) => c.thomas_id));

  const subcommittees: Subcommittee[] = rawCommittees
    .flatMap((c) =>
      (c.subcommittees ?? []).map((s) => ({
        subcommittee_id: `${c.thomas_id}${s.thomas_id}`,
        parent_committee_id: c.thomas_id,
        name: s.name.trim(),
        chamber: c.type,
      })),
    )
    .sort((a, b) => a.subcommittee_id.localeCompare(b.subcommittee_id));

  const subcommitteeIds = new Set(subcommittees.map((s) => s.subcommittee_id));

  const seatByKey = new Map<string, SubcommitteeMembership>();
  const duplicateSeats: string[] = [];
  const unrecognizedRosterKeys: string[] = [];

  for (const [key, roster] of Object.entries(membership)) {
    if (committeeIds.has(key)) continue; // top-level roster, handled by buildCommittees
    if (!subcommitteeIds.has(key)) {
      unrecognizedRosterKeys.push(key);
      continue;
    }
    for (const m of roster) {
      const seatKey = `${m.bioguide}|${key}`;
      const seat: SubcommitteeMembership = {
        bioguide_id: m.bioguide,
        subcommittee_id: key,
        party: m.party,
        role: roleOf(m.title),
        rank: m.rank,
      };
      const prior = seatByKey.get(seatKey);
      if (!prior) {
        seatByKey.set(seatKey, seat);
        continue;
      }
      duplicateSeats.push(seatKey);
      // Keep the more senior role / lower rank.
      const better =
        ROLE_RANK[seat.role] !== ROLE_RANK[prior.role]
          ? ROLE_RANK[seat.role] > ROLE_RANK[prior.role]
          : seat.rank < prior.rank;
      if (better) seatByKey.set(seatKey, seat);
    }
  }

  const memberships = [...seatByKey.values()].sort(
    (a, b) =>
      a.bioguide_id.localeCompare(b.bioguide_id) ||
      a.subcommittee_id.localeCompare(b.subcommittee_id),
  );

  return {
    subcommittees,
    memberships,
    duplicateSeats,
    subcommitteesWithoutRoster: subcommittees
      .map((s) => s.subcommittee_id)
      .filter((id) => !membership[id]),
    unrecognizedRosterKeys,
  };
}
