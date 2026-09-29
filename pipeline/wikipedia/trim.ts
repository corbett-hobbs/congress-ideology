/**
 * Trimming for Wikipedia lead-paragraph extracts. This is the ONE place text is
 * shortened — trim only, never rewritten: the output is always a leading run of
 * whole sentences of the original.
 */

/** Keep at most this many sentences… */
export const MAX_SENTENCES = 2;
/** …and, when more than one, at most about this many characters. */
export const MAX_CHARS = 320;
/** A trimmed extract shorter than this is flagged for human review. */
export const MIN_CHARS = 80;

/**
 * Words that end in a period without ending the sentence. Compared
 * case-insensitively, without the trailing period. Covers titles and honorifics,
 * suffixes, US state abbreviations as written in "D-Calif." style party tags
 * and AP style, and a few common business/citation abbreviations.
 */
const ABBREVIATIONS = new Set([
  // titles / honorifics / ranks
  "mr", "mrs", "ms", "mx", "dr", "prof", "hon", "rev", "fr", "sr", "jr",
  "gov", "sen", "rep", "pres", "lt", "col", "gen", "maj", "capt", "cpl",
  "sgt", "adm", "cmdr", "cdr", "brig", "supt", "atty",
  // places / misc
  "st", "mt", "ft", "vs", "inc", "ltd", "co", "corp", "dept", "univ",
  "assn", "bros", "approx", "est", "vol", "ave", "blvd",
  // state abbreviations (AP style)
  "ala", "ariz", "ark", "calif", "colo", "conn", "fla", "ga", "ill", "ind",
  "kan", "ky", "la", "md", "mass", "mich", "minn", "miss", "mo", "mont",
  "neb", "nev", "okla", "ore", "pa", "penn", "tenn", "tex", "va", "vt",
  "wash", "wis", "wyo",
]);

/** The token (run of non-space characters) that ends right before `end`. */
function tokenBefore(text: string, end: number): string {
  let start = end;
  while (start > 0 && !/\s/.test(text[start - 1])) start--;
  return text.slice(start, end);
}

/**
 * Does the period at `idx` (followed by whitespace, then something that starts
 * a sentence) actually end a sentence?
 */
function isSentenceEnd(text: string, idx: number): boolean {
  const mark = text[idx];
  // Look past closing quotes/brackets: `... said." Next` / `(born 1950.) Next`.
  let j = idx + 1;
  while (j < text.length && /["'”’)\]]/.test(text[j])) j++;
  if (j >= text.length) return true; // end of text
  if (!/\s/.test(text[j])) return false; // "3.5", "Ph.D", "U.S.A"
  let k = j;
  while (k < text.length && /\s/.test(text[k])) k++;
  if (k >= text.length) return true;
  // The next sentence must start like one.
  if (!/["'“‘(\[A-Z0-9]/.test(text[k])) return false;
  if (mark !== ".") return true; // ! and ? are unambiguous

  // Token ending at the period, stripped of leading punctuation: `(U.S`, `D-Calif`.
  const raw = tokenBefore(text, idx).replace(/^["'“‘(\[]+/, "");
  const word = raw.includes("-") ? raw.slice(raw.lastIndexOf("-") + 1) : raw;
  if (ABBREVIATIONS.has(word.toLowerCase())) return false;
  // "No. 5" is an abbreviation, but "He said no. Then" is a sentence end.
  if (word === "No" && /\d/.test(text[k])) return false;
  // A lone capital is an initial ("Steny H. Hoyer"); dotted runs are acronyms
  // ("U.S.", "N.Y.", "D.C.").
  if (/^[A-Z]$/.test(word)) return false;
  if (/^([A-Za-z]\.)+[A-Za-z]$/.test(word)) return false;
  return true;
}

/** Split into sentences, each keeping its terminal punctuation. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (!/[.!?]/.test(text[i])) continue;
    if (!isSentenceEnd(text, i)) continue;
    let end = i + 1;
    while (end < text.length && /["'”’)\]]/.test(text[end])) end++;
    out.push(text.slice(start, end).trim());
    start = end;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

/**
 * Trim a Wikipedia extract for the profile header: the first two sentences,
 * capped at ~320 characters on a sentence boundary. If two sentences overflow
 * the cap, keep one; if the first sentence alone overflows, keep it whole (the
 * header's CSS line-clamp handles that case).
 */
export function trimExtract(
  extract: string,
  { maxSentences = MAX_SENTENCES, maxChars = MAX_CHARS } = {},
): string {
  const sentences = splitSentences(extract.replace(/\s+/g, " ").trim());
  if (sentences.length === 0) return "";
  let keep = Math.min(maxSentences, sentences.length);
  while (keep > 1 && sentences.slice(0, keep).join(" ").length > maxChars) keep--;
  return sentences.slice(0, keep).join(" ");
}

/**
 * Heuristic for a wrong-person / wrong-page match: too short to be a real
 * lead, or never mentions the legislature.
 */
export function needsReview(trimmed: string): boolean {
  return (
    trimmed.length < MIN_CHARS ||
    !/congress|senat|representative/i.test(trimmed)
  );
}
