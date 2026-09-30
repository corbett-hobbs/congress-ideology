import type {
  CourtMedianProbability,
  CourtTermRow,
  Justice,
  JusticeCrosswalkEntry,
  MqScore,
} from "../../lib/court-entities";

/**
 * Supreme Court track: pure parsing / normalization / validation. No file I/O
 * (see court-run.ts). Every failure throws CourtDataError with a specific,
 * actionable message — bad data must fail the build, never reach a page.
 */

export class CourtDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CourtDataError";
  }
}

type Row = Record<string, string>;

function num(file: string, row: Row, col: string, label: string): number {
  const raw = row[col];
  const n = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  if (!Number.isFinite(n)) {
    throw new CourtDataError(`${file}: ${label}: column "${col}" is not a finite number (got ${JSON.stringify(raw)})`);
  }
  return n;
}

// --- MQ justices.csv ------------------------------------------------------

export interface MqJusticeRow {
  term: number;
  scdb_id: number;
  scdb_name: string;
  post_mn: number;
  post_sd: number;
  post_med: number;
  post_025: number;
  post_975: number;
}

export function parseMqJustices(rows: Row[]): MqJusticeRow[] {
  const f = "mq/justices.csv";
  return rows.map((r, i) => {
    const label = `row ${i + 2} (${r.justiceName} ${r.term})`;
    const scdb_name = (r.justiceName ?? "").trim();
    if (!scdb_name) throw new CourtDataError(`${f}: ${label}: empty justiceName`);
    return {
      term: num(f, r, "term", label),
      scdb_id: num(f, r, "justice", label),
      scdb_name,
      post_mn: num(f, r, "post_mn", label),
      post_sd: num(f, r, "post_sd", label),
      post_med: num(f, r, "post_med", label),
      post_025: num(f, r, "post_025", label),
      post_975: num(f, r, "post_975", label),
    };
  });
}

/**
 * One person = one justice_id. The SCDB numeric `justice` must map 1:1 to a
 * name code across every term; a person who appears under two ids (or two
 * people under one) is a data error we surface rather than merge by guess.
 */
export function buildIdentityMap(rows: MqJusticeRow[]): Map<string, number> {
  const idToName = new Map<number, string>();
  const nameToId = new Map<string, number>();
  for (const r of rows) {
    const prevName = idToName.get(r.scdb_id);
    if (prevName !== undefined && prevName !== r.scdb_name) {
      throw new CourtDataError(
        `justices.csv: SCDB justice ${r.scdb_id} appears under two names ("${prevName}", "${r.scdb_name}") — identity is ambiguous`,
      );
    }
    const prevId = nameToId.get(r.scdb_name);
    if (prevId !== undefined && prevId !== r.scdb_id) {
      throw new CourtDataError(
        `justices.csv: "${r.scdb_name}" appears under two SCDB ids (${prevId}, ${r.scdb_id}) — a person must have one justice_id`,
      );
    }
    idToName.set(r.scdb_id, r.scdb_name);
    nameToId.set(r.scdb_name, r.scdb_id);
  }
  return nameToId;
}

export function buildMqScores(rows: MqJusticeRow[]): MqScore[] {
  const seen = new Set<string>();
  const out = rows.map((r) => {
    const key = `${r.scdb_id}|${r.term}`;
    if (seen.has(key)) {
      throw new CourtDataError(`justices.csv: duplicate (justice ${r.scdb_id} "${r.scdb_name}", term ${r.term})`);
    }
    seen.add(key);
    return {
      justice_id: r.scdb_id,
      term: r.term,
      mq_score: r.post_mn,
      mq_sd: r.post_sd,
      mq_median: r.post_med,
      mq_lo95: r.post_025,
      mq_hi95: r.post_975,
    };
  });
  return out.sort((a, b) => a.justice_id - b.justice_id || a.term - b.term);
}

// --- MQ court.csv ---------------------------------------------------------

/** "1937a" -> { term: 1937, segment: "a" }; "1958" -> { term: 1958, segment: null }. */
export function parseTermLabel(label: string): { term: number; segment: "a" | "b" | null } {
  const m = /^(\d{4})([ab])?$/.exec(label.trim());
  if (!m) throw new CourtDataError(`court.csv: unrecognised term label ${JSON.stringify(label)} (expected "1958" or "1937a")`);
  return { term: Number(m[1]), segment: (m[2] as "a" | "b" | undefined) ?? null };
}

const COURT_FIXED = new Set(["term", "med", "med_sd", "min", "max", "justice", "just_pr"]);

export function parseMqCourt(
  rows: Row[],
  nameToId: Map<string, number>,
): { courtTerms: CourtTermRow[]; probabilities: CourtMedianProbability[] } {
  const f = "mq/court.csv";
  const courtTerms: CourtTermRow[] = [];
  const probabilities: CourtMedianProbability[] = [];
  const seen = new Set<string>();

  for (const [i, r] of rows.entries()) {
    const label = `row ${i + 2} (term ${r.term})`;
    const { term, segment } = parseTermLabel(r.term ?? "");
    // The key preserves turnover records: (1937, "a") and (1937, "b") stay distinct.
    const key = `${term}|${segment ?? ""}`;
    if (seen.has(key)) throw new CourtDataError(`${f}: ${label}: duplicate court record for term ${term} segment ${segment ?? "(none)"}`);
    seen.add(key);

    const medName = (r.justice ?? "").trim();
    const medId = nameToId.get(medName);
    if (medId === undefined) throw new CourtDataError(`${f}: ${label}: median justice "${medName}" is not a justice in justices.csv`);

    courtTerms.push({
      term,
      segment,
      median_score: num(f, r, "med", label),
      median_sd: num(f, r, "med_sd", label),
      min_score: num(f, r, "min", label),
      max_score: num(f, r, "max", label),
      median_justice_id: medId,
      median_justice_probability: num(f, r, "just_pr", label),
    });

    let sum = 0;
    for (const [col, raw] of Object.entries(r)) {
      if (COURT_FIXED.has(col) || raw === undefined || raw.trim() === "") continue;
      const id = nameToId.get(col);
      if (id === undefined) throw new CourtDataError(`${f}: ${label}: probability column "${col}" is not a justice in justices.csv`);
      const p = num(f, r, col, label);
      sum += p;
      probabilities.push({ term, segment, justice_id: id, probability: p });
    }
    if (Math.abs(sum - 1) > 0.01) {
      throw new CourtDataError(`${f}: ${label}: median-justice probabilities sum to ${sum.toFixed(4)}, expected 1`);
    }
  }

  const sortKey = (t: { term: number; segment: string | null }) => `${t.term}${t.segment ?? ""}`;
  courtTerms.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  probabilities.sort(
    (a, b) => sortKey(a).localeCompare(sortKey(b)) || a.justice_id - b.justice_id,
  );
  return { courtTerms, probabilities };
}

// --- FJC bios -------------------------------------------------------------

export const SCOTUS_COURT_NAME = "Supreme Court of the United States";

export interface FjcAppointment {
  title: string;
  president: string;
  party: string;
  nomination: string | null;
  confirmation: string | null;
  /** Earliest of recess-appointment and commission dates. */
  start: string;
  /** Senior-status date, else termination date, else null (still serving). */
  end: string | null;
}

export interface FjcJustice {
  nid: number;
  first: string;
  middle: string | null;
  last: string;
  suffix: string | null;
  birth_year: number | null;
  death_year: number | null;
  /** Sorted by start. */
  appointments: FjcAppointment[];
  /** Hull of all appointments. */
  start: string;
  end: string | null;
}

const blank = (s: string | undefined): string | null => (s === undefined || s.trim() === "" ? null : s.trim());

export function buildFjcJustices(service: Row[], demographics: Row[]): FjcJustice[] {
  const demo = new Map(demographics.map((d) => [d.nid, d]));
  const byNid = new Map<string, FjcAppointment[]>();

  for (const r of service) {
    if (r["Court Name"] !== SCOTUS_COURT_NAME) continue; // excludes the D.C. "Supreme Court" rows
    const start = [blank(r["Recess Appointment Date"]), blank(r["Commission Date"])]
      .filter((d): d is string => d !== null)
      .sort()[0];
    if (!start) throw new CourtDataError(`fjc: nid ${r.nid} (${r["Judge Name"]}): SCOTUS appointment with no recess or commission date`);
    const list = byNid.get(r.nid) ?? [];
    list.push({
      title: r["Appointment Title"],
      president: r["Appointing President"].trim(),
      party: r["Party of Appointing President"].trim(),
      nomination: blank(r["Nomination Date"]),
      confirmation: blank(r["Confirmation Date"]),
      start,
      end: blank(r["Senior Status Date"]) ?? blank(r["Termination Date"]),
    });
    byNid.set(r.nid, list);
  }

  const out: FjcJustice[] = [];
  for (const [nid, apps] of byNid) {
    const d = demo.get(nid);
    if (!d) throw new CourtDataError(`fjc: nid ${nid} has a SCOTUS appointment but no demographics.csv row`);
    apps.sort((a, b) => a.start.localeCompare(b.start));
    const yr = (s: string | undefined) => (blank(s) === null ? null : Number(s));
    out.push({
      nid: Number(nid),
      first: d["First Name"].trim(),
      middle: blank(d["Middle Name"]),
      last: d["Last Name"].trim(),
      suffix: blank(d["Suffix"]),
      birth_year: yr(d["Birth Year"]),
      death_year: yr(d["Death Year"]),
      appointments: apps,
      start: apps[0].start,
      end: apps[apps.length - 1].end,
    });
  }
  return out.sort((a, b) => a.nid - b.nid);
}

// --- Crosswalk ------------------------------------------------------------

/** Lower-case letters only: "O'Connor" -> "oconnor". */
export const normName = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, "");

/** Oct 1 of `term` through Sep 30 of the following year, ISO. */
export const termWindow = (term: number): [string, string] => [`${term}-10-01`, `${term + 1}-09-30`];

export interface MqSpan {
  justice_id: number;
  scdb_name: string;
  first_term: number;
  last_term: number;
}

export function mqSpans(rows: MqJusticeRow[]): MqSpan[] {
  const m = new Map<number, MqSpan>();
  for (const r of rows) {
    const s = m.get(r.scdb_id);
    if (!s) m.set(r.scdb_id, { justice_id: r.scdb_id, scdb_name: r.scdb_name, first_term: r.term, last_term: r.term });
    else {
      s.first_term = Math.min(s.first_term, r.term);
      s.last_term = Math.max(s.last_term, r.term);
    }
  }
  return [...m.values()].sort((a, b) => a.justice_id - b.justice_id);
}

/** FJC justices whose last name matches AND whose service overlaps the MQ terms. */
export function crosswalkCandidates(span: MqSpan, lastName: string, fjc: FjcJustice[]): FjcJustice[] {
  const from = termWindow(span.first_term)[0];
  const to = termWindow(span.last_term)[1];
  return fjc.filter(
    (j) => normName(j.last) === normName(lastName) && j.start <= to && (j.end === null || j.end >= from),
  );
}

/**
 * Verify the committed crosswalk against both sources and return justice_id ->
 * FJC record. Matching is last name PLUS service-window overlap — never last
 * name alone. Any miss, ambiguity or disagreement is fatal.
 */
export function resolveCrosswalk(
  entries: JusticeCrosswalkEntry[],
  spans: MqSpan[],
  fjc: FjcJustice[],
): Map<number, FjcJustice> {
  const byId = new Map<number, JusticeCrosswalkEntry>();
  for (const e of entries) {
    if (byId.has(e.justice_id)) throw new CourtDataError(`crosswalk: justice_id ${e.justice_id} listed twice`);
    byId.set(e.justice_id, e);
  }
  const nids = new Set<number>();
  const fjcByNid = new Map(fjc.map((j) => [j.nid, j]));
  const out = new Map<number, FjcJustice>();

  for (const span of spans) {
    const e = byId.get(span.justice_id);
    if (!e) {
      throw new CourtDataError(
        `crosswalk: no entry for MQ justice ${span.justice_id} "${span.scdb_name}" (terms ${span.first_term}-${span.last_term}). Add one to pipeline/transform/court-crosswalk.json.`,
      );
    }
    if (e.scdb_name !== span.scdb_name) {
      throw new CourtDataError(`crosswalk: justice_id ${e.justice_id} is "${span.scdb_name}" in MQ but "${e.scdb_name}" in the crosswalk`);
    }
    if (!normName(span.scdb_name.replace(/\d+$/, "")).endsWith(normName(e.last_name))) {
      throw new CourtDataError(`crosswalk: last_name "${e.last_name}" does not end MQ name code "${span.scdb_name}"`);
    }
    const cands = crosswalkCandidates(span, e.last_name, fjc);
    if (cands.length === 0) {
      throw new CourtDataError(
        `crosswalk: MQ justice ${span.justice_id} "${span.scdb_name}" (${span.first_term}-${span.last_term}) matches no FJC Supreme Court justice named "${e.last_name}" serving in those terms`,
      );
    }
    if (cands.length > 1) {
      throw new CourtDataError(
        `crosswalk: MQ justice ${span.justice_id} "${span.scdb_name}" is ambiguous — ${cands.length} FJC candidates named "${e.last_name}" overlap ${span.first_term}-${span.last_term}: nids ${cands.map((c) => c.nid).join(", ")}`,
      );
    }
    if (cands[0].nid !== e.fjc_nid) {
      throw new CourtDataError(
        `crosswalk: justice_id ${e.justice_id} "${span.scdb_name}" maps to FJC nid ${e.fjc_nid}, but last name + service overlap resolves to nid ${cands[0].nid}`,
      );
    }
    if (!fjcByNid.has(e.fjc_nid)) throw new CourtDataError(`crosswalk: FJC nid ${e.fjc_nid} not found`);
    if (nids.has(e.fjc_nid)) throw new CourtDataError(`crosswalk: FJC nid ${e.fjc_nid} claimed by two MQ justices`);
    nids.add(e.fjc_nid);
    out.set(span.justice_id, cands[0]);
  }
  for (const e of entries) {
    if (!spans.some((s) => s.justice_id === e.justice_id)) {
      throw new CourtDataError(`crosswalk: entry for justice_id ${e.justice_id} "${e.scdb_name}" has no MQ scores`);
    }
  }
  return out;
}

// --- justices.json --------------------------------------------------------

export function buildJustices(spans: MqSpan[], matched: Map<number, FjcJustice>): Justice[] {
  return spans.map((span) => {
    const j = matched.get(span.justice_id)!;
    // The appointment in effect at the first scored term: the latest one that
    // started by the end of that term (Stone -> Coolidge's 1925 Associate seat,
    // Hughes -> Hoover's 1930 Chief seat).
    const cutoff = termWindow(span.first_term)[1];
    const inEffect = j.appointments.filter((a) => a.start <= cutoff);
    const appt = inEffect[inEffect.length - 1];
    if (!appt) throw new CourtDataError(`justice ${span.justice_id} "${span.scdb_name}": no appointment in effect by ${cutoff}`);
    if (appt.party !== "Democratic" && appt.party !== "Republican") {
      throw new CourtDataError(`justice ${span.justice_id} "${span.scdb_name}": unexpected appointing party ${JSON.stringify(appt.party)} — extend the schema deliberately`);
    }
    if (j.birth_year === null) throw new CourtDataError(`justice ${span.justice_id} "${span.scdb_name}": FJC has no birth year`);
    const full = [j.first, j.middle, j.last].filter(Boolean).join(" ") + (j.suffix ? ` ${j.suffix}` : "");
    return {
      justice_id: span.justice_id,
      name: {
        first: j.first,
        ...(j.middle ? { middle: j.middle } : {}),
        last: j.last,
        ...(j.suffix ? { suffix: j.suffix } : {}),
        full,
      },
      birth_year: j.birth_year,
      death_year: j.death_year,
      appointing_president: appt.president,
      appointing_party: appt.party,
      nomination_date: appt.nomination,
      confirmation_date: appt.confirmation,
      service_start: j.start,
      service_end: j.end,
    };
  });
}

// --- Whole-dataset validation --------------------------------------------

/**
 * Terms where the Court ran other than 9 justices, all from mid-term turnover
 * (a departure and an arrival in the same October Term). Verified against the
 * data: each count below is what the MQ file has. A count that deviates from
 * 9 and is NOT listed here — or a listed term whose count changes — fails.
 */
export const EXPLAINED_TERM_COUNTS: Record<number, { count: number; reason: string }> = {
  1937: { count: 10, reason: "Black seated Oct 1937; Sutherland retired Jan 1938, Reed seated (MQ splits the term 1937a/1937b)" },
  1938: { count: 10, reason: "Brandeis retired Feb 1939, Douglas seated Apr 1939; Frankfurter seated Jan 1939 (split 1938a/1938b)" },
  1956: { count: 11, reason: "Minton retired Oct 1956 (Brennan seated); Reed retired Feb 1957 (Whittaker seated) (split 1956a/1956b)" },
  1958: { count: 10, reason: "Burton retired Oct 1958, Stewart seated (single MQ court record)" },
  1961: { count: 10, reason: "Whittaker retired Mar 1962, White seated (single MQ court record)" },
  1975: { count: 10, reason: "Douglas retired Nov 1975, Stevens seated (single MQ court record)" },
  2005: { count: 10, reason: "O'Connor's seat passed to Alito in Jan 2006 (split 2005a/2005b)" },
};

/** Sign tripwire: conservative > liberal, by justice_id and expected last name. */
const TRIPWIRE = [
  { hi: [108, "Thomas"], lo: [113, "Sotomayor"] },
  { hi: [105, "Scalia"], lo: [109, "Ginsburg"] },
] as const;

export interface CourtValidationInput {
  justices: Justice[];
  scores: MqScore[];
  courtTerms: CourtTermRow[];
  probabilities: CourtMedianProbability[];
}

export interface CourtValidationSummary {
  firstTerm: number;
  lastTerm: number;
  justicesPerTerm: Record<number, number>;
  explainedExceptions: { term: number; count: number; reason: string }[];
}

export function validateCourtData(
  d: CourtValidationInput,
  explained: Record<number, { count: number; reason: string }> = EXPLAINED_TERM_COUNTS,
): CourtValidationSummary {
  const fail = (m: string): never => {
    throw new CourtDataError(m);
  };
  const ids = new Set(d.justices.map((j) => j.justice_id));
  if (ids.size !== d.justices.length) fail("justices.json: duplicate justice_id");

  // (justice_id, term) unique + referential integrity
  const seen = new Set<string>();
  const scored = new Set<number>();
  for (const s of d.scores) {
    const k = `${s.justice_id}|${s.term}`;
    if (seen.has(k)) fail(`mq_scores: duplicate (justice ${s.justice_id}, term ${s.term})`);
    seen.add(k);
    if (!ids.has(s.justice_id)) fail(`mq_scores: justice_id ${s.justice_id} (term ${s.term}) is not in justices.json`);
    scored.add(s.justice_id);
  }
  for (const j of d.justices) if (!scored.has(j.justice_id)) fail(`justices.json: ${j.name.full} (${j.justice_id}) has no MQ score`);
  for (const p of d.probabilities) if (!ids.has(p.justice_id)) fail(`court_median_probabilities: unknown justice_id ${p.justice_id}`);
  for (const c of d.courtTerms) if (!ids.has(c.median_justice_id)) fail(`court_terms: term ${c.term} median justice ${c.median_justice_id} not in justices.json`);

  // Contiguous terms
  const terms = [...new Set(d.scores.map((s) => s.term))].sort((a, b) => a - b);
  const firstTerm = terms[0];
  const lastTerm = terms[terms.length - 1];
  if (firstTerm !== 1937) fail(`mq_scores: first term is ${firstTerm}, expected 1937`);
  for (let t = firstTerm; t <= lastTerm; t++) if (!terms.includes(t)) fail(`mq_scores: term ${t} is missing (terms must be contiguous ${firstTerm}-${lastTerm})`);
  const courtTermSet = new Set(d.courtTerms.map((c) => c.term));
  for (let t = firstTerm; t <= lastTerm; t++) if (!courtTermSet.has(t)) fail(`court_terms: no record for term ${t}`);
  for (const c of d.courtTerms) if (c.term > lastTerm) fail(`court_terms: term ${c.term} is beyond the last scored term ${lastTerm}`);

  // Segments: a term has either one unsegmented record or exactly an a + b pair
  for (const t of courtTermSet) {
    const segs = d.courtTerms.filter((c) => c.term === t).map((c) => c.segment ?? "");
    const ok = (segs.length === 1 && segs[0] === "") || (segs.length === 2 && segs.includes("a") && segs.includes("b"));
    if (!ok) fail(`court_terms: term ${t} has inconsistent segments [${segs.join(",")}]`);
  }

  // Justices per term
  const justicesPerTerm: Record<number, number> = {};
  for (const s of d.scores) justicesPerTerm[s.term] = (justicesPerTerm[s.term] ?? 0) + 1;
  const explainedExceptions: CourtValidationSummary["explainedExceptions"] = [];
  for (const t of terms) {
    const n = justicesPerTerm[t];
    const known = explained[t];
    if (known) {
      if (n !== known.count) fail(`term ${t}: ${n} justices, but the documented turnover count is ${known.count}`);
      explainedExceptions.push({ term: t, count: n, reason: known.reason });
    } else if (n !== 9) {
      fail(`term ${t}: ${n} justices (expected 9). Not a documented turnover term — investigate, then add to EXPLAINED_TERM_COUNTS only with a reason.`);
    }
  }
  for (const t of Object.keys(explained).map(Number)) {
    if (!terms.includes(t)) fail(`term ${t} is listed as an explained turnover term but absent from the data`);
  }

  // Sign-convention tripwire
  const byKey = new Map(d.scores.map((s) => [`${s.justice_id}|${s.term}`, s.mq_score]));
  const lastName = new Map(d.justices.map((j) => [j.justice_id, j.name.last]));
  for (const { hi, lo } of TRIPWIRE) {
    for (const [id, name] of [hi, lo]) {
      if (lastName.get(id) !== name) fail(`sign tripwire: justice_id ${id} is "${lastName.get(id)}", expected "${name}"`);
    }
    let compared = 0;
    for (const t of terms) {
      const a = byKey.get(`${hi[0]}|${t}`);
      const b = byKey.get(`${lo[0]}|${t}`);
      if (a === undefined || b === undefined) continue;
      compared++;
      if (!(a > b)) {
        fail(`SIGN CONVENTION FLIPPED? term ${t}: ${hi[1]} (${a}) is not greater than ${lo[1]} (${b}). Conservative must score higher than liberal.`);
      }
    }
    if (compared === 0) fail(`sign tripwire: ${hi[1]} and ${lo[1]} never overlap in the data`);
  }

  return { firstTerm, lastTerm, justicesPerTerm, explainedExceptions };
}
