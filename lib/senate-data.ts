import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mean } from "d3-array";
import type {
  IdeologyScore,
  Legislator,
  Term,
} from "./entities";

/**
 * Build-time Senate dataset.
 *
 * Reads the three normalized pipeline outputs, filters to the Senate, and joins
 * them on `bioguide_id`. The result is shaped for the charts and serialized
 * once into the page — there is no runtime fetching. See DATA_CONVENTIONS.md.
 *
 * Which score: the compass, slider and trend all show *movement over time*, so
 * they use the per-Congress `nokken_poole_*` coordinates. The static career
 * `nominate_*` score is carried alongside for reference in the readout.
 */

export type PartyGroup = "dem" | "rep" | "other";

export interface SenateMember {
  bioguideId: string;
  name: string;
  lastName: string;
  state: string;
  /** Registration, e.g. "Independent". */
  party: string;
  /** Conference the member sits with; drives colour. Defaults to `party`. */
  caucus: string;
  group: PartyGroup;
  /** Per-Congress (nokken_poole) — what the charts plot. `null` if unscored. */
  dim1: number | null;
  dim2: number | null;
  /** Static career (nominate) score, for the readout. */
  careerDim1: number | null;
  careerDim2: number | null;
  nVotes: number | null;
}

export interface PartyMeanPoint {
  congress: number;
  year: number;
  dem: number | null;
  rep: number | null;
}

export interface SenatorSearchEntry {
  bioguideId: string;
  name: string;
  /** Most recent state served. */
  state: string;
  group: PartyGroup;
  firstCongress: number;
  latestCongress: number;
}

export interface SenateDataset {
  congresses: number[];
  latestCongress: number;
  /** Members with a plottable `dim1`, by Congress number. Sorted by dim1. */
  byCongress: Record<number, SenateMember[]>;
  /** Every Senate member-Congress, including unscored ones (for the table). */
  allByCongress: Record<number, SenateMember[]>;
  trend: PartyMeanPoint[];
  /** One entry per senator (ever), for name search. Sorted by last name. */
  search: SenatorSearchEntry[];
}

/** The modern Republican party dates from the 33rd Congress (1854). Before
 *  that, congress-legislators labels Jeffersonian Democratic-Republicans
 *  "Republican" too — a different party. Keep them out of the R group. */
const MODERN_REPUBLICAN_FROM = 33;

export function partyGroup(caucus: string, congress: number): PartyGroup {
  if (caucus === "Democrat") return "dem";
  if (caucus === "Republican" && congress >= MODERN_REPUBLICAN_FROM) return "rep";
  return "other";
}

export function congressStartYear(congress: number): number {
  return 1789 + (congress - 1) * 2;
}

const MIN_VOTES_FOR_SCORE = 10;

/**
 * A per-Congress score is plottable when it exists (not null, not the origin
 * sentinel) and rests on enough votes to mean something — excludes senators
 * who served only days (Vance in the 119th, etc.).
 */
function isPlottable(m: SenateMember): boolean {
  if (m.dim1 == null || m.dim2 == null) return false;
  return (m.nVotes ?? 0) >= MIN_VOTES_FOR_SCORE;
}

function readOutput<T>(name: string): T[] {
  const path = join(process.cwd(), "pipeline", "output", name);
  return JSON.parse(readFileSync(path, "utf8")) as T[];
}

function displayName(l: Legislator): { name: string; lastName: string } {
  const last = [l.name.last, l.name.suffix].filter(Boolean).join(" ");
  const first = l.name.nickname ?? l.name.first;
  return { name: `${first} ${l.name.last}`, lastName: last || l.name.last };
}

let cached: SenateDataset | null = null;

export function getSenateDataset(): SenateDataset {
  if (cached) return cached;

  const legislators = readOutput<Legislator>("legislators.json");
  const terms = readOutput<Term>("terms.json").filter(
    (t) => t.chamber === "senate",
  );
  const scores = readOutput<IdeologyScore>("ideology_scores.json").filter(
    (s) => s.chamber === "senate",
  );

  const legById = new Map(legislators.map((l) => [l.bioguide_id, l]));
  const scoreByKey = new Map(
    scores.map((s) => [`${s.bioguide_id}:${s.congress_number}`, s]),
  );

  const allByCongress: Record<number, SenateMember[]> = {};
  const congresses = new Set<number>();

  for (const term of terms) {
    const leg = legById.get(term.bioguide_id);
    if (!leg) continue;
    const score = scoreByKey.get(`${term.bioguide_id}:${term.congress_number}`);
    const caucus = term.caucus ?? term.party ?? "Unknown";
    const { name, lastName } = displayName(leg);

    // Voteview emits exactly the origin when it couldn't estimate a
    // per-Congress score (a senator who served only days).
    const isSentinel =
      score?.nokken_poole_dim1 === 0 && score?.nokken_poole_dim2 === 0;

    const member: SenateMember = {
      bioguideId: term.bioguide_id,
      name,
      lastName,
      state: term.state,
      party: term.party ?? "Unknown",
      caucus,
      group: partyGroup(caucus, term.congress_number),
      dim1: isSentinel ? null : (score?.nokken_poole_dim1 ?? null),
      dim2: isSentinel ? null : (score?.nokken_poole_dim2 ?? null),
      careerDim1: score?.nominate_dim1 ?? null,
      careerDim2: score?.nominate_dim2 ?? null,
      nVotes: score?.n_votes ?? null,
    };

    congresses.add(term.congress_number);
    (allByCongress[term.congress_number] ??= []).push(member);
  }

  const byCongress: Record<number, SenateMember[]> = {};
  for (const [congress, members] of Object.entries(allByCongress)) {
    byCongress[+congress] = members
      .filter(isPlottable)
      .sort((a, b) => (a.dim1 as number) - (b.dim1 as number));
    members.sort((a, b) => a.lastName.localeCompare(b.lastName));
  }

  const sortedCongresses = [...congresses].sort((a, b) => a - b);
  const trend: PartyMeanPoint[] = sortedCongresses.map((congress) => {
    const scored = byCongress[congress] ?? [];
    const meanOf = (group: PartyGroup) => {
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

  const searchById = new Map<string, SenatorSearchEntry>();
  for (const congress of sortedCongresses) {
    for (const m of allByCongress[congress]) {
      const prev = searchById.get(m.bioguideId);
      if (!prev) {
        searchById.set(m.bioguideId, {
          bioguideId: m.bioguideId,
          name: m.name,
          state: m.state,
          group: m.group,
          firstCongress: congress,
          latestCongress: congress,
        });
      } else {
        prev.state = m.state;
        prev.group = m.group;
        prev.latestCongress = congress;
      }
    }
  }
  const search = [...searchById.values()].sort((a, b) =>
    a.name.split(" ").at(-1)!.localeCompare(b.name.split(" ").at(-1)!),
  );

  cached = {
    congresses: sortedCongresses,
    latestCongress: sortedCongresses[sortedCongresses.length - 1],
    byCongress,
    allByCongress,
    trend,
    search,
  };
  return cached;
}
