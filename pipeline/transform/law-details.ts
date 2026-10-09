import { LAW_ACTION_TYPES, type LawAction, type LawActionVote, type LawDetail } from "../../lib/law-details-entities";
import type { RawAction, RawLaw } from "../../lib/laws-entities";
import { decode } from "./laws-summary";

/**
 * Law-details transform logic (pure): the CRS summary as paragraphs and the action list, one record per law.
 * Nothing here invents text: paragraphs are the summary's own, cut at the markup, and an action keeps its own wording
 * minus the Congressional Record page references in trailing brackets. See `docs/LAWS_METHODOLOGY.md` ("Law pages").
 */

/** The fetchers keep at most this many characters of a summary's HTML (`SUMMARY_CAP` in `pipeline/fetch/laws-raw.ts`). */
export const RAW_SUMMARY_CAP = 3000;

/** A raw summary at the cap was cut by the fetcher, not by CRS. */
export const summaryWasCut = (html: string): boolean => html.length >= RAW_SUMMARY_CAP;

/** A paragraph that is only a stage note, "(LATEST SUMMARY)" or "(Measure passed House, amended)": not part of what the law does. */
const STAGE_NOTE_ONLY = /^\((?:latest summary|(?:this )?measure [^()]*|conference report[^()]*|reported[^()]*|passed[^()]*|introduced[^()]*)\)$/i;

/**
 * Plain paragraphs of a CRS summary: block tags become breaks, other tags are dropped, entities decoded, whitespace
 * collapsed. A leading all-bold paragraph (the law's name, which the page already shows) is dropped. When the fetcher cut
 * the summary, the last paragraph is trimmed back to its last finished sentence so it never ends mid-word.
 */
export function summaryParagraphs(html: string): { paragraphs: string[]; cut: boolean } {
  const cut = summaryWasCut(html);
  let h = html.replace(/^\s*<p>\s*<strong>[\s\S]*?<\/strong>\s*<\/p>/i, " ").replace(/^\s*<strong>[\s\S]*?<\/strong>/i, " ");
  h = h.replace(/<(?:\/?(?:p|div|ul|ol|h\d)|br\s*\/?)>/gi, "\u0001").replace(/<li>/gi, "\u0001• ").replace(/<\/li>/gi, "\u0001");
  h = h.replace(/<[^>]+>/g, "");
  const paragraphs = decode(h)
    .split("\u0001")
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0 && p !== "\u2022" && !STAGE_NOTE_ONLY.test(p));
  const untrimmed = [...paragraphs];
  // Cut by the fetcher: end on a finished sentence, dropping a trailing fragment or heading ("Subtitle E: Other Matters") with it.
  while (cut && paragraphs.length > 0) {
    const last = paragraphs[paragraphs.length - 1]!;
    if (/[.!?]["”')\]]*$/.test(last)) break;
    const end = Math.max(...[". ", "? ", "! "].map((x) => last.lastIndexOf(x)));
    if (end > 0) {
      paragraphs[paragraphs.length - 1] = last.slice(0, end + 1);
      break;
    }
    paragraphs.pop();
  }
  // A summary that opens with a long table of contents has no finished sentence in its first 3,000 characters: show what there is.
  return { paragraphs: paragraphs.length > 0 ? paragraphs : untrimmed, cut };
}

const PREFIX = /^Passed\/agreed to in (?:the )?(?:House|Senate):\s*/i;
/** Trailing Congressional Record references: "(consideration: CR S6003; text: CR S6003)", "(text of conference report: CR H1)". */
const CR_REFS = /\s*\((?:consideration|text)[^():]*:[^)]*\)\s*$/i;

/** An action's wording as the page shows it: the Library of Congress "Passed/agreed to in House:" prefix and the record references cut. */
export function cleanActionText(text: string): string {
  let t = text.trim().replace(PREFIX, "");
  for (let i = 0; i < 3 && CR_REFS.test(t); i++) t = t.replace(CR_REFS, "");
  return t.trim();
}

const TYPE_CODE = new Map<string, number>(LAW_ACTION_TYPES.map((t, i) => [t, i]));
const CHAMBER_CODE = { House: 0, Senate: 1 } as const;

/**
 * The action list, oldest first. The source lists many actions twice (the House or Senate's own entry and the Library of
 * Congress copy that starts "Passed/agreed to in House:", or a President and a BecameLaw entry with the same text): two
 * actions on the same date with the same cleaned text are one, keeping the first type seen and merging their roll calls.
 */
export function buildActions(actions: readonly RawAction[]): LawAction[] {
  const out = new Map<string, { date: string; type: number; text: string; votes: LawActionVote[] }>();
  for (const a of actions) {
    const text = cleanActionText(a.text);
    if (!text) continue;
    const key = `${a.date}|${text}`;
    const cur = out.get(key) ?? { date: a.date, type: TYPE_CODE.get(a.type) ?? LAW_ACTION_TYPES.indexOf("NotUsed"), text, votes: [] };
    for (const v of a.votes ?? []) {
      const t: LawActionVote = [CHAMBER_CODE[v.chamber], v.roll, v.session];
      if (!cur.votes.some((x) => x[0] === t[0] && x[1] === t[1])) cur.votes.push(t);
    }
    out.set(key, cur);
  }
  return [...out.values()]
    .map((a, i) => ({ a, i }))
    .sort((x, y) => x.a.date.localeCompare(y.a.date) || x.i - y.i)
    .map(({ a }): LawAction => (a.votes.length > 0 ? [a.date, a.type, a.text, a.votes] : [a.date, a.type, a.text]));
}

export function buildLawDetail(law: RawLaw): LawDetail {
  const s = law.summary_html ? summaryParagraphs(law.summary_html) : null;
  const has = s !== null && s.paragraphs.length > 0;
  return { summary: has ? s.paragraphs : null, ...(has && s.cut ? { cut: true as const } : {}), actions: buildActions(law.actions) };
}

/** The gate: the shards' law ids equal `laws.json`'s exactly. Returns the differences (empty = pass). */
export function lawIdDifferences(shardIds: readonly string[], lawIds: readonly string[]): { missing: string[]; extra: string[] } {
  const have = new Set(shardIds);
  const want = new Set(lawIds);
  return { missing: lawIds.filter((id) => !have.has(id)), extra: shardIds.filter((id) => !want.has(id)) };
}
