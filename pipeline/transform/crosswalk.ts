/**
 * icpsr -> bioguide_id crosswalk.
 *
 * Voteview keys members by `icpsr`; this project keys everything by
 * `bioguide_id` (docs/DATA_CONVENTIONS.md §1). The mapping of record is built
 * from the `id` blocks in @unitedstates/congress-legislators, which carry both.
 *
 * Pure — no I/O — so it is unit-tested directly.
 */

import type { Legislator, VoteviewMemberRow } from "../validate/schemas";
import type { IdCrosswalkEntry } from "../../lib/entities";

export type Icpsr = number;
export type Bioguide = string;

export interface CrosswalkConflict {
  icpsr: Icpsr;
  bioguides: Bioguide[];
}

export interface Crosswalk {
  byIcpsr: ReadonlyMap<Icpsr, Bioguide>;
  /** One icpsr mapped to multiple bioguide ids — never silently picked. */
  conflicts: readonly CrosswalkConflict[];
}

function icpsrList(id: Legislator["id"]): Icpsr[] {
  if (id.icpsr == null) return [];
  return Array.isArray(id.icpsr) ? id.icpsr : [id.icpsr];
}

export function buildCrosswalk(legislators: Iterable<Legislator>): Crosswalk {
  const candidates = new Map<Icpsr, Set<Bioguide>>();
  for (const leg of legislators) {
    for (const icpsr of icpsrList(leg.id)) {
      let set = candidates.get(icpsr);
      if (!set) candidates.set(icpsr, (set = new Set()));
      set.add(leg.id.bioguide);
    }
  }

  const byIcpsr = new Map<Icpsr, Bioguide>();
  const conflicts: CrosswalkConflict[] = [];
  for (const [icpsr, set] of candidates) {
    if (set.size === 1) {
      byIcpsr.set(icpsr, [...set][0]);
    } else {
      conflicts.push({ icpsr, bioguides: [...set].sort() });
    }
  }
  return { byIcpsr, conflicts };
}

export type Resolution =
  | { ok: true; bioguide: Bioguide; source: "agree" | "crosswalk" | "voteview" }
  | { ok: false; reason: "unmapped" | "mismatch"; icpsr: Icpsr; crosswalk?: Bioguide; voteview?: Bioguide };

/**
 * Resolve one Voteview row to a bioguide_id: crosswalk is authoritative,
 * Voteview's own `bioguide_id` column is reconciled against it.
 *
 * - both present and equal -> `agree`
 * - both present and different -> `mismatch` (a pipeline error to surface)
 * - crosswalk only -> `crosswalk`
 * - Voteview column only -> `voteview` (fallback; worth counting)
 * - neither -> `unmapped`
 */
export function resolveBioguide(
  icpsr: Icpsr,
  voteviewBioguide: string | undefined,
  crosswalk: Crosswalk,
): Resolution {
  const fromXwalk = crosswalk.byIcpsr.get(icpsr);
  const fromVoteview = voteviewBioguide && voteviewBioguide.length > 0 ? voteviewBioguide : undefined;

  if (fromXwalk && fromVoteview) {
    return fromXwalk === fromVoteview
      ? { ok: true, bioguide: fromXwalk, source: "agree" }
      : { ok: false, reason: "mismatch", icpsr, crosswalk: fromXwalk, voteview: fromVoteview };
  }
  if (fromXwalk) return { ok: true, bioguide: fromXwalk, source: "crosswalk" };
  if (fromVoteview) return { ok: true, bioguide: fromVoteview, source: "voteview" };
  return { ok: false, reason: "unmapped", icpsr };
}

export interface IdCrosswalk {
  entries: IdCrosswalkEntry[];
  byIcpsr: ReadonlyMap<Icpsr, Bioguide>;
  conflicts: readonly CrosswalkConflict[];
  /** Voteview icpsrs (non-President) that resolve to no bioguide at all. */
  unresolved: { icpsr: Icpsr; bioname: string; congress: number }[];
}

/**
 * The emitted `id_crosswalk.json`: congress-legislators is authoritative, and
 * where it has no `icpsr` for a member Voteview's own `icpsr`/`bioguide_id`
 * pair fills the gap (tagged `source: "voteview"`). President rows are excluded
 * — this project is about members of Congress.
 */
export function buildIdCrosswalk(
  legislators: Iterable<Legislator>,
  memberRows: Iterable<VoteviewMemberRow>,
): IdCrosswalk {
  const base = buildCrosswalk(legislators);
  const byIcpsr = new Map(base.byIcpsr);
  const entries: IdCrosswalkEntry[] = [...base.byIcpsr].map(
    ([icpsr, bioguide_id]) => ({
      icpsr,
      bioguide_id,
      source: "congress-legislators" as const,
    }),
  );

  const conflicts = [...base.conflicts];
  const unresolved: IdCrosswalk["unresolved"] = [];
  const seenIcpsr = new Set<Icpsr>();

  for (const row of memberRows) {
    if (row.chamber === "President") continue;
    if (byIcpsr.has(row.icpsr) || seenIcpsr.has(row.icpsr)) continue;
    seenIcpsr.add(row.icpsr);

    if (row.bioguide_id) {
      byIcpsr.set(row.icpsr, row.bioguide_id);
      entries.push({
        icpsr: row.icpsr,
        bioguide_id: row.bioguide_id,
        source: "voteview",
      });
    } else {
      unresolved.push({
        icpsr: row.icpsr,
        bioname: row.bioname,
        congress: row.congress,
      });
    }
  }

  entries.sort((a, b) => a.icpsr - b.icpsr);
  return { entries, byIcpsr, conflicts, unresolved };
}
