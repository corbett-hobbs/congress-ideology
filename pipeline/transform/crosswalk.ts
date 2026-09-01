/**
 * icpsr -> bioguide_id crosswalk.
 *
 * Voteview keys members by `icpsr`; this project keys everything by
 * `bioguide_id` (docs/DATA_CONVENTIONS.md §1). The mapping of record is built
 * from the `id` blocks in @unitedstates/congress-legislators, which carry both.
 *
 * Pure — no I/O — so it is unit-tested directly.
 */

import type { Legislator } from "../validate/schemas";

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
