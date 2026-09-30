import type {
  CourtMedianProbability,
  CourtTermRow,
  Justice,
  MqScore,
} from "./court-entities";
import type {
  CourtJustice,
  CourtParty,
  CourtPayload,
  CourtPresident,
  CourtTerm,
} from "./court-types";

/**
 * Pure (no file I/O) shaping of the Court track's normalized outputs into the
 * compact client payload. `lib/justice-data.ts` reads the files and calls this.
 * Rules worth knowing (also in docs/SCOTUS_DATA_METHODOLOGY.md):
 *
 *  - The Court median for a split term (two records, `a`/`b`) is the
 *    post-replacement `b` record.
 *  - The score domain is fitted to the data (min/max `mq_score`, padded, rounded
 *    outward to 0.5) and is deliberately asymmetric.
 *  - Who left/joined mid-term comes from the a/b median-probability records
 *    (a justice in `a` but not `b` left; in `b` but not `a` joined), falling back
 *    to service dates for a justice in neither; single-record terms with more
 *    than nine scored justices use service dates inside the term window.
 *  - `career` is the unweighted mean of a justice's per-term `mq_score`.
 */

/** Presidents in office order. Anything not listed is appended by first service date. */
const PRESIDENT_KEYS: readonly (readonly [full: string, key: string])[] = [
  ["Woodrow Wilson", "Wilson"],
  ["Warren G. Harding", "Harding"],
  ["Calvin Coolidge", "Coolidge"],
  ["Herbert Hoover", "Hoover"],
  ["Franklin D. Roosevelt", "F. Roosevelt"],
  ["Harry S Truman", "Truman"],
  ["Dwight D. Eisenhower", "Eisenhower"],
  ["John F. Kennedy", "Kennedy"],
  ["Lyndon B. Johnson", "Johnson"],
  ["Richard M. Nixon", "Nixon"],
  ["Gerald Ford", "Ford"],
  ["Ronald Reagan", "Reagan"],
  ["George H.W. Bush", "G.H.W. Bush"],
  ["William J. Clinton", "Clinton"],
  ["George W. Bush", "G.W. Bush"],
  ["Barack Obama", "Obama"],
  ["Donald J. Trump", "Trump"],
  ["Joseph R. Biden", "Biden"],
];

const round = (v: number, places: number) => {
  const f = 10 ** places;
  return Math.round(v * f) / f;
};

const partyOf = (p: Justice["appointing_party"]): CourtParty =>
  p === "Democratic" ? "D" : "R";

/** Fitted score domain: data min/max, 3% padding, rounded outward to 0.5. */
export function fitDomain(scores: readonly number[]): [number, number] {
  const lo = Math.min(...scores);
  const hi = Math.max(...scores);
  const pad = (hi - lo) * 0.03;
  return [Math.floor((lo - pad) * 2) / 2, Math.ceil((hi + pad) * 2) / 2];
}

/** October t through June t+1, as ISO dates (the Court's sitting). */
const termWindow = (t: number) => ({
  from: `${t}-10-01`,
  to: `${t + 1}-06-30`,
});

function midTermChange(
  term: number,
  scored: Justice[],
  records: CourtTermRow[],
  probs: CourtMedianProbability[],
): { left: number[]; joined: number[] } {
  const none = { left: [], joined: [] };
  const win = termWindow(term);
  const endsIn = (j: Justice) =>
    j.service_end != null && j.service_end >= win.from && j.service_end <= win.to;
  const startsIn = (j: Justice) =>
    j.service_start >= win.from && j.service_start <= win.to;

  if (records.length > 1) {
    const seg = (s: "a" | "b") =>
      new Set(
        probs
          .filter((p) => p.term === term && p.segment === s)
          .map((p) => p.justice_id),
      );
    const a = seg("a");
    const b = seg("b");
    const left: number[] = [];
    const joined: number[] = [];
    for (const j of scored) {
      const inA = a.has(j.justice_id);
      const inB = b.has(j.justice_id);
      if (inA && !inB) left.push(j.justice_id);
      else if (!inA && inB) joined.push(j.justice_id);
      else if (!inA && !inB) {
        // In neither median record (Minton, 1956): the dates decide.
        if (endsIn(j)) left.push(j.justice_id);
        else if (startsIn(j)) joined.push(j.justice_id);
      }
    }
    return { left, joined };
  }

  if (scored.length > 9) {
    return {
      left: scored.filter(endsIn).map((j) => j.justice_id),
      joined: scored.filter(startsIn).map((j) => j.justice_id),
    };
  }
  return none;
}

export function buildCourtPayload(input: {
  justices: Justice[];
  scores: MqScore[];
  terms: CourtTermRow[];
  probabilities: CourtMedianProbability[];
}): CourtPayload {
  const { justices, scores, terms, probabilities } = input;
  const justiceById = new Map(justices.map((j) => [j.justice_id, j]));

  const termNums = [...new Set(scores.map((s) => s.term))].sort((a, b) => a - b);
  const firstTerm = termNums[0];
  const lastTerm = termNums[termNums.length - 1];
  termNums.forEach((t, i) => {
    if (t !== firstTerm + i) throw new Error(`court: gap in terms at ${t}`);
  });

  // --- justices ---
  const scoresBy = new Map<number, MqScore[]>();
  for (const s of scores) {
    const arr = scoresBy.get(s.justice_id) ?? [];
    arr.push(s);
    scoresBy.set(s.justice_id, arr);
  }

  const lastNames = new Map<string, number>();
  for (const j of justices) {
    lastNames.set(j.name.last, (lastNames.get(j.name.last) ?? 0) + 1);
  }

  const presKeyFor = new Map<string, string>(PRESIDENT_KEYS);
  const unlisted = [...new Set(justices.map((j) => j.appointing_president))]
    .filter((p) => !presKeyFor.has(p))
    .sort((a, b) => {
      const first = (p: string) =>
        justices
          .filter((j) => j.appointing_president === p)
          .map((j) => j.service_start)
          .sort()[0];
      return first(a).localeCompare(first(b));
    });
  for (const p of unlisted) presKeyFor.set(p, p.split(" ").at(-1) as string);
  const presOrder = [
    ...PRESIDENT_KEYS.map(([full]) => full),
    ...unlisted,
  ];

  const out: CourtJustice[] = [];
  for (const j of justices) {
    const rows = (scoresBy.get(j.justice_id) ?? []).sort((a, b) => a.term - b.term);
    if (rows.length === 0) continue; // not scored: no place in a score chart
    rows.forEach((r, i) => {
      if (r.term !== rows[0].term + i) {
        throw new Error(`court: justice ${j.justice_id} has a gap at ${r.term}`);
      }
    });
    const first = j.name.first;
    const dup = (lastNames.get(j.name.last) ?? 0) > 1;
    out.push({
      id: j.justice_id,
      name: `${first} ${j.name.last}`,
      short: dup ? `${first[0]}. ${j.name.last}` : j.name.last,
      pres: presKeyFor.get(j.appointing_president) as string,
      party: partyOf(j.appointing_party),
      t0: rows[0].term,
      t1: rows[rows.length - 1].term,
      s: rows.map((r) => round(r.mq_score, 3)),
      lo: rows.map((r) => round(r.mq_lo95, 3)),
      hi: rows.map((r) => round(r.mq_hi95, 3)),
      career: round(rows.reduce((a, r) => a + r.mq_score, 0) / rows.length, 3),
    });
  }
  out.sort((a, b) => a.t0 - b.t0 || a.id - b.id);

  // --- per-term court records ---
  const courtTerms: CourtTerm[] = termNums.map((term) => {
    const recs = terms.filter((r) => r.term === term);
    if (recs.length === 0) throw new Error(`court: no court record for ${term}`);
    // Split terms: the post-replacement `b` record (last by segment).
    const rec = [...recs].sort((x, y) =>
      (x.segment ?? "").localeCompare(y.segment ?? ""),
    )[recs.length - 1];
    const scored = scores
      .filter((s) => s.term === term)
      .map((s) => justiceById.get(s.justice_id) as Justice);
    const { left, joined } = midTermChange(term, scored, recs, probabilities);
    return {
      term,
      median: round(rec.median_score, 3),
      medianJusticeId: rec.median_justice_id,
      medianProb: round(rec.median_justice_probability, 3),
      left,
      joined,
    };
  });

  // --- presidents ---
  const presidents: CourtPresident[] = presOrder
    .map((full) => {
      const key = presKeyFor.get(full) as string;
      const mine = out.filter((j) => j.pres === key);
      return {
        key,
        full,
        party: mine[0]?.party as CourtParty,
        justiceIds: mine.map((j) => j.id),
      };
    })
    .filter((p) => p.justiceIds.length > 0);

  return {
    firstTerm,
    lastTerm,
    domain: fitDomain(scores.map((s) => s.mq_score)),
    justices: out,
    terms: courtTerms,
    presidents,
  };
}
