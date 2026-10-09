import {
  COMMEMORATIONS_AREA,
  LAWS_FIRST_CONGRESS,
  LawsDataError,
  NOT_CLASSIFIED_AREA,
  NOT_CLASSIFIED_GROUP,
  ordinal,
  congressDateWindow,
  type LawCommitteesFile,
  type LawCountRow,
  type LawPolicyAreas,
  type LawRow,
  type LawsMeta,
  type RawAction,
  type RawCongressFile,
  type RawLaw,
  type RawSource,
} from "../../lib/laws-entities";
import { COMMEMORATIVE_BASES, commemorativeBasis, type CommemorativeBasis } from "./laws-commemorative";
import { firstSentence } from "./laws-summary";

/**
 * Pure logic of the Laws track (no file I/O): choose the source for each Congress, check the raw files, and build
 * `laws.json`, `laws_counts.json`, `laws_cosponsors.json` and `laws_meta.json`. Gates throw `LawsDataError`; nothing warns.
 * Behaviour of the sources, and why each gate exists: docs/LAWS_PREFLIGHT.md and docs/LAWS_METHODOLOGY.md.
 */

/** Bill Status is preferred where both sources hold a Congress; the other is then only the overlap check. */
const SOURCE_ORDER: readonly RawSource[] = ["govinfo-billstatus", "congress-gov"];

export interface Chosen {
  primary: RawCongressFile;
  overlap: RawCongressFile | null;
}

/** One file per Congress, 93rd through the latest, with no Congress skipped. */
export function chooseSources(files: RawCongressFile[]): Map<number, Chosen> {
  const by = new Map<number, RawCongressFile[]>();
  for (const f of files) by.set(f.congress, [...(by.get(f.congress) ?? []), f]);
  const congresses = [...by.keys()].sort((a, b) => a - b);
  if (congresses.length === 0) throw new LawsDataError("no raw files");
  if (congresses[0] !== LAWS_FIRST_CONGRESS) throw new LawsDataError(`the first Congress with data is the ${ordinal(congresses[0]!)}, expected the ${ordinal(LAWS_FIRST_CONGRESS)}`);
  for (let c = congresses[0]!; c <= congresses.at(-1)!; c++) if (!by.has(c)) throw new LawsDataError(`no raw file covers the ${ordinal(c)} Congress`);
  const out = new Map<number, Chosen>();
  for (const c of congresses) {
    const list = [...by.get(c)!].sort((a, b) => SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source));
    if (new Set(list.map((f) => f.source)).size !== list.length) throw new LawsDataError(`${ordinal(c)} Congress: two raw files from the same source`);
    out.set(c, { primary: list[0]!, overlap: list[1] ?? null });
  }
  return out;
}

/** Law numbers must run 1..N with none missing or repeated, and match the independent count where there is one. */
export function checkNumbering(file: RawCongressFile, independent: Record<string, number>): void {
  const c = file.congress;
  const nums = file.laws.map((l) => l.number);
  const seen = new Set<number>();
  for (const l of file.laws) {
    if (l.congress !== c) throw new LawsDataError(`${ordinal(c)} Congress file holds ${l.law_id} (Congress ${l.congress})`);
    if (l.law_id !== `${c}-pub-${l.number}`) throw new LawsDataError(`${l.law_id} does not match its Congress and number`);
    if (seen.has(l.number)) throw new LawsDataError(`${ordinal(c)} Congress: public law ${c}-${l.number} appears twice`);
    seen.add(l.number);
  }
  const max = Math.max(...nums);
  if (max !== file.max_number) throw new LawsDataError(`${ordinal(c)} Congress: file says the highest law is ${file.max_number}, the laws say ${max}`);
  const missing: number[] = [];
  for (let n = 1; n <= max; n++) if (!seen.has(n)) missing.push(n);
  if (missing.length > 0) throw new LawsDataError(`${ordinal(c)} Congress: public laws ${missing.slice(0, 10).map((n) => `${c}-${n}`).join(", ")}${missing.length > 10 ? ` and ${missing.length - 10} more` : ""} are missing (numbers must run 1..${max})`);
  const expected = independent[String(c)];
  if (expected !== undefined && expected !== file.laws.length) {
    throw new LawsDataError(`${ordinal(c)} Congress: ${file.laws.length} laws, but the independent count (Statutes at Large / GovInfo PLAW) is ${expected}`);
  }
}

/**
 * In a Congress still in progress, Congress.gov can assign a law number to a bill before its enactment action is recorded
 * (119-120, H.R. 766, had only "Referred to committee" when this was written). Such a law has no signing date, so it is held
 * out of the data and listed in the report until the action appears. In a finished Congress the same thing is a failure.
 */
export function splitPending(file: RawCongressFile, partial: boolean): { file: RawCongressFile; pending: string[] } {
  if (!partial) return { file, pending: [] };
  const pending = file.laws.filter((l) => l.became_law.length === 0).map((l) => l.law_id);
  if (pending.length === 0) return { file, pending };
  const keep = file.laws.filter((l) => l.became_law.length > 0);
  return { file: { ...file, laws: keep, max_number: Math.max(...keep.map((l) => l.number)) }, pending };
}

/** The signing date: the earliest `BecameLaw` action. */
export function signingDate(law: RawLaw): string {
  const d = [...law.became_law].sort()[0];
  if (!d) throw new LawsDataError(`${law.law_id} has no "became law" action, so it has no signing date`);
  return d;
}

/** A law may be dated from 3 January of its first year to 20 January after the Congress ends. */
export function checkDates(file: RawCongressFile): void {
  const w = congressDateWindow(file.congress);
  const bad = file.laws.filter((l) => {
    const d = signingDate(l);
    return d < w.start || d > w.end;
  });
  if (bad.length > 0) {
    throw new LawsDataError(`${ordinal(file.congress)} Congress: ${bad.length} law(s) dated outside ${w.start}..${w.end}: ${bad.slice(0, 5).map((l) => `${l.law_id} ${signingDate(l)}`).join(", ")}`);
  }
}

/** True when Congress passed the law over a presidential veto: a veto, and an "over veto" passage in the actions. */
export function isVetoOverride(actions: RawAction[]): boolean {
  const vetoed = actions.some((a) => /^vetoed by president/i.test(a.text));
  const overridden = actions.some((a) => /\bover (the )?(president'?s |presidential )?veto\b/i.test(a.text) || /\bveto\b.*\b(overrid|notwithstanding)/i.test(a.text));
  return vetoed && overridden;
}

/** Fields that must agree where Bill Status and the API both cover a law. */
export function overlapDifferences(a: RawCongressFile, b: RawCongressFile): string[] {
  const out: string[] = [];
  const mine = new Map(a.laws.map((l) => [l.law_id, l]));
  const theirs = new Map(b.laws.map((l) => [l.law_id, l]));
  for (const id of mine.keys()) if (!theirs.has(id)) out.push(`${id} is in ${a.source} but not in ${b.source}`);
  for (const id of theirs.keys()) if (!mine.has(id)) out.push(`${id} is in ${b.source} but not in ${a.source}`);
  for (const [id, x] of mine) {
    const y = theirs.get(id);
    if (!y) continue;
    const pairs: [string, unknown, unknown][] = [
      ["bill", `${x.bill_type}${x.bill_number}`, `${y.bill_type}${y.bill_number}`],
      ["policy area", x.policy_area, y.policy_area],
      ["sponsor", x.sponsor, y.sponsor],
      ["introduced", x.introduced, y.introduced],
      ["signing date", [...x.became_law].sort()[0], [...y.became_law].sort()[0]],
      ["origin chamber", x.origin_chamber, y.origin_chamber],
      ["recorded votes", voteRefs(x), voteRefs(y)],
      ["summary sentence", firstSentence(x.summary_html).sentence, firstSentence(y.summary_html).sentence],
    ];
    for (const [what, p, q] of pairs) if (JSON.stringify(p) !== JSON.stringify(q)) out.push(`${id} ${what}: ${a.source} ${JSON.stringify(p)} vs ${b.source} ${JSON.stringify(q)}`);
  }
  return out;
}

/** Sorted roll-call references of a law, for comparing two sources. */
function voteRefs(l: RawLaw): string[] {
  const s = new Set<string>();
  for (const a of l.actions) for (const v of a.votes ?? []) s.add(`${v.chamber}|${v.session ?? ""}|${v.roll}`);
  return [...s].sort();
}

export interface AreaIndex {
  /** Source name -> catalog area id. */
  byName: Map<string, string>;
  legacy: Set<string>;
  /** Law id -> the area InsideGov assigned to a law CRS gave none (`law-areas-assigned.json`). */
  assigned: ReadonlyMap<string, string>;
}

export function areaIndex(areas: LawPolicyAreas, assigned: Readonly<Record<string, string>> = {}): AreaIndex {
  const byName = new Map<string, string>();
  for (const a of areas.areas) {
    if (byName.has(a.name)) throw new LawsDataError(`policy area "${a.name}" is listed twice`);
    byName.set(a.name, a.id);
  }
  const groups = new Set(areas.groups.map((g) => g.id));
  for (const a of areas.areas) if (!groups.has(a.group)) throw new LawsDataError(`policy area "${a.name}" names an unknown group "${a.group}"`);
  const legacy = new Set(areas.legacy_terms);
  for (const t of legacy) if (byName.has(t)) throw new LawsDataError(`"${t}" is both a catalog area and a legacy term`);
  const ids = new Set(byName.values());
  for (const [lawId, id] of Object.entries(assigned)) if (!ids.has(id)) throw new LawsDataError(`law-areas-assigned.json gives ${lawId} the area "${id}", which is not a catalog area`);
  return { byName, legacy, assigned: new Map(Object.entries(assigned)) };
}

/** Catalog id for a source's policy-area name; legacy terms and laws with none are "not classified"; any other name stops the build. */
export function areaIdFor(name: string | null, idx: AreaIndex): string {
  if (name === null) return NOT_CLASSIFIED_AREA;
  const id = idx.byName.get(name);
  if (id) return id;
  if (idx.legacy.has(name)) return NOT_CLASSIFIED_AREA;
  throw new LawsDataError(`policy area "${name}" is neither a CRS area nor a listed legacy term; add it to pipeline/reference/law-policy-areas.json`);
}

export function buildLawRow(l: RawLaw, idx: AreaIndex, extra: Pick<LawRow, "house" | "senate" | "band" | "override_votes" | "major"> & { summary?: string | null }): LawRow {
  const { summary, ...rest } = extra;
  const crsArea = areaIdFor(l.policy_area, idx);
  const commemorative = crsArea === COMMEMORATIONS_AREA || commemorativeBasis(l.title) !== null;
  const area = commemorative ? COMMEMORATIONS_AREA : ((crsArea === NOT_CLASSIFIED_AREA ? idx.assigned.get(l.law_id) : undefined) ?? crsArea);
  return {
    law_id: l.law_id,
    congress: l.congress,
    number: l.number,
    date: signingDate(l),
    title: l.title,
    bill_type: l.bill_type,
    bill_number: l.bill_number,
    origin_chamber: l.origin_chamber,
    sponsor_bioguide_id: l.sponsor,
    area_id: area,
    ...(area !== crsArea ? { crs_area_id: crsArea } : {}),
    veto_override: isVetoOverride(l.actions),
    ...rest,
    ...(summary ? { summary } : {}),
  };
}

export interface AssignmentReport {
  /** Laws CRS gave no current area that now sit in an assigned area. */
  assigned: number;
  by_area: Record<string, number>;
  by_congress: Record<string, number>;
  /** Laws with no area and no assignment, all in a Congress still in progress. */
  still_unassigned: string[];
}

/**
 * Every law CRS gave no current policy area (and that is not commemorative by title) in a finished Congress needs an entry in
 * `law-areas-assigned.json`, and every entry must be needed: a missing or stale one throws. A Congress still in progress may hold
 * laws CRS has not yet classified; they stay "Not classified" and are listed.
 */
export function checkAssignments(laws: readonly RawLaw[], idx: AreaIndex, inProgress: ReadonlySet<number>): AssignmentReport {
  const by_area: Record<string, number> = {};
  const by_congress: Record<string, number> = {};
  const still: string[] = [];
  const missing: string[] = [];
  const stale: string[] = [];
  const all = new Set(laws.map((l) => l.law_id));
  let assigned = 0;
  for (const l of laws) {
    const unclassified = areaIdFor(l.policy_area, idx) === NOT_CLASSIFIED_AREA && commemorativeBasis(l.title) === null;
    const area = idx.assigned.get(l.law_id);
    if (unclassified && area === undefined) (inProgress.has(l.congress) ? still : missing).push(l.law_id);
    if (!unclassified && area !== undefined) stale.push(l.law_id);
    if (unclassified && area !== undefined) {
      assigned++;
      by_area[area] = (by_area[area] ?? 0) + 1;
      by_congress[l.congress] = (by_congress[l.congress] ?? 0) + 1;
    }
  }
  for (const id of idx.assigned.keys()) if (!all.has(id)) stale.push(id);
  if (missing.length > 0) throw new LawsDataError(`${missing.length} law(s) have no CRS area and no entry in law-areas-assigned.json: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? " ..." : ""}`);
  if (stale.length > 0) throw new LawsDataError(`law-areas-assigned.json lists ${stale.length} law(s) that do not need an assigned area (already classified, commemorative by title, or not in the data): ${stale.slice(0, 8).join(", ")}`);
  return { assigned, by_area: Object.fromEntries(Object.entries(by_area).sort((a, b) => b[1] - a[1])), by_congress, still_unassigned: still };
}

/** Of the laws CRS itself filed under "Commemorations", the share the title rules also catch must stay at or above this. */
export const COMMEMORATIVE_MIN_AGREEMENT = 0.9;

export interface CommemorativeReport {
  rule: string;
  /** Laws counted as commemorative (CRS's own label, or a title rule). */
  flagged: number;
  by_basis: Record<CommemorativeBasis | "crs_label_only", number>;
  /** Against the laws CRS labeled "Commemorations": how many the title rules also catch, and the ones they miss. */
  crs_labeled: { laws: number; also_caught_by_title_rules: number; agreement: number; missed_titles: string[] };
  /** Laws a title rule caught that CRS filed elsewhere (or did not classify), by the CRS area they sit in. */
  moved_from_crs_area: Record<string, number>;
  by_year: Record<string, number>;
}

/** What the commemorative flag did, and whether the rules still agree with CRS where CRS used its own label. Throws below the agreement floor. */
export function commemorativeReport(laws: readonly RawLaw[], idx: AreaIndex): CommemorativeReport {
  const by_basis = Object.fromEntries([...COMMEMORATIVE_BASES, "crs_label_only"].map((b) => [b, 0])) as CommemorativeReport["by_basis"];
  const moved: Record<string, number> = {};
  const byYear: Record<string, number> = {};
  const missed: string[] = [];
  let flagged = 0;
  let crsLabeled = 0;
  let caught = 0;
  for (const l of laws) {
    const crsArea = areaIdFor(l.policy_area, idx);
    const basis = commemorativeBasis(l.title);
    const crs = crsArea === COMMEMORATIONS_AREA;
    if (crs) {
      crsLabeled++;
      if (basis) caught++;
      else missed.push(`${l.law_id}: ${l.title.slice(0, 110)}`);
    }
    if (!crs && !basis) continue;
    flagged++;
    by_basis[basis ?? "crs_label_only"]++;
    if (!crs) moved[crsArea] = (moved[crsArea] ?? 0) + 1;
    const year = signingDate(l).slice(0, 4);
    byYear[year] = (byYear[year] ?? 0) + 1;
  }
  const agreement = crsLabeled === 0 ? 1 : caught / crsLabeled;
  if (agreement < COMMEMORATIVE_MIN_AGREEMENT) throw new LawsDataError(`the commemorative title rules catch ${caught} of the ${crsLabeled} laws CRS filed under "Commemorations" (${(100 * agreement).toFixed(1)}%), below the ${100 * COMMEMORATIVE_MIN_AGREEMENT}% floor`);
  return {
    rule: "A law is commemorative when CRS filed it under Commemorations or its title matches a rule in transform/laws-commemorative.ts (observance, naming, honor, memorial). Its CRS area is kept as crs_area_id.",
    flagged,
    by_basis,
    crs_labeled: { laws: crsLabeled, also_caught_by_title_rules: caught, agreement: Math.round(agreement * 1000) / 1000, missed_titles: missed.slice(0, 60) },
    moved_from_crs_area: Object.fromEntries(Object.entries(moved).sort((a, b) => b[1] - a[1])),
    by_year: Object.fromEntries(Object.entries(byYear).sort()),
  };
}

export function buildCounts(rows: LawRow[]): LawCountRow[] {
  const m = new Map<string, LawCountRow>();
  for (const r of rows) {
    const k = `${r.congress}|${r.area_id}`;
    const cur = m.get(k) ?? { congress: r.congress, area_id: r.area_id, n: 0, bands: [0, 0, 0, 0, 0] as LawCountRow["bands"], major: 0 };
    cur.n++;
    cur.bands[r.band]++;
    if (r.major) cur.major++;
    m.set(k, cur);
  }
  return [...m.values()].sort((a, b) => a.congress - b.congress || a.area_id.localeCompare(b.area_id));
}

/** The counts must add back to the list, per Congress. */
export function checkCounts(counts: LawCountRow[], rows: LawRow[]): void {
  const byCongress = new Map<number, number>();
  for (const r of rows) byCongress.set(r.congress, (byCongress.get(r.congress) ?? 0) + 1);
  const sums = new Map<number, number>();
  for (const c of counts) {
    sums.set(c.congress, (sums.get(c.congress) ?? 0) + c.n);
    if (c.bands.reduce((a, b) => a + b, 0) !== c.n) throw new LawsDataError(`${ordinal(c.congress)} Congress, ${c.area_id}: the band counts add to ${c.bands.reduce((a, b) => a + b, 0)}, not ${c.n}`);
  }
  for (const [c, n] of byCongress) if (sums.get(c) !== n) throw new LawsDataError(`${ordinal(c)} Congress: counts add to ${sums.get(c) ?? 0}, the list has ${n}`);
  if (sums.size !== byCongress.size) throw new LawsDataError("counts and list cover different Congresses");
}

export function buildMeta(args: { rows: LawRow[]; chosen: Map<number, Chosen>; areas: LawPolicyAreas; independent: Record<string, number>; voteviewLast: { House: string; Senate: string }; majorThrough: number }): LawsMeta {
  const { rows, chosen, areas, independent, voteviewLast, majorThrough } = args;
  const congresses = [...chosen.keys()].sort((a, b) => a - b);
  const bySource = new Map<RawSource, number[]>();
  for (const c of congresses) bySource.set(chosen.get(c)!.primary.source, [...(bySource.get(chosen.get(c)!.primary.source) ?? []), c]);
  return {
    first_congress: congresses[0]!,
    last_congress: congresses.at(-1)!,
    partial_congresses: congresses.filter((c) => independent[String(c)] === undefined),
    data_through: rows.reduce((m, r) => (r.date > m ? r.date : m), "0000-00-00"),
    law_count: rows.length,
    support_first_congress: congresses[0]!,
    voteview_last_date: voteviewLast,
    major_covered_through_congress: majorThrough,
    sources: [...bySource].map(([source, cs]) => ({ source, first_congress: Math.min(...cs), last_congress: Math.max(...cs) })),
    areas: [
      ...areas.areas.map((a) => ({ id: a.id, name: a.name, group: a.group, status: a.status })),
      { id: NOT_CLASSIFIED_AREA, name: null, group: NOT_CLASSIFIED_GROUP, status: "none" as const },
    ],
    groups: [...areas.groups, { id: NOT_CLASSIFIED_GROUP, label: "Not classified" }],
  };
}

export interface SponsorReport {
  unresolved: { law_id: string; bioguide_id: string; name: string | null }[];
  none: string[];
}

/** Sponsors that are not in `legislators.json`, and laws with no sponsor at all. Reported, not fatal (the plan lists them). */
export function sponsorReport(laws: RawLaw[], known: ReadonlySet<string>): SponsorReport {
  const unresolved: SponsorReport["unresolved"] = [];
  const none: string[] = [];
  for (const l of laws) {
    if (l.sponsor === null) none.push(l.law_id);
    else if (!known.has(l.sponsor)) unresolved.push({ law_id: l.law_id, bioguide_id: l.sponsor, name: l.sponsor_name });
  }
  return { unresolved, none };
}

// ---- committees ----

/** `hsif00` -> `HSIF` (the committees.json id); `hsif14` -> `HSIF14` (a subcommittees.json id). */
export const committeeIdOf = (code: string): string => (code.endsWith("00") ? code.slice(0, 4) : code).toUpperCase();
const chamberOfCode = (code: string): "House" | "Senate" | "Joint" | null => ({ h: "House" as const, s: "Senate" as const, j: "Joint" as const })[code[0] as "h"] ?? null;

export interface CommitteeIndex {
  committees: ReadonlySet<string>;
  subcommittees: ReadonlySet<string>;
}

/**
 * For each law, the committees (and their subcommittees) it went through, as ids that join to `committees.json` and
 * `subcommittees.json`, plus a catalog saying which ids have a page. Those files cover the current Congress only, so older or
 * renamed committees have a name but no page. A subcommittee code listed without its committee still gets its parent.
 */
export function buildCommittees(laws: readonly RawLaw[], known: CommitteeIndex): { file: LawCommitteesFile; names: Map<string, Map<string, number>> } {
  const names = new Map<string, Map<string, number>>();
  const note = (id: string, name: string) => {
    if (name === "") return;
    const m = names.get(id) ?? new Map<string, number>();
    m.set(name, (m.get(name) ?? 0) + 1);
    names.set(id, m);
  };
  const perLaw: LawCommitteesFile["laws"] = {};
  const parentOf = new Map<string, string | null>();
  for (const l of laws) {
    const entries = new Map<string, { subs: Set<string>; steps: Set<string> }>();
    for (const c of l.committees) {
      const subId = c.code.endsWith("00") ? null : committeeIdOf(c.code);
      const id = subId ? subId.slice(0, 4) : committeeIdOf(c.code);
      const e = entries.get(id) ?? { subs: new Set<string>(), steps: new Set<string>() };
      entries.set(id, e);
      if (subId) {
        e.subs.add(subId);
        note(subId, c.name);
        parentOf.set(subId, id);
      } else {
        note(id, c.name);
        parentOf.set(id, null);
        for (const a of c.activities) e.steps.add(a.name.toLowerCase());
      }
      for (const s of c.subcommittees) {
        const sid = committeeIdOf(s.code);
        e.subs.add(sid);
        note(sid, s.name);
        parentOf.set(sid, id);
      }
    }
    if (entries.size > 0) perLaw[l.law_id] = [...entries].sort((a, b) => a[0].localeCompare(b[0])).map(([id, e]) => [id, [...e.subs].sort(), [...e.steps].sort()]);
  }
  const committees: LawCommitteesFile["committees"] = {};
  for (const id of [...names.keys()].sort()) {
    const best = [...names.get(id)!].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
    const parent = parentOf.get(id) ?? null;
    committees[id] = { name: best, chamber: chamberOfCode(id.toLowerCase()), parent, page: parent === null ? known.committees.has(id) : known.subcommittees.has(id) };
  }
  // A parent named only through its subcommittees still needs a catalog entry to link from.
  for (const l of Object.values(perLaw)) for (const [id] of l) if (!committees[id]) committees[id] = { name: id, chamber: chamberOfCode(id.toLowerCase()), parent: null, page: known.committees.has(id) };
  return { file: { committees, laws: perLaw }, names };
}
