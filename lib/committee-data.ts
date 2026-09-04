import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mean } from "d3-array";
import type { Committee, CommitteeMembership } from "./entities";
import type { ChamberMember } from "./congress-types";
import { isPlottable } from "./congress-types";
import { getChamberCurrent, getCurrentMemberIndex } from "./congress-data";
import type {
  CommitteeChamber,
  CommitteeChamberView,
  CommitteeMemberRow,
  CommitteeProfile,
  CommitteeSearchEntry,
  CommitteeSummary,
  RosterLead,
} from "./committee-types";

/**
 * Build-time committee datasets: read the two normalized pipeline outputs
 * (`committees.json`, `committee_memberships.json`), join every roster seat to
 * its member's latest-Congress ideology score, and blend each committee to a
 * single (dim1, dim2) point. Current Congress only — see DATA_CONVENTIONS §2 and
 * the committees session notes. Mirrors `lib/congress-data.ts`.
 */

export type {
  CommitteeChamber,
  CommitteeChamberView,
  CommitteeMemberRow,
  CommitteeProfile,
  CommitteeSearchEntry,
  CommitteeSummary,
} from "./committee-types";

function readOutput<T>(name: string): T[] {
  const path = join(process.cwd(), "pipeline", "output", name);
  return JSON.parse(readFileSync(path, "utf8")) as T[];
}

const round = (v: number, places: number) => {
  const f = 10 ** places;
  return Math.round(v * f) / f;
};

function rosterLead(row: CommitteeMemberRow | undefined): RosterLead | null {
  if (!row) return null;
  return {
    bioguideId: row.bioguideId,
    name: row.name,
    chamber: row.chamber,
    group: row.group,
    party: row.party,
  };
}

/** The party group that holds a committee's majority seats. */
function controlGroup(roster: CommitteeMemberRow[]): CommitteeMemberRow["group"] {
  const majority = roster.filter((r) => r.side === "majority");
  const pool = majority.length > 0 ? majority : roster;
  const counts = new Map<CommitteeMemberRow["group"], number>();
  for (const r of pool) counts.set(r.group, (counts.get(r.group) ?? 0) + 1);
  let best: CommitteeMemberRow["group"] = "other";
  let bestN = -1;
  for (const [g, n] of counts) if (n > bestN) [best, bestN] = [g, n];
  return best;
}

interface CommitteeIndex {
  latestCongress: number;
  byId: Map<string, CommitteeProfile>;
  /** Insertion order sorted by shortName, for stable listings. */
  ordered: CommitteeProfile[];
}

let cache: CommitteeIndex | null = null;

function buildCommitteeIndex(): CommitteeIndex {
  if (cache) return cache;

  const committees = readOutput<Committee>("committees.json");
  const memberships = readOutput<CommitteeMembership>("committee_memberships.json");
  const memberIndex = getCurrentMemberIndex();
  const latestCongress = getChamberCurrent("house").latestCongress;

  // roster rows grouped by committee
  const rosterByCommittee = new Map<string, CommitteeMemberRow[]>();
  for (const seat of memberships) {
    const m: ChamberMember | undefined = memberIndex.get(seat.bioguide_id);
    if (!m) {
      // Roster names a member with no current-Congress seat — skip, but say so.
      console.warn(
        `committee-data: ${seat.committee_id} lists ${seat.bioguide_id}, who has no current-Congress term`,
      );
      continue;
    }
    const plottable = isPlottable(m);
    const row: CommitteeMemberRow = {
      bioguideId: m.bioguideId,
      name: m.name,
      lastName: m.lastName,
      chamber: m.chamber,
      state: m.state,
      district: m.district,
      party: m.party,
      group: m.group,
      role: seat.role,
      side: seat.party,
      dim1: plottable ? m.dim1 : null,
      dim2: plottable ? m.dim2 : null,
      hasPhoto: m.hasPhoto ?? false,
      isCurrent: m.isCurrent ?? false,
    };
    const arr = rosterByCommittee.get(seat.committee_id) ?? [];
    arr.push(row);
    rosterByCommittee.set(seat.committee_id, arr);
  }

  const profiles: CommitteeProfile[] = committees.map((c) => {
    const roster = (rosterByCommittee.get(c.committee_id) ?? []).sort((a, b) => {
      if (a.dim1 == null) return b.dim1 == null ? 0 : 1;
      if (b.dim1 == null) return -1;
      return a.dim1 - b.dim1;
    });
    const scored = roster.filter((r) => r.dim1 != null && r.dim2 != null);
    const xs = scored.map((r) => r.dim1 as number).sort((a, b) => a - b);

    const demCount = roster.filter((r) => r.group === "dem").length;
    const repCount = roster.filter((r) => r.group === "rep").length;

    return {
      committeeId: c.committee_id,
      name: c.name,
      shortName: c.short_name,
      chamber: c.chamber,
      dim1: scored.length ? round(mean(scored, (r) => r.dim1 as number) as number, 3) : null,
      dim2: scored.length ? round(mean(scored, (r) => r.dim2 as number) as number, 3) : null,
      spread: xs.length >= 2 ? round(xs[xs.length - 1] - xs[0], 2) : null,
      controlGroup: controlGroup(roster),
      demCount,
      repCount,
      otherCount: roster.length - demCount - repCount,
      memberCount: roster.length,
      roster,
      chair: rosterLead(roster.find((r) => r.role === "chair")),
      rankingMember: rosterLead(roster.find((r) => r.role === "ranking_member")),
      latestCongress,
    };
  });

  const ordered = [...profiles].sort((a, b) =>
    a.shortName.localeCompare(b.shortName),
  );
  cache = {
    latestCongress,
    byId: new Map(profiles.map((p) => [p.committeeId, p])),
    ordered,
  };
  return cache;
}

/** The Congress the committee data describes (matches the member data's latest). */
export function committeesLatestCongress(): number {
  return buildCommitteeIndex().latestCongress;
}

function inView(chamber: CommitteeChamber, view: CommitteeChamberView): boolean {
  if (view === "both") return true;
  return chamber === view; // joint committees only appear under "both"
}

/** Committees for the aggregate view, chamber-filtered, sorted by short name. */
export function getCommittees(view: CommitteeChamberView): CommitteeSummary[] {
  return buildCommitteeIndex().ordered.filter((c) => inView(c.chamber, view));
}

/** Every committee id + slug source — `generateStaticParams`, sitemap. */
export function getAllCommittees(): { committeeId: string; shortName: string }[] {
  return buildCommitteeIndex().ordered.map((c) => ({
    committeeId: c.committeeId,
    shortName: c.shortName,
  }));
}

export function getCommitteeProfile(committeeId: string): CommitteeProfile | null {
  return buildCommitteeIndex().byId.get(committeeId) ?? null;
}

/**
 * The committee-compass pool for a committee's own page: its chamber plus every
 * joint committee (mirrors a member's profile compass showing only their
 * chamber). A joint committee sees all joint committees.
 */
export function getCommitteeCompassPool(
  committee: Pick<CommitteeProfile, "chamber">,
): CommitteeSummary[] {
  const all = buildCommitteeIndex().ordered;
  if (committee.chamber === "joint") return all.filter((c) => c.chamber === "joint");
  return all.filter(
    (c) => c.chamber === committee.chamber || c.chamber === "joint",
  );
}

export function getCommitteeSearchIndex(): CommitteeSearchEntry[] {
  return buildCommitteeIndex().ordered.map((c) => ({
    committeeId: c.committeeId,
    name: c.name,
    shortName: c.shortName,
    chamber: c.chamber,
    controlGroup: c.controlGroup,
    memberCount: c.memberCount,
  }));
}
