/**
 * One finished sentence of the Congressional Research Service's summary of a law, or nothing. Never model-written: the sentence is the
 * summary's own first sentence with the name and the stage notes cut off, kept only if it reads as a whole sentence of 40-300 characters.
 * (A law whose summary starts with a table of contents, or whose first sentence is cut short by an abbreviation we do not know, has no
 * sentence rather than a mangled one.) The summaries come in three styles: the 1970s-90s "Act name - Amends ..." with a "(Measure passed
 * House, amended)" stage note in front; the 2000s "(This measure has not been amended since ...) Amends ..."; and from the 2010s
 * "<strong>Title</strong> This act designates ...".
 */
export const SUMMARY_MIN = 40;
export const SUMMARY_MAX = 300;

export const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", sect: "§" };
export const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m);

/** The summary's HTML as plain text: paragraphs and list items become spaces; a leading bold paragraph (the law's name) is dropped. */
export function summaryText(html: string): string {
  let h = html.trim();
  h = h.replace(/^\s*<p>\s*<strong>[\s\S]*?<\/strong>\s*<\/p>/i, " ");
  h = h.replace(/^\s*<strong>[\s\S]*?<\/strong>/i, " ");
  h = h.replace(/<\/(p|li|div|ul|ol|h\d)>|<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ");
  return decode(h).replace(/\s+/g, " ").trim();
}

/** Remove the balanced "(...)" at the start of `s`, or return null if it does not start with one. */
function stripLeadingGroup(s: string): { inner: string; rest: string } | null {
  if (!s.startsWith("(")) return null;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")" && --depth === 0) return { inner: s.slice(1, i), rest: s.slice(i + 1).trimStart() };
  }
  return null;
}

/** A parenthesis that is a note about the summary or its stage, not part of what the law does. */
const STAGE_NOTE = /^(?:house|senate|public law|conference|conferees|measure|this measure|latest summary|reported|passed|conference|introduced|amended|as (?:reported|passed|introduced)|resolution|the measure|summary|sec\.?|secs\.?|section|title|division|note)\b/i;

const ABBREV = new Set(
  "u.s u.s.c sec secs no nos h.r s h.j.res s.j.res h.con.res s.con.res h.res s.res d.c mr mrs ms dr st jr sr inc co corp ltd dept gov gen sen rep reps e.g i.e vs v p.l pub stat fed reg cong ch art div tit subch subsec para pt vol cf et al approx est fy no.".split(" "),
);

/** Sentences of `text`, split at . ! ? followed by a capital, a digit or a quote, except after a known abbreviation or an initial. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  const re = /[.!?]["”')\]]*\s+(?=["“(‘]?[A-Z0-9])/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const head = text.slice(start, m.index + 1);
    const lastTok = head.replace(/["”')\]]+$/, "").split(/\s+/).pop()!.replace(/^["“(‘]+/, "").toLowerCase().replace(/\.$/, "");
    if (m[0][0] === "." && (ABBREV.has(lastTok) || /^[a-z]$/.test(lastTok) || /^(?:[a-z]\.)+[a-z]?$/.test(lastTok) || /^\d+$/.test(lastTok) && /\b(?:no|sec|secs|nos)\.?\s*\d+$/i.test(head))) continue;
    out.push(head.trim());
    start = m.index + m[0].length;
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

const VERB_HEAD = /^(?:Amends|Authorizes|Directs|Provides|Establishes|Requires|Designates|Extends|Declares|Makes|Appropriates|Repeals|Increases|Reduces|Prohibits|Permits|Allows|Revises|Modifies|Creates|Grants|Exempts|Renames|Names|Recognizes|Expresses|Approves|Ratifies|Waives|Terminates|Transfers|Conveys|Sets|States|Urges|Changes|Limits|Eliminates|Authorizing)\b/;
/** A name or topic that stands in front of the first provision: short, no sentence end, and not itself a provision. */
const looksLikeHead = (h: string, next: string) => {
  // Initials and abbreviations inside a name ("Susan B. Anthony", "R.M.S. Titanic", "D.C.") are not sentence ends.
  const bare = h.replace(/\b[A-Z]\.(?=\s|[A-Z]\.)/g, "").replace(/\b(?:[A-Z]\.){2,}/g, "").replace(/\b(?:Jr|Sr|No|Nos|St|Inc|Co|Corp|Ltd|Mr|Mrs|Dr|U\.S|Sec)\./g, "");
  const heading = /^\(Sec/i.test(next);
  return h.length <= 130 && !/[.!?]/.test(heading ? bare.replace(/;/g, "") : bare) && !(!heading && /;/.test(bare)) && /^[A-Z0-9"(]/.test(h) && !VERB_HEAD.test(h) && !/:\s*\(1\)/.test(h);
};

/** The law's name at the head of an old summary ("American University Incorporation Amendments Act of 1990 - Amends Federal law ..."). */
function cutNameHead(text: string): string {
  let s = text;
  for (let i = 0; i < 4; i++) {
    const before = s;
    // "=Title I: Community Mental Health Centers Extension= - ..." and "=Title I:= ..." markers
    s = s.replace(/^=[^=]{1,200}=\s*-?\s*/, "").trim();
    // "Subtitle A - Tax Reductions - Amends ..." and "Title I: Energy Research - Authorizes ..."
    s = s.replace(/^(?:Subtitle|Title|Part|Division|Chapter) [A-Z0-9]+\s*[-:]\s*(?:[^-:]{1,100}?\s-\s+|-\s+)?(?=[A-Z])/, "").trim();
    const m = /^(.{3,130}?)\s+-\s+(?=[A-Z(=0-9])/.exec(s);
    if (m && looksLikeHead(m[1]!, s.slice(m[0].length))) s = s.slice(m[0].length).trim();
    if (s === before) break;
  }
  // A summary that opens with its first title and then the provision: "Title I: Military Personnel - Appropriates funds ..."
  s = s.replace(/^Title [IVXLC\d]+:\s*(?:[^-:]{1,100}?\s-\s+|-\s+)?(?=[A-Z])/, "");
  // The name run straight into the sentence without a bold tag: "Major Medical Facility Authorization Act of 2020 This bill authorizes ..."
  s = s.replace(/^[A-Z0-9][^.]{2,120}?\b(?:Act|Resolution)(?: of \d{4})?\s+(?=This (?:bill|act|resolution|joint resolution)\b)/, "");
  return s;
}

/** "This act designates ..." -> "Designates ...". Left alone when the next word is not a verb in the present tense. */
function cutThisHead(s: string): string {
  const m = /^This (?:bill|act|resolution|joint resolution|concurrent resolution|measure|law|amendment)\s+(?=[a-z])/.exec(s);
  if (!m) return s;
  const rest = s.slice(m[0].length);
  if (!/^(?:also\s+)?[a-z]+(?:s|es)\b/.test(rest) || /^(?:would|will|shall|should|is|was|has|had|does|may|can|could|must)\b/.test(rest)) return s;
  const r = rest.replace(/^also\s+/, "");
  return r[0]!.toUpperCase() + r.slice(1);
}

export interface SummaryOutcome {
  sentence: string | null;
  /** Why there is none, for the report. */
  why?: "empty" | "table-of-contents" | "no-sentence" | "too-short" | "too-long" | "unfinished";
}

export function firstSentence(html: string | null): SummaryOutcome {
  if (!html || html.trim() === "") return { sentence: null, why: "empty" };
  let t = summaryText(html);
  for (let guard = 0; guard < 6; guard++) {
    const g = stripLeadingGroup(t);
    if (!g || !STAGE_NOTE.test(g.inner.trim())) break;
    t = g.rest;
  }
  if (t === "") return { sentence: null, why: "empty" };
  if (/^TABLE OF CONTENTS/i.test(t)) return { sentence: null, why: "table-of-contents" };
  t = cutNameHead(t);
  // A bare "(Sec. 101)" marker in front of the first provision.
  t = t.replace(/^\((?:Sec|Secs|Section)\.?\s[^)]{0,30}\)\s*/i, "");
  t = cutThisHead(t);
  const first = splitSentences(t)[0];
  if (!first) return { sentence: null, why: "no-sentence" };
  if (first.length < SUMMARY_MIN) return { sentence: null, why: "too-short" };
  if (first.length > SUMMARY_MAX) return { sentence: null, why: "too-long" };
  const opens = (first.match(/\(/g) ?? []).length;
  const closes = (first.match(/\)/g) ?? []).length;
  if (opens !== closes || !/[.!?]["”')\]]*$/.test(first) || !/^["“‘(]?[A-Z0-9]/.test(first)) return { sentence: null, why: "unfinished" };
  return { sentence: first };
}
