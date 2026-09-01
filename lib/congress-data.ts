import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mean } from "d3-array";
import type { IdeologyScore, Legislator, Term } from "./entities";
import { CHAMBERS, type Chamber, type ChamberView } from "./chamber";
import { stateName as stateNameOf } from "./states";
import {
  congressStartYear,
  isPlottable,
  partyGroup,
  type ChamberCurrent,
  type ChamberHistory,
  type ChamberMember,
  type MemberProfile,
  type MemberSearchEntry,
  type MemberTrajectoryPoint,
  type PartyMeanPoint,
} from "./congress-types";

/**
 * Build-time chamber datasets.
 *
 * Reads the three normalized pipeline outputs, filters to one chamber, and
 * joins them on `bioguide_id`. `getChamberCurrent` is small (inline on the
 * homepage); `getChamberHistory` is the big scrub-through-time payload, served
 * as a static `/data/{chamber}` asset. See DATA_CONVENTIONS.md.
 */

export type {
  ChamberCurrent,
  ChamberHistory,
  ChamberMember,
  MemberProfile,
  MemberSearchEntry,
  MemberTrajectoryPoint,
  PartyGroup,
  PartyMeanPoint,
} from "./congress-types";
export { congressStartYear, partyGroup } from "./congress-types";

function readOutput<T>(name: string): T[] {
  const path = join(process.cwd(), "pipeline", "output", name);
  return JSON.parse(readFileSync(path, "utf8")) as T[];
}

let legByIdCache: Map<string, Legislator> | null = null;
function legislatorsById(): Map<string, Legislator> {
  if (!legByIdCache) {
    legByIdCache = new Map(
      readOutput<Legislator>("legislators.json").map((l) => [l.bioguide_id, l]),
    );
  }
  return legByIdCache;
}

function displayName(l: Legislator): { name: string; lastName: string } {
  const first = l.name.nickname ?? l.name.first;
  return { name: `${first} ${l.name.last}`, lastName: l.name.last };
}

interface FullChamber {
  chamber: Chamber;
  congresses: number[];
  latestCongress: number;
  allByCongress: Record<number, ChamberMember[]>;
  /** Plottable, sorted by dim1. */
  byCongress: Record<number, ChamberMember[]>;
  trend: PartyMeanPoint[];
}

const fullCache = new Map<Chamber, FullChamber>();

function buildFullChamber(chamber: Chamber): FullChamber {
  const cached = fullCache.get(chamber);
  if (cached) return cached;

  const legById = legislatorsById();
  const terms = readOutput<Term>("terms.json").filter(
    (t) => t.chamber === chamber,
  );
  const scores = readOutput<IdeologyScore>("ideology_scores.json").filter(
    (s) => s.chamber === chamber,
  );
  const scoreByKey = new Map(
    scores.map((s) => [`${s.bioguide_id}:${s.congress_number}`, s]),
  );

  const allByCongress: Record<number, ChamberMember[]> = {};
  for (const term of terms) {
    const leg = legById.get(term.bioguide_id);
    if (!leg) continue;
    const score = scoreByKey.get(`${term.bioguide_id}:${term.congress_number}`);
    const caucus = term.caucus ?? term.party ?? "Unknown";
    const { name, lastName } = displayName(leg);

    // Voteview emits exactly the origin when it couldn't estimate a score.
    const isSentinel =
      score?.nokken_poole_dim1 === 0 && score?.nokken_poole_dim2 === 0;

    const member: ChamberMember = {
      bioguideId: term.bioguide_id,
      chamber,
      name,
      lastName,
      state: term.state,
      district: term.district ?? null,
      party: term.party ?? "Unknown",
      caucus,
      group: partyGroup(caucus, term.congress_number),
      dim1: isSentinel ? null : (score?.nokken_poole_dim1 ?? null),
      dim2: isSentinel ? null : (score?.nokken_poole_dim2 ?? null),
      careerDim1: score?.nominate_dim1 ?? null,
      careerDim2: score?.nominate_dim2 ?? null,
      nVotes: score?.n_votes ?? null,
    };
    (allByCongress[term.congress_number] ??= []).push(member);
  }

  const byCongress: Record<number, ChamberMember[]> = {};
  for (const [congress, members] of Object.entries(allByCongress)) {
    byCongress[+congress] = members
      .filter(isPlottable)
      .sort((a, b) => (a.dim1 as number) - (b.dim1 as number));
    members.sort((a, b) => a.lastName.localeCompare(b.lastName));
  }

  const congresses = Object.keys(allByCongress)
    .map(Number)
    .sort((a, b) => a - b);
  const latestCongress = congresses[congresses.length - 1];

  const trend: PartyMeanPoint[] = congresses.map((congress) => {
    const scored = byCongress[congress] ?? [];
    const meanOf = (group: "dem" | "rep") => {
      const vals = scored
        .filter((m) => m.group === group)
        .map((m) => m.dim1 as number);
      return vals.length ? (mean(vals) ?? null) : null;
    };
    return {
      congress,
      year: congressStartYear(congress),
      dem: meanOf("dem"),
      rep: meanOf("rep"),
    };
  });

  const full: FullChamber = {
    chamber,
    congresses,
    latestCongress,
    allByCongress,
    byCongress,
    trend,
  };
  fullCache.set(chamber, full);
  return full;
}

/** Party means for each Congress across the blended House + Senate set. */
export function getBothTrend(): PartyMeanPoint[] {
  const h = buildFullChamber("house");
  const s = buildFullChamber("senate");
  const congresses = [
    ...new Set([...h.congresses, ...s.congresses]),
  ].sort((a, b) => a - b);
  return congresses.map((congress) => {
    const scored = [
      ...(h.byCongress[congress] ?? []),
      ...(s.byCongress[congress] ?? []),
    ];
    const meanOf = (group: "dem" | "rep") => {
      const vals = scored
        .filter((m) => m.group === group)
        .map((m) => m.dim1 as number);
      return vals.length ? (mean(vals) ?? null) : null;
    };
    return {
      congress,
      year: congressStartYear(congress),
      dem: meanOf("dem"),
      rep: meanOf("rep"),
    };
  });
}

/** Small: current-Congress members + full-history party means for one chamber. */
export function getChamberCurrent(chamber: Chamber): ChamberCurrent {
  const f = buildFullChamber(chamber);
  return {
    chamber,
    latestCongress: f.latestCongress,
    minCongress: f.congresses[0],
    all: f.allByCongress[f.latestCongress] ?? [],
    plottable: f.byCongress[f.latestCongress] ?? [],
    trend: f.trend,
  };
}

/**
 * Like `getChamberCurrent`, but `"both"` blends House + Senate into one set:
 * every member combined, no chamber distinction (colour still encodes party
 * only), and the trend recomputed across the combined set — two party lines,
 * not four.
 */
export function getViewCurrent(view: ChamberView): ChamberCurrent {
  if (view !== "both") return getChamberCurrent(view);

  const h = buildFullChamber("house");
  const s = buildFullChamber("senate");
  const latest = Math.max(h.latestCongress, s.latestCongress);
  return {
    chamber: "both",
    latestCongress: latest,
    minCongress: Math.min(h.congresses[0], s.congresses[0]),
    all: [
      ...(h.allByCongress[latest] ?? []),
      ...(s.allByCongress[latest] ?? []),
    ],
    plottable: [
      ...(h.byCongress[latest] ?? []),
      ...(s.byCongress[latest] ?? []),
    ].sort((a, b) => (a.dim1 as number) - (b.dim1 as number)),
    trend: getBothTrend(),
  };
}

/** Big: every member-Congress for one chamber (the `/data/{chamber}` asset). */
export function getChamberHistory(chamber: Chamber): ChamberHistory {
  const f = buildFullChamber(chamber);
  return {
    chamber,
    congresses: f.congresses,
    allByCongress: f.allByCongress,
  };
}

/** One search entry per current member of both chambers, by last name. */
export function getMemberSearchIndex(): MemberSearchEntry[] {
  const out: MemberSearchEntry[] = [];
  for (const chamber of CHAMBERS) {
    const seen = new Set<string>();
    for (const m of getChamberCurrent(chamber).all) {
      if (seen.has(m.bioguideId)) continue;
      seen.add(m.bioguideId);
      out.push({
        bioguideId: m.bioguideId,
        chamber,
        name: m.name,
        state: m.state,
        district: m.district,
        group: m.group,
      });
    }
  }
  return out.sort((a, b) =>
    a.name.split(" ").at(-1)!.localeCompare(b.name.split(" ").at(-1)!),
  );
}

/** bioguide_id + display name for every current member of a chamber. */
export function getCurrentMembers(
  chamber: Chamber,
): { bioguideId: string; name: string }[] {
  const seen = new Set<string>();
  const out: { bioguideId: string; name: string }[] = [];
  for (const m of getChamberCurrent(chamber).all) {
    if (seen.has(m.bioguideId)) continue;
    seen.add(m.bioguideId);
    out.push({ bioguideId: m.bioguideId, name: m.name });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Votes below this in the latest Congress = did not serve a full term. */
const PARTIAL_TERM_VOTES = 50;

/** Full profile for one member, or null if they held no seat in the latest Congress. */
export function getMemberProfile(
  chamber: Chamber,
  bioguideId: string,
): MemberProfile | null {
  const f = buildFullChamber(chamber);
  const current = (f.allByCongress[f.latestCongress] ?? []).find(
    (m) => m.bioguideId === bioguideId,
  );
  if (!current) return null;

  const leg = legislatorsById().get(bioguideId);
  const firstName = leg?.name.nickname ?? leg?.name.first ?? current.name;
  const lastName = leg?.name.last ?? current.lastName;
  const fullName = leg?.name.official_full ?? current.name;

  const trajectory: MemberTrajectoryPoint[] = [];
  let careerDim1: number | null = null;
  let careerDim2: number | null = null;
  for (const c of f.congresses) {
    const m = (f.allByCongress[c] ?? []).find(
      (x) => x.bioguideId === bioguideId,
    );
    if (!m) continue;
    trajectory.push({ congress: c, year: congressStartYear(c), dim1: m.dim1 });
    if (careerDim1 == null && m.careerDim1 != null) {
      careerDim1 = m.careerDim1;
      careerDim2 = m.careerDim2;
    }
  }

  return {
    bioguideId,
    chamber,
    name: current.name,
    fullName,
    firstName,
    lastName,
    state: current.state,
    stateName: stateNameOf(current.state),
    district: current.district,
    party: current.party,
    caucus: current.caucus,
    group: current.group,
    partialCurrentTerm: (current.nVotes ?? 0) < PARTIAL_TERM_VOTES,
    careerDim1,
    careerDim2,
    currentDim1: current.dim1,
    currentDim2: current.dim2,
    latestCongress: f.latestCongress,
    trajectory,
    firstCongress: trajectory[0]?.congress ?? f.latestCongress,
    chamberCongressCount: trajectory.length,
  };
}
