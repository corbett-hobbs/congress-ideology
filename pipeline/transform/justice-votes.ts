import {
  DecisionsDataError,
  ROLE_CONCURRED,
  ROLE_CONCURRENCE,
  ROLE_DISSENT,
  ROLE_MAJORITY,
  ROLE_NONE,
  VOTE_DISSENT,
  VOTE_DIVIDED,
  VOTE_MAJORITY,
  VOTE_NONE,
  type JusticeVote,
  type JusticeVotesFile,
  type ScdbCaseRow,
  type ScdbJusticeRow,
} from "../../lib/decisions-entities";

/**
 * Pure logic for how each justice voted in each argued case (no file I/O; `decisions-run.ts` reads and writes). Source: the
 * justice-centered SCDB file, one row per (case, justice), joined to the case-centered file by `caseId`. Only cases in scope for the
 * Decisions page get a row. docs/DECISIONS_METHODOLOGY.md "How each justice voted".
 */

/** SCDB `opinion` value for "wrote an opinion". */
const WROTE = 2;
/** SCDB `vote` values for a concurrence (regular, special). */
const CONCURRENCES: readonly number[] = [3, 4];
/** SCDB `vote` value for taking part in an equally divided Court. */
const EQUALLY_DIVIDED = 8;
/** `vote` values that carry no majority code: an equally divided Court, and a dissent from a denial of review (SCDB counts neither in the case's split). */
const NO_SIDE: readonly number[] = [6, 8];

export function classifyVote(row: ScdbJusticeRow, majorityWriter: number | null): [number, number] {
  if (row.vote === EQUALLY_DIVIDED) return [VOTE_DIVIDED, ROLE_NONE];
  if (row.majority === null) return [VOTE_NONE, ROLE_NONE];
  const wrote = row.opinion === WROTE;
  if (row.majority === 1) return [VOTE_DISSENT, wrote ? ROLE_DISSENT : ROLE_NONE];
  if (wrote && row.justice === majorityWriter) return [VOTE_MAJORITY, ROLE_MAJORITY];
  if (row.vote !== null && CONCURRENCES.includes(row.vote)) return [VOTE_MAJORITY, wrote ? ROLE_CONCURRENCE : ROLE_CONCURRED];
  return [VOTE_MAJORITY, ROLE_NONE];
}

export interface JusticeVotesBuild {
  votes: JusticeVotesFile;
  report: { justices: number; rows: number; by_vote: Record<string, number>; by_role: Record<string, number>; cases_without_rows: number; out_of_scope_rows: number };
}

/** One entry per (justice, in-scope case), cases in id order (SCDB ids start with the term). Fails on a vote that does not reconcile with the case's counts. */
export function buildJusticeVotes(rows: readonly ScdbJusticeRow[], cases: readonly ScdbCaseRow[]): JusticeVotesBuild {
  const byCase = new Map(cases.map((c) => [c.caseId, c]));
  const out = new Map<number, JusticeVote[]>();
  const tally = new Map<string, { maj: number; min: number; div: number }>();
  const seen = new Set<string>();
  const byVote = { none: 0, majority: 0, dissent: 0, divided: 0 };
  const byRole = { none: 0, majority_opinion: 0, concurrence: 0, dissent: 0, concurred: 0 };
  let outOfScope = 0;
  for (const r of rows) {
    const c = byCase.get(r.caseId);
    if (!c) {
      outOfScope += 1;
      continue;
    }
    const key = `${r.caseId}|${r.justice}`;
    if (seen.has(key)) throw new DecisionsDataError(`justice ${r.justice} has two rows for case ${r.caseId}`);
    seen.add(key);
    const [vote, role] = classifyVote(r, c.majOpinWriter);
    if (r.vote !== null && !NO_SIDE.includes(r.vote) && r.majority === null) throw new DecisionsDataError(`case ${r.caseId} justice ${r.justice}: vote ${r.vote} with no majority code`);
    const t = tally.get(r.caseId) ?? { maj: 0, min: 0, div: 0 };
    if (vote === VOTE_DIVIDED) t.div += 1;
    if (vote === VOTE_MAJORITY) t.maj += 1;
    if (vote === VOTE_DISSENT) t.min += 1;
    tally.set(r.caseId, t);
    byVote[(["none", "majority", "dissent", "divided"] as const)[vote]!] += 1;
    byRole[(["none", "majority_opinion", "concurrence", "dissent", "concurred"] as const)[role]!] += 1;
    const list = out.get(r.justice) ?? [];
    list.push([r.caseId, vote, role]);
    out.set(r.justice, list);
  }
  let withoutRows = 0;
  for (const c of cases) {
    const t = tally.get(c.caseId);
    if (!t) {
      withoutRows += 1;
      continue;
    }
    // An equally divided Court has no sides: SCDB gives the halves in majVotes / minVotes and codes each justice 8.
    if (t.div > 0 ? t.div !== c.majVotes + c.minVotes || t.maj + t.min !== 0 : t.maj !== c.majVotes || t.min !== c.minVotes) {
      throw new DecisionsDataError(`case ${c.caseId}: the justices' votes give ${t.maj}-${t.min} (${t.div} equally divided) but the case says ${c.majVotes}-${c.minVotes}`);
    }
  }
  if (withoutRows > 0) throw new DecisionsDataError(`${withoutRows} cases in scope have no justice rows`);
  const votes: JusticeVotesFile = {};
  for (const id of [...out.keys()].sort((a, b) => a - b)) votes[String(id)] = out.get(id)!.sort((a, b) => a[0].localeCompare(b[0]));
  return { votes, report: { justices: out.size, rows: seen.size, by_vote: byVote, by_role: byRole, cases_without_rows: withoutRows, out_of_scope_rows: outOfScope } };
}
