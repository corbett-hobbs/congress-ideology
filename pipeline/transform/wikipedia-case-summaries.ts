import { z } from "zod";
import { DecisionsDataError } from "../../lib/decisions-entities";

/**
 * One sentence per matched case, taken from the opening of its Wikipedia article (`pipeline/raw/wikipedia-cases/leads.json`,
 * `pnpm fetch:wikipedia-case-leads`). Wikipedia opens a case article with "<Name>, <cite> (<year>), was a ... case in which
 * the Court held that ...": the name and the cite are already in the table row, so they are cut and what is left is the
 * context and the ruling in the article's own words. The rule, in order:
 *
 *   1. Look at the first three sentences of the lead for one that states a ruling (held, ruled, struck down, upheld, ...).
 *   2. Cut the "<Name>, <cite> (<year>)," head and the "was a ... case in which" scaffolding; a clause that starts with the
 *      verb ("held that ...") gets "The Court" put back in front.
 *   3. Keep it only if it reads as one finished sentence of at most `MAX_CHARS`: no footnote marks, no stray brackets, no
 *      tail cut off. Otherwise the case has no summary, and the table shows none rather than a mangled one.
 *
 * The text is Wikipedia's (CC BY-SA 4.0); the page links each case name to its article. Where no sentence passes, a sentence the
 * Claude API wrote from the same lead (`classify/case-summaries-auto.ts`, cached in `CASE_SUMMARIES_AI`) fills in; the report and the
 * page's Data notes keep the two apart. Pure; `decisions-run.ts` does the I/O.
 */
export const CASE_SUMMARIES_AI = "pipeline/classification/case_summaries.json";
export const MAX_CHARS = 300;
const MIN_CHARS = 40;

/** Words that mark a sentence as stating how the Court ruled. */
const RULING = /\b(held(?=\s+(?:that|unanimously|\d)\b|,)|(?:court|justices?|majority)\s+held(?!\s+(?:oral|re-?arg|arguments?|hearings?|a\s+(?:hearing|conference|session)|the\s+(?:hearing|oral|arguments?)))|holds|holding|ruled|rules|ruling|decided|found|finds|determined|concluded|declared|struck down|strikes down|upheld|upholds|reversed|affirmed|invalidated|overturned|overruled|vacated|remanded|dismissed|denied|sustained|unanimously|rejected|refused|approved|confirmed|limited|allowed|permitted|prohibited|barred|extended|expanded|narrowed)\b/i;

/** "a decision that individuals may not be held liable ...": a ruling stated as a noun clause, with no ruling verb. Counts as evidence for a model sentence only; the picker will not take it as a ruling on its own. */
const VERDICT_NOUN = /\b(?:decision|ruling|holding|opinion|judgment)\s+that\b/i;

/** Abbreviations whose full stop does not end a sentence. */
const ABBREV = /(?:\b(?:v|vs|no|nos|inc|co|corp|ltd|mr|mrs|ms|dr|st|ct|cir|jr|sr|al|stat|cong|amend|rel|dept|gov|[a-z])|\bU\.S|S\.Ct|L\.Ed)\.$/i;

/** Split a plain-text lead into sentences, leaving "v.", "U.S.", "Co." and initials alone. */
export function splitSentences(text: string): string[] {
  const flat = text.replace(/\s+/g, " ").trim();
  const out: string[] = [];
  let start = 0;
  const re = /[.!?]["”')\]]*\s+(?=["“(]?[A-Z0-9])/g;
  for (let m = re.exec(flat); m; m = re.exec(flat)) {
    const end = m.index + m[0].length;
    const head = flat.slice(start, m.index + 1);
    // "558 U.S. 100": a full stop after an abbreviation or a lone capital is not a sentence end.
    if (ABBREV.test(head.replace(/["”')\]]+$/, ""))) continue;
    out.push(flat.slice(start, end).trim());
    start = end;
  }
  if (start < flat.length) out.push(flat.slice(start).trim());
  return out;
}

/** "Name, 376 U.S. 254 (1964)," / "Name, No. 16-476, 584 U.S. 453 (2018) [138 S. Ct. 1461]," / "Name, 609 U.S. ___ (2026)," / "Name, 344 U.S. 392 (1953), (the MPAS case)". */
const CITE_HEAD = /^.{1,200}?,?\s*(?:No\.\s*[\w-]+,\s*)?\d+\s+U\.\s?S\.\s+(?:\d+|_+)\s*(?:\(\s*\d{4}\s*\))?\s*(?:\[[^\]]*\])?\s*,?\s*(?:\([^)]{1,40}\)\s*,?\s*)?/;
/** An article that prints no cite opens with the bare name: "Mattz v. Arnett was a ... case". */
const NAME_HEAD = /^[^.;:]{1,160}?\bv\.\s[^.;:]{1,120}?(?=\s+(?:is|was)\s+(?:a|an|the)\b)/;
const caseHead = (sentence: string): RegExpExecArray | null => CITE_HEAD.exec(sentence) ?? NAME_HEAD.exec(sentence);

/**
 * "was a landmark decision of the United States Supreme Court in which": a be-verb, then up to a noun for the case, then the
 * word that opens the clause that follows. Generic on purpose: the lead's wording varies far more than its shape.
 */
const SCAFFOLD = /^(?:is|was)\b[^.;:]{0,160}?\b(?:case|decision|ruling|opinion|judgment)\b[^.;:]{0,80}?\b(?:in which|where|wherein|whereby|by which|that|which|holding that|holding)\s+/i;
/** The subjects a stand-alone ruling sentence may start with (a later sentence has no head to cut, so its subject must be the Court). */
const COURT_SUBJECT = /^(?:the\s+(?:u\.?s\.?\s+|united states\s+)?(?:supreme\s+)?(?:court|justices|majority)\b|in a\s+(?:unanimous|\d)|by a\s+(?:unanimous|\d)|a\s+(?:unanimous|\d[–-]\d)|unanimously)/i;

const VERB_START = /^(?:held|holds|ruled|rules|decided|found|determined|concluded|declared|struck|upheld|reversed|affirmed|invalidated|overturned|overruled|vacated|remanded|dismissed|denied|sustained|rejected|refused|approved|confirmed|limited|allowed|permitted|prohibited|barred|extended|expanded|narrowed|stated|established|established that|clarified|recognized|interpreted|applied|considered)\b/i;

const sentenceCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Cut the "Name, cite (year), was a ... case in which" head, if the sentence has one, and stand the rest up as a sentence.
 * `headless` is true when the sentence had a head that came off cleanly (so its subject need not be the Court); a sentence
 * with a head that will not come off, or none, comes back unchanged for the caller to judge.
 */
export function stripHead(sentence: string): { text: string; cut: boolean } {
  const cite = caseHead(sentence);
  if (!cite) return { text: sentence, cut: false };
  const rest = sentence.slice(cite[0].length).trim();
  const scaffold = SCAFFOLD.exec(rest);
  // "reversed a lower court's decision that ..." has no scaffolding: the verb follows the cite directly.
  const body = (scaffold ? rest.slice(scaffold[0].length) : rest).trim();
  if (!scaffold && !VERB_START.test(body)) return { text: sentence, cut: false };
  // "a case holding that once a district ..." keeps its ruling word in the part we cut: put it back.
  if (scaffold && /holding(?:\s+that)?\s+$/i.test(scaffold[0])) return { text: `The Court held that ${body}`, cut: true };
  // "the court held ..." already has its subject; "held that ..." lost it with the scaffolding.
  if (VERB_START.test(body)) return { text: `The Court ${body}`, cut: true };
  return { text: sentenceCase(body), cut: true };
}

/** Does the text read as one finished sentence? */
function clean(s: string): string | null {
  let t = s
    .replace(/\[\d+\]|\[citation needed\]|\[[a-z]\]/gi, "")
    .replace(/\s*\((?:pdf|video)[^)]*\)/gi, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!/[.!?]["”)]?$/.test(t)) return null;
  t = t.replace(/\.{2,}$/, ".");
  if (t.length < MIN_CHARS || t.length > MAX_CHARS) return null;
  if (/[[\]{}<>|]|\b\d+\s+U\.S\.\s+_+/.test(t)) return null; // markup or a bare unfinished cite left in
  if ((t.match(/\(/g) ?? []).length !== (t.match(/\)/g) ?? []).length) return null;
  if ((t.match(/["“”]/g) ?? []).length % 2 === 1) return null;
  if (!/^[A-Z“"']/.test(t)) return null;
  return t;
}

/**
 * The one-sentence summary of a case from its article's lead, or null when no clean sentence states a ruling.
 * `sentence` records which of the first three it came from, for the build report. A lead whose first sentence is not a case
 * citation is not a case article (a redirect into a term list or a section of a larger article) and gets none.
 */
export function summarizeLead(lead: string): { text: string; sentence: 1 | 2 | 3 } | null {
  const sentences = splitSentences(lead).slice(0, 3);
  if (!sentences[0] || !caseHead(sentences[0])) return null;
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i]!;
    if (!RULING.test(s)) continue;
    const { text: stripped, cut } = stripHead(s.replace(/^It\s+(?=(?:held|ruled|decided|struck|reversed|affirmed|upheld|overturned|overruled|vacated|remanded|found|concluded|declared|rejected|unanimously)\b)/i, "The Court "));
    const text = clean(stripped);
    if (!text || !RULING.test(text)) continue;
    if (!cut && !COURT_SUBJECT.test(text)) continue;
    if (/\b(?:such|these|those|this|also|the case)\b/i.test(text) && !cut) continue; // points back at a sentence we are not showing
    if (/\b(?:held|ruled|found|decided|concluded)\s+in\s+[A-Z][^,.]{0,60}?\sv\.\s/.test(text) && !cut) continue; // "held in Batson v. Kentucky that ...": that case's holding, not this one's
    return { text, sentence: (i + 1) as 1 | 2 | 3 };
  }
  return null;
}

/** One cached answer of the model for an article: its sentence, or null when the lead does not say how the Court ruled. */
export const aiSummaryCache = z.array(z.strictObject({ title: z.string().min(1), summary: z.string().nullable(), model: z.string().min(1) }));
export type AiSummaryEntry = z.infer<typeof aiSummaryCache>[number];

const norm = (s: string): string => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
const words = (s: string): string[] => norm(s).match(/[a-z0-9]{4,}/g) ?? [];

/**
 * A model-written sentence is usable only if it is one finished line of 40-300 characters AND is held to the lead it was written
 * from: `evidence` (the words the model says state the ruling) is a verbatim stretch of the lead that itself names a ruling, and
 * most of the sentence's own words, and every number in it, appear in the lead. The model is asked to write only from the text; this is what stops it
 * writing a ruling from memory (an early trial had it state the opposite of what the Court held where the lead gave no ruling).
 */
export function checkAiSummary(sentence: string, evidence: string, lead: string): boolean {
  if (sentence.length < MIN_CHARS || sentence.length > MAX_CHARS || /[\n\r]/.test(sentence) || !/[.!?]["”)]?$/.test(sentence) || splitSentences(sentence).length !== 1) return false;
  const e = norm(evidence);
  if (e.length < 25 || !norm(lead).includes(e) || !(RULING.test(evidence) || VERDICT_NOUN.test(evidence))) return false;
  // A number the lead does not contain is a misread or an invention (an early answer wrote "2981" for 1981).
  const leadText = norm(lead);
  if ((sentence.match(/\d[\d,.]*/g) ?? []).some((n) => !leadText.includes(n.replace(/[.,]+$/, "")))) return false;
  const have = new Set(words(lead));
  const mine = words(sentence);
  return mine.length > 0 && mine.filter((w) => have.has(w)).length / mine.length >= 0.7;
}

export interface CaseSummaryRow {
  case_id: string;
  summary: string;
  /** "wikipedia" = the article's own sentence, trimmed; "claude" = written by the model from the article's lead. */
  via: "wikipedia" | "claude";
}

export interface CaseSummariesReport {
  articles: number;
  with_lead: number;
  summarized: number;
  /** Of `summarized`, articles whose sentence the model wrote. */
  claude: number;
  from_sentence: Record<"1" | "2" | "3", number>;
  /** Matched cases whose article has no summary (no lead, or no clean ruling sentence). */
  without: number;
}

/** Join matched cases to their article's sentence. Several cases can share one article (companion cases); each gets the same sentence. */
export function buildCaseSummaries(matched: readonly { case_id: string; title: string }[], leads: Readonly<Record<string, string>>, ai: ReadonlyMap<string, string | null> = new Map()): { rows: CaseSummaryRow[]; report: CaseSummariesReport } {
  const byTitle = new Map<string, { text: string; sentence: 1 | 2 | 3 | 0 } | null>();
  const report: CaseSummariesReport = { articles: 0, with_lead: 0, summarized: 0, claude: 0, from_sentence: { "1": 0, "2": 0, "3": 0 }, without: 0 };
  for (const m of matched) {
    if (byTitle.has(m.title)) continue;
    report.articles++;
    const lead = leads[m.title];
    if (lead) report.with_lead++;
    const picked = lead ? summarizeLead(lead) : null;
    const written = ai.get(m.title);
    byTitle.set(m.title, picked ?? (written ? { text: written, sentence: 0 } : null));
  }
  const rows: CaseSummaryRow[] = [];
  for (const m of matched) {
    const s = byTitle.get(m.title);
    if (s) rows.push({ case_id: m.case_id, summary: s.text, via: s.sentence === 0 ? "claude" : "wikipedia" });
    else report.without++;
  }
  for (const s of byTitle.values()) {
    if (!s) continue;
    report.summarized++;
    if (s.sentence === 0) report.claude++;
    else report.from_sentence[String(s.sentence) as "1" | "2" | "3"]++;
  }
  return { rows, report };
}

/** Build-failing checks: one row per case, every summary is real text of a sane length, and the yield has not collapsed. */
export function checkCaseSummaries(rows: readonly CaseSummaryRow[], matchedCount: number, caseIds: ReadonlySet<string>): void {
  const fail = (m: string): never => {
    throw new DecisionsDataError(`wikipedia case summaries gate failed: ${m}`);
  };
  if (new Set(rows.map((r) => r.case_id)).size !== rows.length) fail("a case appears twice");
  for (const r of rows) {
    if (!caseIds.has(r.case_id)) fail(`unknown case ${r.case_id}`);
    if (r.summary.length < MIN_CHARS || r.summary.length > MAX_CHARS) fail(`summary length out of range for ${r.case_id}`);
  }
  // Most matched articles open with a ruling; a collapse means the lead format or the parser changed.
  if (rows.length < matchedCount * 0.5) fail(`only ${rows.length} of ${matchedCount} matched cases have a summary`);
}
