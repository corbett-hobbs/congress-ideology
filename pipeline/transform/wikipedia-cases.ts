import { DecisionsDataError, type ScdbCaseRow } from "../../lib/decisions-entities";
import type { WikiCaseEntry } from "../fetch/wikipedia-cases-lib";

/**
 * Which Wikipedia article is each Decisions-page case? Joins SCDB rows to Wikipedia's volume and term lists
 * (`pipeline/raw/wikipedia-cases/`, `pnpm fetch:wikipedia-cases`) in rungs, most certain first; a case takes the first rung
 * that gives exactly one article:
 *
 *   1. `us_cite`   the U.S. Reports volume and page (a cite is one case, so the article is certain; names only veto a
 *                  clash such as a companion case sharing a page).
 *   2. `docket`    the volume and docket number, for the newer volumes whose lists print dockets, not pages.
 *      With no U.S. cite at all (the newest decisions: SCDB prints only an S. Ct. or L. Ed. cite until the volume is paged),
 *      the docket number alone, in the decision year (give or take one), pins the case; the names only veto.
 *   3. `name_year` the case name (parties, normalised) and the year, from a list entry with no usable cite: a decision too
 *                  new for a page number ("609 U.S. ___"), or an old list that prints no cite. Needs exactly one candidate.
 *
 * A name alone is never enough; a rung that finds two different articles for one case drops it into the report instead of
 * guessing. A list entry that is a red link (no article) is a miss, not a link. Pure logic; `decisions-run.ts` does the I/O.
 */
export type WikiVia = "us_cite" | "docket" | "name_year";
export interface WikiCaseRow {
  case_id: string;
  title: string;
  via: WikiVia;
}

// --------------------------------------------------------------------------- names

const STOP = new Set(["the", "of", "v", "vs", "et", "al", "inc", "no", "a", "an", "in", "for", "and", "on", "ex", "rel", "etc", "ux", "vir", "dba", "aka", "doing", "business", "as", "america", "state", "states"]);
/** Abbreviations and spellings that differ between SCDB's old reporter style and Wikipedia's titles. */
const CANON: Record<string, string> = {
  co: "company", corp: "corporation", assn: "association", dept: "department", comm: "commission", commn: "commission", commr: "commissioner", commrs: "commissioners", bros: "brothers",
  ry: "railway", rwy: "railway", ins: "insurance", mfg: "manufacturing", bd: "board", natl: "national", intl: "international", fed: "federal", govt: "government", ed: "education", educ: "education", sch: "school", dist: "district", cnty: "county", twp: "township", mgmt: "management", elec: "electric", lab: "laboratories", labs: "laboratories", rr: "railroad", ctr: "center", centre: "center", sec: "securities", fcc: "federal", ft: "fort", mt: "mount", st: "saint",
};
const stem = (w: string): string => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const tokens = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/,?\s+doing business as.*$/i, " ")
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/\bu\.\s?s\.(?:\s?a\.)?/g, " united ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => stem(CANON[w] ?? w))
    .filter((w) => !STOP.has(w));

/** The first significant word on each side of the "v.", e.g. "pung|isabella". Null when the name has no "v.". */
export function sideKey(name: string): string | null {
  const sides = name.replace(/\(.*?\)/g, " ").split(/\s+v\.?\s+/i);
  if (sides.length < 2) return null;
  const a = tokens(sides[0]!)[0];
  const b = tokens(sides[1]!)[0];
  return a && b ? `${a}|${b}` : null;
}

/** Share of the shorter name's words the other contains (0..1). */
export function overlap(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let hit = 0;
  for (const w of ta) if (tb.has(w)) hit++;
  return hit / Math.min(ta.size, tb.size);
}

/** Do two names plausibly name the same case? Same first words either side of the "v.", or most words shared. */
const sameCase = (a: string, b: string, threshold: number): boolean => {
  const ka = sideKey(a);
  return (ka !== null && ka === sideKey(b)) || overlap(a, b) >= threshold;
};

// --------------------------------------------------------------------------- cites

const dash = (s: string): string => s.replace(/[‐-―−]/g, "-").replace(/^no\.?\s*/i, "").replace(/\s+/g, "").toLowerCase();
const decisionYear = (r: ScdbCaseRow): number => Number(/(\d{4})$/.exec(r.dateDecision.trim())?.[1] ?? r.term);
const usParts = (cite: string): { volume: number; page: number } | null => {
  const m = /^(\d+)\s+U\.S\.\s+(\d+)\b/.exec(cite.trim());
  return m ? { volume: Number(m[1]), page: Number(m[2]) } : null;
};

export interface WikiCasesReport {
  cases: number;
  matched: number;
  by_via: Record<WikiVia, number>;
  /** Cases whose list entry is a red link: Wikipedia has no article. */
  no_article: number;
  /** Their ids. */
  red_linked: string[];
  /** A rung found its entry but the names disagree, or two rungs gave different articles: left unlinked, listed for review. */
  conflicts: { case_id: string; scdb_name: string; wiki_name: string; via: WikiVia; reason: string }[];
  /** Every match made on name and year: review by eye. */
  name_matches: { case_id: string; scdb_name: string; title: string }[];
  /** Cases with no entry on any list. */
  unlisted: number;
}

const push = <K, V>(m: Map<K, V[]>, k: K, v: V): void => void m.set(k, [...(m.get(k) ?? []), v]);

/**
 * A list row can link something that is not the case's article: the volume list itself (a self-link on a row with no article),
 * or a topic page the row happens to cite ("Fifth Amendment to the United States Constitution" for a search case). Titles
 * like those are not links to the case. An article about several cases ("The Tidelands Case", "Insular Cases") or a
 * case article under a different name ("Biden v. Nebraska" for its companion) stays.
 */
export function isCaseArticle(title: string, scdbName: string): boolean {
  if (/^List of /i.test(title)) return false;
  return / v\.? /i.test(title) || /\bcases?\b/i.test(title) || overlap(scdbName, title) > 0;
}

/** The distinct linked titles among entries (several list rows can name one article). */
const titlesOf = (es: readonly WikiCaseEntry[], scdbName: string): string[] => [...new Set(es.flatMap((e) => (e.title && isCaseArticle(e.title, scdbName) ? [e.title] : [])))];

export function matchWikipediaCases(rawEntries: readonly WikiCaseEntry[], cases: readonly ScdbCaseRow[], redirects: Readonly<Record<string, string>> = {}): { rows: WikiCaseRow[]; report: WikiCasesReport } {
  // Two lists can link one article by two titles (a redirect and its target); join on the target.
  const entries = rawEntries.map((e) => (e.title && redirects[e.title] ? { ...e, title: redirects[e.title]! } : e));
  const byCite = new Map<string, WikiCaseEntry[]>();
  const byDocket = new Map<string, WikiCaseEntry[]>();
  const byKey = new Map<string, WikiCaseEntry[]>();
  const byDocketOnly = new Map<string, WikiCaseEntry[]>();
  for (const e of entries) {
    if (e.docket) push(byDocketOnly, dash(e.docket), e);
    if (e.volume !== null && e.page !== null) push(byCite, `${e.volume}/${e.page}`, e);
    if (e.volume !== null && e.docket) push(byDocket, `${e.volume}/${dash(e.docket)}`, e);
    const k = sideKey(e.title ?? e.name);
    if (k) push(byKey, k, e);
  }

  const report: WikiCasesReport = { cases: cases.length, matched: 0, by_via: { us_cite: 0, docket: 0, name_year: 0 }, no_article: 0, red_linked: [], conflicts: [], name_matches: [], unlisted: 0 };
  const rows: WikiCaseRow[] = [];
  const lastVolume = Math.max(0, ...entries.flatMap((e) => (e.source.startsWith("List of") && e.volume !== null ? [e.volume] : [])));

  for (const c of cases) {
    const us = usParts(c.usCite);
    let conflicted = false;
    const conflict = (via: WikiVia, wiki: string, reason: string) => (conflicted = true, report.conflicts.push({ case_id: c.caseId, scdb_name: c.caseName, wiki_name: wiki, via, reason }));
    let title: string | null = null;
    let via: WikiVia = "us_cite";
    let listed = false;

    // 1 and 2: the cite or the docket pins the case; names only veto.
    const pinned: [WikiVia, WikiCaseEntry[]][] = [];
    if (us) pinned.push(["us_cite", byCite.get(`${us.volume}/${us.page}`) ?? []]);
    if (us && c.docket.trim()) pinned.push(["docket", byDocket.get(`${us.volume}/${dash(c.docket)}`) ?? []]);
    for (const [v, found] of pinned) {
      if (found.length === 0) continue;
      listed = true;
      // A cite names one case, so a single article is certain whatever abbreviations the two names use ("N.Y.C. & St. L.R. Co.").
      // Companion cases share a cite and a page: with several articles, the names choose.
      let ts = titlesOf(found, c.caseName);
      if (ts.length > 1) {
        ts = titlesOf(found.filter((e) => sameCase(c.caseName, e.title ?? e.name, 0.5)), c.caseName);
        if (ts.length !== 1) {
          conflict(v, titlesOf(found, c.caseName).join(" / "), "the cite names more than one article and the names do not choose");
          continue;
        }
      }
      if (ts.length === 1) {
        title = ts[0]!;
        via = v;
        break;
      }
    }

    // 2b: no U.S. cite to name the volume (a decision too new for its page), so the docket and the year pin the case.
    if (!title && !us && c.docket.trim()) {
      const y = decisionYear(c);
      const found = (byDocketOnly.get(dash(c.docket)) ?? []).filter((e) => e.year !== null && Math.abs(e.year - y) <= 1 && sameCase(c.caseName, e.title ?? e.name, 0.5));
      if (found.length > 0) listed = true;
      const ts = titlesOf(found, c.caseName);
      if (ts.length === 1) {
        title = ts[0]!;
        via = "docket";
      } else if (ts.length > 1) conflict("docket", ts.join(" / "), "the docket names more than one article");
    }

    // 3: name and year, from entries with no usable page. One unambiguous article, whose name fits closely.
    if (!title) {
      const k = sideKey(c.caseName);
      const y = decisionYear(c);
      const cands = (k ? (byKey.get(k) ?? []) : []).filter((e) => e.year !== null && Math.abs(e.year - y) <= 1 && (us === null || e.page === null || (e.volume === us.volume && e.page === us.page)) && sameCase(c.caseName, e.title ?? e.name, 0.8));
      if (cands.length > 0) listed = true;
      const ts = titlesOf(cands, c.caseName);
      if (ts.length === 1) {
        title = ts[0]!;
        via = "name_year";
        report.name_matches.push({ case_id: c.caseId, scdb_name: c.caseName, title });
      } else if (ts.length > 1 && ts.filter((t) => t.includes(`(${y})`)).length === 1) {
        // "Republic of Hungary v. Simon (2021)" beside "Republic of Hungary v. Simon": the year in the title says which.
        title = ts.find((t) => t.includes(`(${y})`))!;
        via = "name_year";
        report.name_matches.push({ case_id: c.caseId, scdb_name: c.caseName, title });
      } else if (ts.length > 1) conflict("name_year", ts.join(" / "), "more than one article fits the name and year");
    }

    if (title) {
      rows.push({ case_id: c.caseId, title, via });
      report.by_via[via]++;
    } else if (conflicted) {
      // Two articles fit: unresolved, so the page falls back to a search rather than guess.
      report.unlisted++;
    } else if (listed || (us !== null && us.volume <= lastVolume)) {
      // The list shows no article; a printed U.S. Reports cite that no volume list carries is an order, not a listed case.
      report.no_article++;
      report.red_linked.push(c.caseId);
    } else report.unlisted++;
  }
  report.matched = rows.length;
  return { rows, report };
}

/** Build-failing checks: every title is real text, one case never gets two rows, and the match rate has not collapsed. */
export function checkWikipediaCases(rows: readonly WikiCaseRow[], report: WikiCasesReport, caseIds: ReadonlySet<string>): void {
  const fail = (m: string): never => {
    throw new DecisionsDataError(`wikipedia case articles gate failed: ${m}`);
  };
  if (new Set(rows.map((r) => r.case_id)).size !== rows.length) fail("a case appears twice");
  for (const r of rows) if (!caseIds.has(r.case_id) || !r.title.trim()) fail(`bad row ${r.case_id}`);
  if (rows.length + report.no_article + report.unlisted + report.conflicts.length < report.cases) fail("cases unaccounted for");
  // Today about half the cases have an article; a collapse means a list's markup changed.
  if (rows.length < report.cases * 0.3) fail(`only ${rows.length} of ${report.cases} cases matched`);
}
