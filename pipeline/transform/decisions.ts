import { parse as parseCsv } from "csv-parse/sync";
import {
  DECISIONS_FIRST_TERM,
  DISSENT_BUCKETS,
  DecisionsDataError,
  scdbCaseRow,
  type ChiefReferenceEntry,
  type ChiefSpan,
  type DecisionCaseRow,
  type DecisionCountRow,
  type DecisionsMeta,
  type IssueAreaCatalogEntry,
  type ScdbCaseRow,
} from "../../lib/decisions-entities";
import { versionLabel } from "../fetch/scdb-lib";

/**
 * Pure logic for the Decisions track (no file I/O; `decisions-run.ts` reads and writes). Unit of
 * analysis (docs/DECISIONS_METHODOLOGY.md): orally argued cases (SCDB decisionType 1 opinion,
 * 5 equally divided, 6 per curiam, 7 judgment) minus those whose vote split SCDB marks unclear.
 */

/** decisionType values that are orally argued decisions. */
export const ARGUED_DECISION_TYPES: readonly number[] = [1, 5, 6, 7];
const SUMMARY_TYPE = 2;
const DECREE_TYPE = 4;

export const DISSENT_KEYS = ["d0", "d1", "d2", "d3", "d4"] as const;

export function parseScdb(text: string): ScdbCaseRow[] {
  const raw = parseCsv(text, { columns: true, skip_empty_lines: true, bom: true }) as Record<string, string>[];
  const seen = new Set<string>();
  return raw.map((row, i) => {
    const parsed = scdbCaseRow.safeParse(row);
    if (!parsed.success) throw new DecisionsDataError(`SCDB row ${i + 2} fails the schema: ${parsed.error.message}\n${JSON.stringify(row).slice(0, 300)}`);
    if (seen.has(parsed.data.caseId)) throw new DecisionsDataError(`duplicate caseId ${parsed.data.caseId}`);
    seen.add(parsed.data.caseId);
    return parsed.data;
  });
}

export const isArgued = (r: ScdbCaseRow) => ARGUED_DECISION_TYPES.includes(r.decisionType);
export const inScope = (r: ScdbCaseRow) => isArgued(r) && r.voteUnclear !== 1;

/** Dissents clipped at 4: 0 unanimous ... 4 = 5-4 (and 4-4). */
export const dissentBucket = (minVotes: number) => Math.min(minVotes, DISSENT_BUCKETS - 1);

/** SCDB issueArea code -> catalog id. Unknown code fails the build; blank = null (unclassified). */
export function issueAreaId(code: number | null, catalog: readonly IssueAreaCatalogEntry[]): string | null {
  if (code === null) return null;
  const hit = catalog.find((a) => a.scdb_code === code);
  if (!hit) throw new DecisionsDataError(`unknown SCDB issueArea code ${code}; add it to pipeline/reference/decision-issue-areas.json`);
  return hit.id;
}

export interface Selection {
  cases: ScdbCaseRow[];
  exclusions: { summary_dispositions: number; decrees: number; unclear_votes: number };
}

export function selectCases(rows: readonly ScdbCaseRow[]): Selection {
  const cases = rows.filter(inScope);
  const known = new Set([...ARGUED_DECISION_TYPES, SUMMARY_TYPE, DECREE_TYPE]);
  const other = rows.find((r) => !known.has(r.decisionType));
  if (other) throw new DecisionsDataError(`unknown decisionType ${other.decisionType} (caseId ${other.caseId}); decide whether it is in scope in docs/DECISIONS_METHODOLOGY.md`);
  return {
    cases,
    exclusions: {
      summary_dispositions: rows.filter((r) => r.decisionType === SUMMARY_TYPE).length,
      decrees: rows.filter((r) => r.decisionType === DECREE_TYPE).length,
      unclear_votes: rows.filter((r) => isArgued(r) && r.voteUnclear === 1).length,
    },
  };
}

/** One row per (term, issue area) with at least one case, ordered by term then catalog order (null last). */
export function buildCounts(cases: readonly ScdbCaseRow[], catalog: readonly IssueAreaCatalogEntry[]): DecisionCountRow[] {
  const map = new Map<string, DecisionCountRow>();
  for (const c of cases) {
    const id = issueAreaId(c.issueArea, catalog);
    const key = `${c.term}|${id ?? ""}`;
    let row = map.get(key);
    if (!row) {
      row = { term: c.term, issue_area_id: id, n: 0, d0: 0, d1: 0, d2: 0, d3: 0, d4: 0 };
      map.set(key, row);
    }
    row.n += 1;
    row[DISSENT_KEYS[dissentBucket(c.minVotes)]] += 1;
  }
  const order = (id: string | null) => (id === null ? catalog.length : catalog.findIndex((a) => a.id === id));
  return [...map.values()].sort((a, b) => a.term - b.term || order(a.issue_area_id) - order(b.issue_area_id));
}

const SMALL_WORDS = new Set(["v.", "of", "the", "and", "for", "in", "on", "to", "a", "an", "at", "by", "ex", "rel.", "de", "la", "et", "al.", "al", "dba", "aka", "ux.", "etc.", "etc.,"]);
const KEEP_UPPER = new Set(["U.S.", "U.S.A.", "D.C.", "N.Y.", "II", "III", "IV", "NAACP", "IBM", "AFL-CIO", "UAW", "CIO", "AFL", "EEOC", "FDA", "EPA", "NLRB", "FCC", "FERC", "FTC", "SEC", "IRS", "INS", "HUD", "NCAA", "AT&T", "ACLU", "PGA", "NFL", "NBA", "ERISA", "OSHA", "USDA", "TVA", "RFC", "IRS.", "LLC", "LP", "LLP", "USA", "IAM", "NY", "NJ"]);

/** SCDB capitalises case names; make them readable. Imperfect for unusual acronyms (listed above) but never changes what a name says. */
export function prettyCaseName(input: string): string {
  // The file is latin-1, but a few newer names are UTF-8 inside it ("Women\u00e2\u0080\u0099s"): re-read those bytes as UTF-8.
  const fixed = /[\u00c2\u00c3\u00e2]/.test(input) ? Buffer.from(input, "latin1").toString("utf8") : input;
  const raw = fixed.includes("\ufffd") ? input : fixed;
  const words = raw.trim().replace(/\s+/g, " ").split(" ");
  return words
    .map((w, i) => {
      const upper = w.toUpperCase();
      if (KEEP_UPPER.has(upper)) return upper;
      const lower = w.toLowerCase();
      const bare = lower.replace(/[,;]+$/, "");
      if (i > 0 && SMALL_WORDS.has(bare)) return lower;
      if (lower === "v.") return "v.";
      if (/^[A-Z]\.?,?$/.test(w) || /^([A-Z]\.){2,}/.test(w)) return w; // initials and dotted acronyms: "J.", "U.S."
      return lower.replace(/(^|[-/(\u2013\u2019'&])([a-z\u00e0-\u00ff])/g, (m, pre: string, c: string, off: number) => (pre === "'" || pre === "\u2019" ? (off <= 1 ? pre + c.toUpperCase() : m) : pre + c.toUpperCase())).replace(/^Mc([a-z])/, (_m, c: string) => `Mc${c.toUpperCase()}`);
    })
    .join(" ");
}

const isoDate = (us: string): string => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(us.trim());
  if (!m) throw new DecisionsDataError(`unparseable dateDecision "${us}"`);
  return `${m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
};

/** One row per case in scope, oldest first (the page reverses it). */
export function buildCaseRows(cases: readonly ScdbCaseRow[], catalog: readonly IssueAreaCatalogEntry[]): DecisionCaseRow[] {
  return cases
    .map((c) => ({
      case_id: c.caseId,
      term: c.term,
      date: isoDate(c.dateDecision),
      name: prettyCaseName(c.caseName),
      cite: [c.usCite, c.sctCite, c.ledCite, c.lexisCite].map((x) => x.trim()).find((x) => x) ?? "",
      issue_area_id: issueAreaId(c.issueArea, catalog),
      band: dissentBucket(c.minVotes),
      maj: c.majVotes,
      min: c.minVotes,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.case_id.localeCompare(b.case_id));
}

/** Modal `chief` per term, merged into runs. Every run's chief must be in the reference and appear in one run only. */
export function buildChiefSpans(cases: readonly ScdbCaseRow[], reference: readonly ChiefReferenceEntry[]): ChiefSpan[] {
  const byTerm = new Map<number, Map<string, number>>();
  for (const c of cases) {
    if (!reference.some((r) => r.scdb_chief === c.chief)) {
      throw new DecisionsDataError(`unknown SCDB chief "${c.chief}" (term ${c.term}); add them to pipeline/reference/chief-justices.json`);
    }
    const t = byTerm.get(c.term) ?? new Map<string, number>();
    t.set(c.chief, (t.get(c.chief) ?? 0) + 1);
    byTerm.set(c.term, t);
  }
  const spans: ChiefSpan[] = [];
  for (const term of [...byTerm.keys()].sort((a, b) => a - b)) {
    const counts = [...byTerm.get(term)!.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const chief = counts[0]![0];
    const last = spans[spans.length - 1];
    if (last && last.scdb_chief === chief) {
      last.end_term = term;
      continue;
    }
    if (spans.some((s) => s.scdb_chief === chief)) throw new DecisionsDataError(`chief ${chief} holds two separate runs of terms`);
    const ref = reference.find((r) => r.scdb_chief === chief)!;
    spans.push({
      scdb_chief: ref.scdb_chief,
      name: ref.name,
      justice_id: ref.justice_id,
      start_term: term,
      end_term: term,
      appointing_president: ref.appointing_president,
      appointing_party: ref.appointing_party,
    });
  }
  return spans;
}

interface CourtJusticeLike {
  justice_id: number;
  chief_justice_appointment: { president: string; party: string } | null;
}

const presidentKey = (name: string) => {
  const parts = name.replace(/\./g, "").trim().toLowerCase().split(/\s+/);
  return `${parts[0]} ${parts[parts.length - 1]}`;
};

/**
 * Hand-maintained chief reference vs the Court track (justices.json) and the presidents table: same
 * justice, same appointing president as Chief, same party; and the president is a known one.
 */
export function checkChiefReference(
  reference: readonly ChiefReferenceEntry[],
  justices: readonly CourtJusticeLike[],
  presidents: readonly { president: string; party: string }[],
): void {
  for (const ref of reference) {
    const j = justices.find((x) => x.justice_id === ref.justice_id);
    if (!j?.chief_justice_appointment) throw new DecisionsDataError(`chief ${ref.scdb_chief}: justice_id ${ref.justice_id} is not a Chief Justice in court/justices.json`);
    const a = j.chief_justice_appointment;
    if (presidentKey(a.president) !== presidentKey(ref.appointing_president) || a.party !== ref.appointing_party) {
      throw new DecisionsDataError(`chief ${ref.scdb_chief}: reference says ${ref.appointing_president} (${ref.appointing_party}), court track says ${a.president} (${a.party})`);
    }
    if (!presidents.some((p) => presidentKey(p.president) === presidentKey(ref.appointing_president) && p.party === ref.appointing_party)) {
      throw new DecisionsDataError(`chief ${ref.scdb_chief}: ${ref.appointing_president} is not in the presidents table`);
    }
  }
}

export interface Recount {
  total: number;
  unclassified: number;
  byTerm: Map<number, number>;
  d4ByTerm: Map<number, number>;
  summary: number;
  decrees: number;
  unclear: number;
  rows: number;
}

/** Independent recount straight from the CSV text: positional columns, no schema, no shared helpers. */
export function recountFromCsv(text: string): Recount {
  const table = parseCsv(text, { columns: false, skip_empty_lines: true, bom: true }) as string[][];
  const header = table[0]!;
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new DecisionsDataError(`raw CSV has no ${name} column`);
    return i;
  };
  const [iType, iTerm, iMin, iUnclear, iArea] = ["decisionType", "term", "minVotes", "voteUnclear", "issueArea"].map(col) as [number, number, number, number, number];
  const out: Recount = { total: 0, unclassified: 0, byTerm: new Map(), d4ByTerm: new Map(), summary: 0, decrees: 0, unclear: 0, rows: table.length - 1 };
  for (const r of table.slice(1)) {
    const type = r[iType];
    if (type === "2") out.summary++;
    else if (type === "4") out.decrees++;
    else if (type === "1" || type === "5" || type === "6" || type === "7") {
      if (r[iUnclear] === "1") {
        out.unclear++;
        continue;
      }
      out.total++;
      if ((r[iArea] ?? "").trim() === "") out.unclassified++;
      const term = Number(r[iTerm]);
      out.byTerm.set(term, (out.byTerm.get(term) ?? 0) + 1);
      if (Number(r[iMin]) >= 4) out.d4ByTerm.set(term, (out.d4ByTerm.get(term) ?? 0) + 1);
    }
  }
  return out;
}

/** Stable anchors (decided cases rarely change). Release-specific totals are keyed by version. */
export const ANCHORS = { cases: { 1946: 142, 1972: 156 } as Record<number, number>, d4: { 2015: 4 } as Record<number, number> };
export const ANCHORS_BY_VERSION: Record<string, { total: number; cases: Record<number, number> }> = {
  "2026_01": { total: 8251, cases: { 2024: 61, 2025: 57 } },
};

export interface GateInput {
  version: string;
  counts: readonly DecisionCountRow[];
  caseRows?: readonly DecisionCaseRow[];
  meta: DecisionsMeta;
  recount: Recount;
}

/** Build-failing gates. Returns the results for the human report. */
export function runGates({ version, counts, caseRows, meta, recount }: GateInput): Record<string, number | string | boolean> {
  const fail = (m: string): never => {
    throw new DecisionsDataError(`gate failed: ${m}`);
  };
  const total = counts.reduce((s, r) => s + r.n, 0);
  if (total !== recount.total) fail(`output total ${total} != recount from raw CSV ${recount.total}`);
  if (meta.case_count !== total) fail(`meta case_count ${meta.case_count} != output total ${total}`);

  const perTerm = new Map<number, number>();
  const d4PerTerm = new Map<number, number>();
  for (const r of counts) {
    const dsum = r.d0 + r.d1 + r.d2 + r.d3 + r.d4;
    if (dsum !== r.n) fail(`term ${r.term} area ${r.issue_area_id}: buckets sum ${dsum} != n ${r.n} (a case must have exactly one bucket)`);
    perTerm.set(r.term, (perTerm.get(r.term) ?? 0) + dsum);
    d4PerTerm.set(r.term, (d4PerTerm.get(r.term) ?? 0) + r.d4);
  }
  for (let t = DECISIONS_FIRST_TERM; t <= meta.data_through_term; t++) {
    if (!perTerm.has(t)) fail(`no cases for term ${t} (terms must be gap-free ${DECISIONS_FIRST_TERM}-${meta.data_through_term})`);
    if (perTerm.get(t) !== (recount.byTerm.get(t) ?? 0)) fail(`term ${t}: buckets sum ${perTerm.get(t)} != recount ${recount.byTerm.get(t)}`);
    if ((d4PerTerm.get(t) ?? 0) !== (recount.d4ByTerm.get(t) ?? 0)) fail(`term ${t}: 5-4 count ${d4PerTerm.get(t)} != recount ${recount.d4ByTerm.get(t) ?? 0}`);
  }
  if ([...perTerm.keys()].some((t) => t < DECISIONS_FIRST_TERM || t > meta.data_through_term)) fail("output has a term outside the covered span");

  const unclassified = counts.filter((r) => r.issue_area_id === null).reduce((s, r) => s + r.n, 0);
  if (unclassified !== recount.unclassified || meta.unclassified_count !== unclassified) fail(`unclassified ${unclassified} (meta ${meta.unclassified_count}) != recount ${recount.unclassified}`);

  const ex = meta.exclusions;
  if (ex.unclear_votes !== recount.unclear || ex.summary_dispositions !== recount.summary || ex.decrees !== recount.decrees) {
    fail(`exclusions ${JSON.stringify(ex)} != recount ${JSON.stringify({ unclear: recount.unclear, summary: recount.summary, decrees: recount.decrees })}`);
  }
  if (total + ex.unclear_votes + ex.summary_dispositions + ex.decrees !== recount.rows) fail("cases + exclusions != raw row count");

  for (const [t, n] of Object.entries(ANCHORS.cases)) if (perTerm.get(Number(t)) !== n) fail(`anchor: term ${t} has ${perTerm.get(Number(t))} cases, expected ${n}`);
  for (const [t, n] of Object.entries(ANCHORS.d4)) if ((d4PerTerm.get(Number(t)) ?? 0) !== n) fail(`anchor: term ${t} has ${d4PerTerm.get(Number(t))} 5-4 cases, expected ${n}`);
  const byVersion = ANCHORS_BY_VERSION[version];
  if (byVersion) {
    if (total !== byVersion.total) fail(`anchor: release ${version} total ${total}, expected ${byVersion.total}`);
    for (const [t, n] of Object.entries(byVersion.cases)) if (perTerm.get(Number(t)) !== n) fail(`anchor: term ${t} has ${perTerm.get(Number(t))} cases, expected ${n}`);
  }

  if (caseRows) {
    // The list and the counts must be the same cases: aggregate the list and compare cell by cell.
    if (caseRows.length !== total) fail(`case list has ${caseRows.length} rows, counts total ${total}`);
    if (new Set(caseRows.map((r) => r.case_id)).size !== caseRows.length) fail("case list has a duplicate case_id");
    const agg = new Map<string, number[]>();
    for (const r of caseRows) {
      const k = `${r.term}|${r.issue_area_id ?? ""}`;
      const a = agg.get(k) ?? [0, 0, 0, 0, 0];
      a[r.band]! += 1;
      agg.set(k, a);
    }
    for (const r of counts) {
      const a = agg.get(`${r.term}|${r.issue_area_id ?? ""}`);
      if (!a || a.join() !== [r.d0, r.d1, r.d2, r.d3, r.d4].join()) fail(`case list disagrees with counts for term ${r.term} area ${r.issue_area_id}`);
    }
    if (agg.size !== counts.length) fail("case list has a (term, area) cell the counts lack");
  }

  const spans = meta.chief_spans;
  if (spans[0]!.start_term !== DECISIONS_FIRST_TERM || spans[spans.length - 1]!.end_term !== meta.data_through_term) fail("chief spans do not cover the first to last term");
  for (let i = 1; i < spans.length; i++) if (spans[i]!.start_term !== spans[i - 1]!.end_term + 1) fail("chief spans are not contiguous");

  return { cases: total, terms: perTerm.size, unclassified, rows_in_raw: recount.rows, anchors_checked: true };
}

export function buildMeta(args: {
  version: string;
  sourceFile: string;
  cases: readonly ScdbCaseRow[];
  selection: Selection;
  catalog: readonly IssueAreaCatalogEntry[];
  spans: ChiefSpan[];
}): DecisionsMeta {
  const { version, cases, selection, catalog, spans, sourceFile } = args;
  const [year, rel] = version.split("_");
  const terms = cases.map((c) => c.term);
  return {
    scdb_version: version,
    scdb_version_label: versionLabel(version),
    source_file: sourceFile,
    first_term: Math.min(...terms),
    data_through_term: Math.max(...terms),
    case_count: cases.length,
    exclusions: selection.exclusions,
    unclassified_count: cases.filter((c) => c.issueArea === null).length,
    citation: `Harold J. Spaeth, Lee Epstein, Andrew D. Martin, Jeffrey A. Segal, Theodore J. Ruger, Sara C. Benesh, and Michael J. Nelson. ${year} Supreme Court Database, Version ${year} Release ${rel}. URL: http://supremecourtdatabase.org`,
    license: "Creative Commons Attribution-NonCommercial 3.0 United States (CC BY-NC 3.0 US)",
    chief_spans: spans,
    issue_areas: catalog.map((a) => ({ id: a.id, label: a.label })),
  };
}
