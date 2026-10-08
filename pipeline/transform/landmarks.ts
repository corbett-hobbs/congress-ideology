import { DecisionsDataError, type LandmarkRow, type ScdbCaseRow } from "../../lib/decisions-entities";

/**
 * Wikipedia's "List of landmark court decisions in the United States" -> which cases on the Decisions page are landmarks.
 * Pure logic (`decisions-run.ts` does the I/O). The list is wikitext: `==` / `===` headings group the cases, and each
 * case is a bullet with an article link and a `{{ussc|volume|page|year}}` template (some recent ones use named
 * parameters or a docket number instead of a page). Cases are joined to SCDB by U.S. Reports cite, then docket, then
 * case name plus year; every name match is listed in the report for review.
 */

export interface LandmarkEntry {
  /** Wikipedia article title (the link target). */
  title: string;
  /** The name as the list prints it (often the full form of an abbreviated title). */
  display: string;
  /** "Criminal law › Fourth Amendment rights". */
  topic: string;
  volume: string | null;
  page: string | null;
  docket: string | null;
  year: number | null;
}

const SEP = " › ";

/** The {{ussc}} parameters: positional (`volume|page|year`) or named (`volume=|page=|docket=|year=|date=`). */
function usscParams(args: string): { volume: string | null; page: string | null; docket: string | null; year: number | null } {
  const named: Record<string, string> = {};
  const positional: string[] = [];
  for (const part of args.split("|")) {
    const eq = part.indexOf("=");
    if (eq > 0 && /^[a-z]+$/i.test(part.slice(0, eq).trim())) named[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim();
    else positional.push(part.trim());
  }
  const yearOf = (s: string | undefined) => /\b(1[789]\d\d|20\d\d)\b/.exec(s ?? "")?.[1];
  const page = named.page ?? positional[1] ?? null;
  const y = yearOf(named.year) ?? yearOf(named.date) ?? yearOf(positional[2]);
  return {
    volume: /^\d+$/.test(named.volume ?? positional[0] ?? "") ? (named.volume ?? positional[0]!) : null,
    page: page && /^\d+$/.test(page) ? page : null,
    docket: named.docket && named.docket !== "" ? named.docket : null,
    year: y ? Number(y) : null,
  };
}

export function parseLandmarkList(wikitext: string): LandmarkEntry[] {
  const out: LandmarkEntry[] = [];
  let h2 = "";
  let topic = "";
  for (const line of wikitext.split("\n")) {
    const h = /^(={2,3})\s*(.*?)\s*\1\s*$/.exec(line);
    if (h) {
      if (h[1]!.length === 2) {
        h2 = h[2]!;
        topic = h2;
      } else topic = `${h2}${SEP}${h[2]}`;
      continue;
    }
    if (!line.startsWith("*") || !/\{\{ussc\|/i.test(line)) continue;
    const link = /\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/.exec(line);
    const ussc = /\{\{ussc\|([^}]*)\}\}/i.exec(line);
    if (!link || !ussc) continue;
    if (!topic || topic === "See also" || topic === "References") continue;
    out.push({ title: link[1]!.trim(), display: (link[2] ?? link[1]!).trim(), topic, ...usscParams(ussc[1]!) });
  }
  return out;
}

// --------------------------------------------------------------------------- matching

const STOP = new Set(["the", "of", "v", "vs", "et", "al", "inc", "co", "corp", "company", "llc", "ltd", "no", "a", "an", "in", "for", "and", "on", "ex", "rel"]);
const tokens = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));

/** "brown|board": the first significant word on each side of the "v.". Null for a name with no "v." (In re ..., Ex parte ...). */
export function nameKey(name: string): string | null {
  const sides = name.split(/\s+v\.?\s+/i);
  if (sides.length < 2) return null;
  const a = tokens(sides[0]!)[0];
  const b = tokens(sides[1]!)[0];
  return a && b ? `${a}|${b}` : null;
}

export interface LandmarkReport {
  entries: number;
  /** Entries decided before SCDB's modern file: 1945 and earlier, plus 1946 decisions from the 1945 term. */
  pre_1946: number;
  matched: number;
  by_via: Record<"us_cite" | "docket" | "name_year", number>;
  /** In SCDB but not on the page: not orally argued, or the vote is marked unclear. */
  out_of_scope: { title: string; cite: string; year: number | null }[];
  unmatched: { title: string; cite: string; year: number | null; reason: string }[];
  /** Every match made on the case name: review these by eye. */
  name_matches: { title: string; scdb_name: string; year: number | null }[];
  duplicates: string[];
}

const citeOf = (e: LandmarkEntry) => (e.volume ? `${e.volume} U.S. ${e.page ?? e.docket ?? "___"}` : "(no cite)");
const decisionYear = (r: ScdbCaseRow) => Number(/(\d{4})$/.exec(r.dateDecision.trim())?.[1] ?? r.term);

/**
 * Join the list to SCDB. `all` is every row of the file (to tell "not on the page" from "not in SCDB"); `cases` are the rows in
 * scope. A case under several headings gets all of them.
 */
export function matchLandmarks(entries: readonly LandmarkEntry[], all: readonly ScdbCaseRow[], cases: readonly ScdbCaseRow[]): { rows: LandmarkRow[]; report: LandmarkReport } {
  const inScope = new Set(cases.map((c) => c.caseId));
  const byUs = new Map(all.filter((r) => r.usCite.trim()).map((r) => [r.usCite.trim(), r]));
  const byDocket = new Map<string, ScdbCaseRow[]>();
  for (const r of all) byDocket.set(r.docket.trim(), [...(byDocket.get(r.docket.trim()) ?? []), r]);
  const byKey = new Map<string, ScdbCaseRow[]>();
  for (const r of all) {
    const k = nameKey(r.caseName);
    if (k) byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }

  const report: LandmarkReport = { entries: entries.length, pre_1946: 0, matched: 0, by_via: { us_cite: 0, docket: 0, name_year: 0 }, out_of_scope: [], unmatched: [], name_matches: [], duplicates: [] };
  const rows = new Map<string, LandmarkRow>();

  for (const e of entries) {
    if (e.year !== null && e.year < 1946) {
      report.pre_1946++;
      continue;
    }
    let hit: ScdbCaseRow | undefined;
    let via: LandmarkRow["via"] = "us_cite";
    if (e.volume && e.page) hit = byUs.get(`${e.volume} U.S. ${e.page}`);
    if (!hit && e.docket) {
      const cands = (byDocket.get(e.docket) ?? []).filter((r) => e.year === null || Math.abs(decisionYear(r) - e.year) <= 1);
      if (cands.length === 1) {
        hit = cands[0];
        via = "docket";
      }
    }
    if (!hit) {
      for (const name of [e.display, e.title]) {
        const k = nameKey(name);
        if (!k) continue;
        const cands = (byKey.get(k) ?? []).filter((r) => e.year !== null && (decisionYear(r) === e.year || r.term === e.year));
        if (cands.length >= 1) {
          // Several rows with the same parties and year (companion cases): prefer the one whose volume matches, else the first.
          hit = cands.find((r) => e.volume && r.usCite.startsWith(`${e.volume} U.S.`)) ?? cands[0];
          via = "name_year";
          report.name_matches.push({ title: e.title, scdb_name: hit!.caseName, year: e.year });
          break;
        }
      }
    }
    if (!hit && e.year === 1946) {
      // Decided in 1946 but not in SCDB's file, which starts with the October 1946 term: the 1945 term (Marsh v. Alabama, Morgan v. Virginia).
      report.pre_1946++;
      continue;
    }
    if (!hit) {
      report.unmatched.push({ title: e.title, cite: citeOf(e), year: e.year, reason: e.year === null ? "no year on the list" : "no SCDB row with this cite, docket or name and year" });
      continue;
    }
    if (!inScope.has(hit.caseId)) {
      report.out_of_scope.push({ title: e.title, cite: citeOf(e), year: e.year });
      continue;
    }
    const prev = rows.get(hit.caseId);
    if (prev) {
      report.duplicates.push(`${e.title} (also ${prev.title})`);
      if (!prev.topics.includes(e.topic)) prev.topics.push(e.topic);
      continue;
    }
    rows.set(hit.caseId, { case_id: hit.caseId, title: e.title, topics: [e.topic], via });
    report.by_via[via]++;
  }
  report.matched = rows.size;
  if (entries.length === 0) throw new DecisionsDataError("landmarks: the list parsed to zero entries");
  return { rows: [...rows.values()].sort((a, b) => a.case_id.localeCompare(b.case_id)), report };
}

/** Build-failing checks: every entry is accounted for exactly once, almost all post-SCDB entries join, and the rows are sane. */
export function checkLandmarks(entries: readonly LandmarkEntry[], rows: readonly LandmarkRow[], report: LandmarkReport, caseIds: ReadonlySet<string>): void {
  const fail = (m: string): never => {
    throw new DecisionsDataError(`landmarks gate failed: ${m}`);
  };
  // matched + duplicates (same case under another heading) + out of scope + not in SCDB + before SCDB = every entry.
  const accounted = report.matched + report.duplicates.length + report.out_of_scope.length + report.unmatched.length + report.pre_1946;
  if (accounted !== entries.length) fail(`${accounted} entries accounted for, ${entries.length} parsed`);
  if (new Set(rows.map((r) => r.case_id)).size !== rows.length) fail("a case appears twice");
  for (const r of rows) if (!caseIds.has(r.case_id)) fail(`${r.title}: case ${r.case_id} is not a case on the page`);
  const post = entries.length - report.pre_1946;
  if (report.unmatched.length > Math.ceil(post * 0.03)) fail(`${report.unmatched.length} of ${post} post-SCDB entries did not join (limit 3%): ${report.unmatched.map((u) => u.title).join("; ")}`);
  if (report.matched < 300) fail(`only ${report.matched} landmarks matched; the list's format has probably changed`);
}
