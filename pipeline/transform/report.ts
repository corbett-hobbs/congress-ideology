import type { Legislator, Term } from "../../lib/entities";
import type { IdCrosswalk } from "./crosswalk";
import type { ScoresResult } from "./scores";

export interface TransformReport {
  legislators: { total: number; withBirthYear: number };
  crosswalk: {
    entries: number;
    fromCongressLegislators: number;
    fromVoteview: number;
    conflicts: number;
    voteviewIcpsrsUnresolvable: number;
  };
  terms: {
    total: number;
    byChamber: { house: number; senate: number };
    congressRange: [number, number];
    collisionsMerged: number;
    missingParty: number;
  };
  ideologyScores: {
    total: number;
    resolution: ScoresResult["resolution"];
    mismatches: number;
    unresolvableRowsDropped: number;
  };
  join: {
    termsWithScore: number;
    termsMissingScore: number;
    /**
     * Why a term has no score:
     *  before1901        - Voteview's pre-1901 coverage is uneven
     *  neverScoredMember - member never has a Voteview score in any Congress
     *                      (non-voting delegates: DC, PR, territories, and
     *                      pre-statehood AK/HI/NM/... delegates)
     *  briefService      - member is scored in other Congresses but served too
     *                      little of this one to be scored (special election,
     *                      resignation, death, appointment)
     */
    termsMissingScoreReasons: {
      before1901: number;
      neverScoredMember: number;
      briefService: number;
    };
    termsMissingScoreSamples: string[];
    scoresWithoutTerm: number;
  };
}

export function buildReport(input: {
  legislators: Legislator[];
  crosswalk: IdCrosswalk;
  terms: Term[];
  termCollisions: number;
  scoresResult: ScoresResult;
}): TransformReport {
  const { legislators, crosswalk, terms, termCollisions, scoresResult } = input;
  const { scores } = scoresResult;

  const scoreKeys = new Set(
    scores.map((s) => `${s.bioguide_id}|${s.congress_number}|${s.chamber}`),
  );
  const termKeys = new Set(
    terms.map((t) => `${t.bioguide_id}|${t.congress_number}|${t.chamber}`),
  );
  const scoredMembers = new Set(scores.map((s) => s.bioguide_id));
  const nameOf = new Map(
    legislators.map((l) => [l.bioguide_id, `${l.name.first} ${l.name.last}`]),
  );

  let withScore = 0;
  const reasons = { before1901: 0, neverScoredMember: 0, briefService: 0 };
  const samples: string[] = [];
  for (const t of terms) {
    const key = `${t.bioguide_id}|${t.congress_number}|${t.chamber}`;
    if (scoreKeys.has(key)) {
      withScore += 1;
      continue;
    }
    if (t.congress_number <= 56) {
      reasons.before1901 += 1;
    } else if (!scoredMembers.has(t.bioguide_id)) {
      reasons.neverScoredMember += 1;
    } else {
      reasons.briefService += 1;
      if (samples.length < 40) {
        samples.push(
          `${nameOf.get(t.bioguide_id) ?? "?"} [${t.bioguide_id}] C${t.congress_number} ${t.chamber} ${t.state}`,
        );
      }
    }
  }
  const scoresWithoutTerm = [...scoreKeys].filter((k) => !termKeys.has(k)).length;

  const congresses = terms.map((t) => t.congress_number);

  return {
    legislators: {
      total: legislators.length,
      withBirthYear: legislators.filter((l) => l.birth_year != null).length,
    },
    crosswalk: {
      entries: crosswalk.entries.length,
      fromCongressLegislators: crosswalk.entries.filter(
        (e) => e.source === "congress-legislators",
      ).length,
      fromVoteview: crosswalk.entries.filter((e) => e.source === "voteview").length,
      conflicts: crosswalk.conflicts.length,
      voteviewIcpsrsUnresolvable: crosswalk.unresolved.length,
    },
    terms: {
      total: terms.length,
      byChamber: {
        house: terms.filter((t) => t.chamber === "house").length,
        senate: terms.filter((t) => t.chamber === "senate").length,
      },
      congressRange: [Math.min(...congresses), Math.max(...congresses)],
      collisionsMerged: termCollisions,
      missingParty: terms.filter((t) => t.party == null).length,
    },
    ideologyScores: {
      total: scores.length,
      resolution: scoresResult.resolution,
      mismatches: scoresResult.mismatches.length,
      unresolvableRowsDropped: scoresResult.unresolvable.length,
    },
    join: {
      termsWithScore: withScore,
      termsMissingScore: terms.length - withScore,
      termsMissingScoreReasons: reasons,
      termsMissingScoreSamples: samples,
      scoresWithoutTerm,
    },
  };
}

export function printReport(r: TransformReport): void {
  const pct = (n: number, d: number) =>
    d === 0 ? "0%" : `${((100 * n) / d).toFixed(2)}%`;

  console.log("\ntransform report");
  console.log(`  legislators:            ${r.legislators.total}  (${r.legislators.withBirthYear} with birth year)`);
  console.log(
    `  id_crosswalk entries:   ${r.crosswalk.entries}  (${r.crosswalk.fromCongressLegislators} congress-legislators + ${r.crosswalk.fromVoteview} voteview)`,
  );
  console.log(`  crosswalk conflicts:    ${r.crosswalk.conflicts}`);
  console.log(
    `  voteview icpsrs with no bioguide anywhere: ${r.crosswalk.voteviewIcpsrsUnresolvable}`,
  );
  console.log(
    `  terms:                  ${r.terms.total}  (house ${r.terms.byChamber.house}, senate ${r.terms.byChamber.senate}, Congresses ${r.terms.congressRange[0]}-${r.terms.congressRange[1]})`,
  );
  console.log(`  term records merged:    ${r.terms.collisionsMerged}`);
  console.log(
    `  ideology_scores:        ${r.ideologyScores.total}  (agree ${r.ideologyScores.resolution.agree}, crosswalk-only ${r.ideologyScores.resolution.crosswalk}, voteview-only ${r.ideologyScores.resolution.voteview})`,
  );
  console.log(`  crosswalk/voteview mismatches: ${r.ideologyScores.mismatches}`);
  console.log(
    `  voteview rows dropped (unresolvable): ${r.ideologyScores.unresolvableRowsDropped}`,
  );
  console.log(
    `  terms with an ideology score:    ${r.join.termsWithScore} / ${r.terms.total}  (${pct(r.join.termsWithScore, r.terms.total)})`,
  );
  const m = r.join.termsMissingScoreReasons;
  console.log(
    `  terms missing an ideology score: ${r.join.termsMissingScore}  (pre-1901 ${m.before1901}, non-voting delegate ${m.neverScoredMember}, brief service ${m.briefService})`,
  );
  console.log(`  ideology scores with no matching term: ${r.join.scoresWithoutTerm}`);
}
