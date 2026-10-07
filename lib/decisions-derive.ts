import type { BandTerm } from "../components/charts/TermBand";
import type { TermSegment } from "../components/charts/TermBandSvg";
import type { DecisionCountRow, DecisionsMeta } from "./decisions-entities";
import { initialsOf } from "./term-label";
import { ALL_AREAS, OTHER_AREAS, type AreaSort, type AreaSortKey, type Bucket, type DecisionCase, type DecisionsChief, type DecisionsPayload, type SplitMode } from "./decisions-types";
import type { YearRange } from "./year-range";

/**
 * Pure shaping for /supreme-court/decisions (no file I/O; `lib/decisions-data.ts` reads the files). Unit-tested over the
 * real pipeline outputs in `decisions-derive.test.ts`. Area index -1 means "All issue areas" (unclassified cases included).
 */

export const sumBucket = (b: readonly number[]): number => b[0] + b[1] + b[2] + b[3] + b[4];
const zero = (): Bucket => [0, 0, 0, 0, 0];
const addInto = (acc: Bucket, b: readonly number[]) => {
  for (let k = 0; k < 5; k++) acc[k] += b[k];
};

/** A median case count per term under this is a "small sample": single-year shares swing widely. */
export const SMALL_SAMPLE_MEDIAN = 15;

export function buildDecisionsPayload(counts: readonly DecisionCountRow[], meta: DecisionsMeta): DecisionsPayload {
  const terms: number[] = [];
  for (let t = meta.first_term; t <= meta.data_through_term; t++) terms.push(t);
  const termIndex = new Map(terms.map((t, i) => [t, i]));
  const areaIndex = new Map(meta.issue_areas.map((a, i) => [a.id, i]));
  const all = terms.map(zero);
  const by = meta.issue_areas.map(() => terms.map(zero));
  for (const r of counts) {
    const ti = termIndex.get(r.term);
    if (ti === undefined) throw new Error(`decisions: count row for term ${r.term} outside ${meta.first_term}-${meta.data_through_term}`);
    const b: Bucket = [r.d0, r.d1, r.d2, r.d3, r.d4];
    addInto(all[ti], b);
    if (r.issue_area_id !== null) {
      const ai = areaIndex.get(r.issue_area_id);
      if (ai === undefined) throw new Error(`decisions: unknown issue area ${r.issue_area_id}`);
      addInto(by[ai][ti], b);
    }
  }
  const totals = by.map((rows) => rows.reduce((t, b) => t + sumBucket(b), 0));
  const topAreas = totals.map((n, i) => ({ n, i })).sort((a, b) => b.n - a.n || a.i - b.i).slice(0, TOP_AREAS).map((x) => x.i);
  // "Other areas" = everything outside the six biggest, cases with no issue area included, so the series always add up to All.
  const other = terms.map((_, ti) => {
    const o: Bucket = [...all[ti]];
    for (const ai of topAreas) for (let k = 0; k < 5; k++) o[k] -= by[ai][ti][k];
    return o;
  });
  const chiefs: DecisionsChief[] = meta.chief_spans.map((s) => ({
    id: s.scdb_chief,
    name: s.name,
    last: s.scdb_chief,
    president: s.appointing_president,
    party: s.appointing_party === "Republican" ? "R" : "D",
    start: s.start_term,
    end: s.end_term,
  }));
  return {
    terms,
    areas: meta.issue_areas.map((a) => ({ id: a.id, label: a.label })),
    all,
    by,
    other,
    topAreas,
    chiefs,
    versionLabel: meta.scdb_version_label,
    citation: meta.citation,
    caseCount: meta.case_count,
    unclearVotes: meta.exclusions.unclear_votes,
    unclassified: meta.unclassified_count,
  };
}

/** How many issue areas get their own series in card 1; the rest are "Other areas". */
export const TOP_AREAS = 6;

/** The per-term buckets for an area filter value (ALL_AREAS, OTHER_AREAS or an index). */
export const areaCells = (d: DecisionsPayload, area: number): Bucket[] => (area === ALL_AREAS ? d.all : area === OTHER_AREAS ? d.other : d.by[area]);
export const cellAt = (d: DecisionsPayload, area: number, ti: number): Bucket => areaCells(d, area)[ti];

/** Does issue-area index `index` (-1 = none coded) fall inside the area filter? */
export const inAreaFilter = (d: DecisionsPayload, area: number, index: number): boolean =>
  area === ALL_AREAS || (area === OTHER_AREAS ? !d.topAreas.includes(index) : index === area);

export const areaFilterLabel = (d: DecisionsPayload, area: number): string =>
  area === ALL_AREAS ? "All issue areas" : area === OTHER_AREAS ? OTHER_LABEL(d) : d.areas[area].label;
export const OTHER_LABEL = (d: DecisionsPayload): string => `Other areas (${d.areas.length - TOP_AREAS})`;

/** Card 1's series, in stack order: the six biggest areas, then Other. `area` is the filter value that picks the series. */
export function areaSeries(d: DecisionsPayload): { id: string; label: string; area: number; short: string }[] {
  return [
    ...d.topAreas.map((i) => ({ id: d.areas[i].id, label: d.areas[i].label, short: d.areas[i].label, area: i })),
    { id: "other", label: OTHER_LABEL(d), short: "Other areas", area: OTHER_AREAS },
  ];
}

/** Index range `[from, to]` (inclusive) of the terms inside the years window. */
export function windowIndexes(d: DecisionsPayload, range: YearRange): [number, number] {
  const first = d.terms[0];
  const last = d.terms[d.terms.length - 1];
  const lo = Math.max(first, Math.min(range[0], last));
  const hi = Math.max(lo, Math.min(range[1], last));
  return [lo - first, hi - first];
}

/** The terms in the window and the bucket counts of the chosen area in each. */
export function windowCells(d: DecisionsPayload, area: number, range: YearRange): { terms: number[]; cells: Bucket[] } {
  const [a, b] = windowIndexes(d, range);
  return { terms: d.terms.slice(a, b + 1), cells: areaCells(d, area).slice(a, b + 1) };
}

/** Bucket totals over the whole window. */
export function windowSum(d: DecisionsPayload, area: number, range: YearRange): Bucket {
  const out = zero();
  for (const c of windowCells(d, area, range).cells) addInto(out, c);
  return out;
}

export const casesPerTerm = (cells: readonly Bucket[]): number[] => cells.map(sumBucket);

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Few cases per term in a chosen issue area: shares from single years are rough. Never true for "All issue areas". */
export function isSmallSample(d: DecisionsPayload, area: number, range: YearRange): boolean {
  if (area === ALL_AREAS) return false;
  return median(casesPerTerm(windowCells(d, area, range).cells)) < SMALL_SAMPLE_MEDIAN;
}

/** A band's share of a bucket, 0-1 (0 for an empty bucket). */
export const bandShare = (b: readonly number[], k: number): number => {
  const t = sumBucket(b);
  return t ? b[k] / t : 0;
};

export interface Stack {
  /** `lo[k][i]`, `up[k][i]` : the band's lower and upper edge in term i, in percent (share) or cases (count). */
  lo: number[][];
  up: number[][];
  /** Top of the tallest stack (100 in share mode). */
  max: number;
}

/**
 * Cumulative stacks for the visible bands, bottom to top in band order. `vis` lists the bands drawn (all five, or the one
 * isolated); an isolated band starts from zero on its own scale.
 */
export function buildStacks(cells: readonly Bucket[], mode: SplitMode, vis: readonly number[]): Stack {
  const lo: number[][] = [];
  const up: number[][] = [];
  let run = cells.map(() => 0);
  for (const k of vis) {
    lo[k] = run.slice();
    run = run.map((r, i) => r + (mode === "share" ? bandShare(cells[i], k) * 100 : cells[i][k]));
    up[k] = run.slice();
  }
  return { lo, up, max: mode === "share" ? 100 : Math.max(1, ...run) };
}

/** A round axis top (1, 2, 5 x 10^n) that holds `max` with about four gridlines. */
export function niceStep(max: number): number {
  const raw = max / 4;
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  for (const s of [1, 2, 5, 10]) if (raw <= s * p) return s * p;
  return 10 * p;
}

export interface AreaRow {
  /** -1 = All issue areas. */
  index: number;
  id: string;
  label: string;
  bucket: Bucket;
  total: number;
}

export const ALL_AREAS_LABEL = "All issue areas";

/** "All issue areas" first (pinned, never sorted), then each issue area with at least one case in the window, sorted. */
export function areaRows(d: DecisionsPayload, range: YearRange, sort: AreaSort): AreaRow[] {
  const rows: AreaRow[] = d.areas
    .map((a, index) => ({ index, id: a.id, label: a.label, bucket: windowSum(d, index, range) }))
    .map((r) => ({ ...r, total: sumBucket(r.bucket) }))
    .filter((r) => r.total > 0);
  const key: Record<AreaSortKey, (r: AreaRow) => number> = {
    n: (r) => r.total,
    u: (r) => bandShare(r.bucket, 0),
    f: (r) => bandShare(r.bucket, 4),
  };
  const dir = sort.reversed ? 1 : -1;
  rows.sort((a, b) => dir * (key[sort.key](a) - key[sort.key](b)) || a.index - b.index);
  const all = windowSum(d, -1, range);
  return [{ index: -1, id: "all", label: ALL_AREAS_LABEL, bucket: all, total: sumBucket(all) }, ...rows];
}

/** Click on the active key reverses it; another key starts largest-first. */
export const nextAreaSort = (cur: AreaSort, key: AreaSortKey): AreaSort => (cur.key === key ? { key, reversed: !cur.reversed } : { key, reversed: false });

// --------------------------------------------------------------------------- Chief Justice bands

/** The slider's term band: one segment per Chief Justice, tinted by the party of the president who appointed them Chief. */
export function chiefBandTerms(d: DecisionsPayload): BandTerm[] {
  return d.chiefs.map((c) => ({
    id: c.id,
    label: `${c.name} (${c.start}–${c.end === d.terms[d.terms.length - 1] ? "present" : c.end}), appointed Chief Justice by ${c.president}`,
    last: c.last,
    initials: initialsOf(c.name),
    party: c.party,
    from: c.start,
    to: c.end,
  }));
}

export const chiefOfTerm = (d: DecisionsPayload, term: number): DecisionsChief | undefined => d.chiefs.find((c) => term >= c.start && term <= c.end);

/** Per-slot runs for `TermBandSvg`: one slot per term shown, the Chief in the center chair that term. */
export function chiefSegments(d: DecisionsPayload, terms: readonly number[]): TermSegment[] {
  const out: TermSegment[] = [];
  terms.forEach((t, i) => {
    const c = chiefOfTerm(d, t);
    if (!c) return;
    const prev = out[out.length - 1];
    if (prev && prev.id === c.id && prev.e === i - 1) prev.e = i;
    else out.push({ id: c.id, last: c.last, president: c.name, party: c.party, s: i, e: i });
  });
  return out;
}

// --------------------------------------------------------------------------- copy

// --------------------------------------------------------------------------- the case list

export interface CaseFilter {
  range: YearRange;
  area: number;
  /** Dissent band 0-4, or null for any. */
  band: number | null;
  /** A single pinned term, or null for the whole window. */
  term: number | null;
}

/** Cases (newest first) inside the window, the area filter, the band and the pinned term. */
export function filterCases(d: DecisionsPayload, cases: readonly DecisionCase[], f: CaseFilter): DecisionCase[] {
  const [lo, hi] = f.term === null ? f.range : [f.term, f.term];
  return cases.filter((c) => c[0] >= lo && c[0] <= hi && (f.band === null || c[5] === f.band) && inAreaFilter(d, f.area, c[4]));
}

/** `https://supreme.justia.com/...` for a case with a U.S. Reports cite ("347 U.S. 483"); null when there is no page number to link. */
export function caseUrl(cite: string): string | null {
  const m = /^(\d+) U\.S\. (\d+)$/.exec(cite.trim());
  return m ? `https://supreme.justia.com/cases/federal/us/${m[1]}/${m[2]}/` : null;
}

export const fmtPct = (v: number): string => `${Math.round(v * 100)}%`;
export const fmtInt = (n: number): string => n.toLocaleString("en-US");
