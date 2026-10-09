import type { TermSegment } from "@/components/charts/TermBandSvg";
import type { CongressControlRow } from "./congress-control";
import type { Administration } from "./executive-orders-entities";
import type { LawCountRow, LawRow, LawsMeta } from "./laws-entities";
import type { BandCounts, LawsPayload, LawsPresident, SignedMost } from "./laws-types";
import { initialsOf } from "./term-label";
import type { BandTerm } from "@/components/charts/TermBand";
import type { YearRange } from "./year-range";

/**
 * Pure derivations for the Congress Laws page (no file I/O, unit-tested over the real committed files in
 * `laws-derive.test.ts`). The signing president is never stored: it is derived here from the signing date.
 */

const partyLetter = (p: Administration["party"]): "D" | "R" => (p === "Democratic" ? "D" : "R");

/** The administration in office on `date` (`start <= date <= end`; a null `end` is the sitting president). */
export function administrationOn(date: string, admins: readonly Administration[]): Administration | null {
  return admins.find((a) => a.start <= date && (a.end === null || date <= a.end)) ?? null;
}

/**
 * Who signed the most laws in each Congress. Ties go to the later administration (a Congress whose halves split evenly
 * is then labelled by the president who closed it). Every law needs an administration: a date outside the table throws.
 */
export function signedMostByCongress(laws: readonly Pick<LawRow, "congress" | "date" | "law_id">[], admins: readonly Administration[]): Map<number, SignedMost> {
  const tally = new Map<number, Map<string, { admin: Administration; n: number }>>();
  for (const l of laws) {
    const a = administrationOn(l.date, admins);
    if (!a) throw new Error(`laws: ${l.law_id} is dated ${l.date}, which no administration covers`);
    const per = tally.get(l.congress) ?? new Map();
    const cur = per.get(a.term_id);
    if (cur) cur.n++;
    else per.set(a.term_id, { admin: a, n: 1 });
    tally.set(l.congress, per);
  }
  const out = new Map<number, SignedMost>();
  for (const [congress, per] of tally) {
    const split = [...per.values()]
      .sort((x, y) => y.n - x.n || (x.admin.start < y.admin.start ? 1 : -1))
      .map((e) => ({ termId: e.admin.term_id, president: e.admin.president, party: partyLetter(e.admin.party), n: e.n }));
    out.set(congress, { ...split[0]!, split });
  }
  return out;
}

/** Laws per Congress, all areas. */
export function totalsByCongress(counts: readonly LawCountRow[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const c of counts) m.set(c.congress, (m.get(c.congress) ?? 0) + c.n);
  return m;
}

/** Laws per `(Congress, topic group)`. */
export function groupCountsByCongress(counts: readonly LawCountRow[], meta: Pick<LawsMeta, "areas">): Map<number, Map<string, number>> {
  const groupOf = new Map(meta.areas.map((a) => [a.id, a.group]));
  const out = new Map<number, Map<string, number>>();
  for (const c of counts) {
    const g = groupOf.get(c.area_id);
    if (!g) throw new Error(`laws: counts name area "${c.area_id}", which the catalog does not list`);
    const per = out.get(c.congress) ?? new Map<string, number>();
    per.set(g, (per.get(g) ?? 0) + c.n);
    out.set(c.congress, per);
  }
  return out;
}

/** The dense payload the page receives: counts as `[congress][area]`, no per-law rows. */
export function buildLawsPayload(
  counts: readonly LawCountRow[],
  laws: readonly LawRow[],
  meta: LawsMeta,
  admins: readonly Administration[],
  controlRows: readonly CongressControlRow[] = [],
): LawsPayload {
  const congresses: number[] = [];
  for (let c = meta.first_congress; c <= meta.last_congress; c++) congresses.push(c);
  const areaIndex = new Map(meta.areas.map((a, i) => [a.id, i]));
  const cIndex = new Map(congresses.map((c, i) => [c, i]));
  const grid = congresses.map(() => meta.areas.map(() => 0));
  const majorGrid = congresses.map(() => meta.areas.map(() => 0));
  const bandGrid = congresses.map(() => meta.areas.map((): BandCounts => [0, 0, 0, 0, 0]));
  const majorBandGrid = congresses.map(() => meta.areas.map((): BandCounts => [0, 0, 0, 0, 0]));
  for (const r of counts) {
    const ci = cIndex.get(r.congress);
    const ai = areaIndex.get(r.area_id);
    if (ci === undefined || ai === undefined) throw new Error(`laws: counts row (${r.congress}, ${r.area_id}) is outside the catalog`);
    grid[ci]![ai]! += r.n;
    majorGrid[ci]![ai]! += r.major;
    r.bands.forEach((n, b) => (bandGrid[ci]![ai]![b]! += n));
  }
  for (const l of laws) {
    if (l.major !== true) continue;
    const ci = cIndex.get(l.congress);
    const ai = areaIndex.get(l.area_id);
    if (ci === undefined || ai === undefined) throw new Error(`laws: ${l.law_id} is outside the catalog`);
    majorBandGrid[ci]![ai]![l.band]!++;
  }
  const signed = signedMostByCongress(laws, admins);
  const last = congresses[congresses.length - 1]!;
  return {
    congresses,
    partial: congresses.map((c) => meta.partial_congresses.includes(c)),
    areas: meta.areas,
    groups: meta.groups,
    counts: grid,
    bands: bandGrid,
    majorBands: majorBandGrid,
    major: majorGrid,
    majorThrough: meta.major_covered_through_congress,
    signedMost: congresses.map((c) => {
      const s = signed.get(c);
      if (!s) throw new Error(`laws: no laws in the ${c}th Congress`);
      return s;
    }),
    control: controlRows.length ? { house: controlByCongress(controlRows, "house", congresses), senate: controlByCongress(controlRows, "senate", congresses) } : { house: [], senate: [] },
    presidents: presidentTerms(admins, openYear(meta.first_congress), openYear(last) + 1),
    dataThrough: meta.data_through,
    lawCount: meta.law_count,
  };
}

// --------------------------------------------------------------------------- calendar

/** The year a Congress opens (93rd = 1973). A Congress runs `openYear` to `openYear + 1`. */
export const openYear = (congress: number): number => 1787 + 2 * congress;

const DAY = 86_400_000;
const dayNo = (iso: string): number => Date.parse(`${iso}T00:00:00Z`) / DAY;

/** The party that held the chamber for most days of each Congress (a Congress runs 3 January to 2 January two years on); a tie goes to the later holder. */
export function controlByCongress(rows: readonly CongressControlRow[], chamber: "house" | "senate", congresses: readonly number[]): ("D" | "R")[] {
  const mine = rows.filter((r) => r.chamber === chamber).sort((a, b) => a.from.localeCompare(b.from));
  return congresses.map((c) => {
    const s = dayNo(`${openYear(c)}-01-03`);
    const e = dayNo(`${openYear(c) + 2}-01-03`);
    const days = { D: 0, R: 0 };
    let latest: "D" | "R" | null = null;
    for (const r of mine) {
      const a = Math.max(s, dayNo(r.from));
      const b = Math.min(e, r.to === null ? e : dayNo(r.to) + 1);
      if (b > a) {
        days[r.party] += b - a;
        latest = r.party;
      }
    }
    if (days.D + days.R === 0 || latest === null) throw new Error(`laws: no ${chamber} control rows cover the ${c}th Congress`);
    return days.D === days.R ? latest : days.D > days.R ? "D" : "R";
  });
}

/** Presidents for the year slider's band: each tenure clamped to `[firstYear, lastYear]`, one entry per person in a row. */
export function presidentTerms(admins: readonly Administration[], firstYear: number, lastYear: number): LawsPresident[] {
  const out: LawsPresident[] = [];
  for (const a of [...admins].sort((x, y) => x.start.localeCompare(y.start))) {
    if (a.end !== null && a.end < `${firstYear}-01-21`) continue;
    if (Number(a.start.slice(0, 4)) > lastYear) continue;
    const from = Math.max(firstYear, Number(a.start.slice(0, 4)));
    const to = Math.min(lastYear, a.end === null ? lastYear : Number(a.end.slice(0, 4)));
    const prev = out[out.length - 1];
    if (prev && prev.president === a.president) prev.to = to;
    else out.push({ id: a.term_id, president: a.president, last: a.president.split(" ").pop() ?? a.president, party: partyLetter(a.party), from, to });
  }
  return out;
}

export const presidentBand = (p: LawsPayload): BandTerm[] =>
  p.presidents.map((t) => ({ id: t.id, label: `${t.president} (${t.from}\u2013${t.to === p.presidents[p.presidents.length - 1]!.to ? "present" : t.to})`, last: t.last, initials: initialsOf(t.president), party: t.party, from: t.from, to: t.to }));

/** The slider's full span in years: the first Congress's opening year to the last Congress's second year. */
export const yearSpan = (p: LawsPayload): YearRange => [openYear(p.congresses[0]!), openYear(p.congresses[p.congresses.length - 1]!) + 1];

// --------------------------------------------------------------------------- the page's filters

/** Value of the topic filter that means "every group". */
export const ALL_GROUPS = "";
/** Value of the topic filter that means the groups without a colour of their own, together. */
export const OTHER_GROUPS = "other";
/** Groups that keep a colour of their own (the validated palette has seven: these, Other topics and Not classified). */
export const COLOURED_GROUPS = 5;
const NOT_CLASSIFIED = "not-classified";

export interface LawsSeries {
  id: string;
  label: string;
  /** Topic groups this series sums. */
  groups: string[];
}

/** Total laws per topic group over every Congress, largest first, Not classified last. */
function groupTotals(p: LawsPayload): { id: string; n: number }[] {
  const groupOf = p.areas.map((a) => a.group);
  const tot = new Map(p.groups.map((g) => [g.id, 0]));
  p.counts.forEach((row) => row.forEach((n, ai) => tot.set(groupOf[ai]!, tot.get(groupOf[ai]!)! + n)));
  return [...tot].map(([id, n]) => ({ id, n })).sort((a, b) => Number(a.id === NOT_CLASSIFIED) - Number(b.id === NOT_CLASSIFIED) || b.n - a.n);
}

/**
 * The series card 1 stacks, bottom to top: the five biggest topic groups, "Other topics" (the rest together), then Not classified
 * (the 1973-78 laws CRS never gave a current area; shown, never mapped). Seven colours is what the validated palette holds.
 */
export function seriesOf(p: LawsPayload): LawsSeries[] {
  const label = new Map(p.groups.map((g) => [g.id, g.label]));
  const ranked = groupTotals(p).filter((g) => g.id !== NOT_CLASSIFIED);
  const top = ranked.slice(0, COLOURED_GROUPS).map((g) => ({ id: g.id, label: label.get(g.id)!, groups: [g.id] }));
  const rest = ranked.slice(COLOURED_GROUPS).map((g) => g.id);
  return [...top, { id: OTHER_GROUPS, label: otherLabel(rest.length), groups: rest }, { id: NOT_CLASSIFIED, label: label.get(NOT_CLASSIFIED)!, groups: [NOT_CLASSIFIED] }];
}

export const otherLabel = (n: number): string => `Other topics (${n})`;

/** The groups a filter value selects; null = all. */
export function filterGroups(p: LawsPayload, filter: string): ReadonlySet<string> | null {
  if (filter === ALL_GROUPS) return null;
  if (filter === OTHER_GROUPS) return new Set(seriesOf(p).find((s) => s.id === OTHER_GROUPS)!.groups);
  return new Set([filter]);
}

export function filterLabel(p: LawsPayload, filter: string): string {
  if (filter === ALL_GROUPS) return "All policy areas";
  if (filter === OTHER_GROUPS) return seriesOf(p).find((s) => s.id === OTHER_GROUPS)!.label;
  return p.groups.find((g) => g.id === filter)?.label ?? filter;
}

export interface Cell {
  n: number;
  bands: BandCounts;
}

/** Laws in one Congress for the chosen groups (null = all): every law, or only the major ones. */
export function cellFor(p: LawsPayload, ci: number, groups: ReadonlySet<string> | null, major: boolean): Cell {
  const bands: BandCounts = [0, 0, 0, 0, 0];
  const src = major ? p.majorBands[ci]! : p.bands[ci]!;
  p.areas.forEach((a, ai) => {
    if (groups && !groups.has(a.group)) return;
    for (let k = 0; k < 5; k++) bands[k] += src[ai]![k]!;
  });
  return { n: bands[0] + bands[1] + bands[2] + bands[3] + bands[4], bands };
}

/**
 * Indices `[first, last]` of the Congresses a years window shows (empty when first > last). A Congress shows when its second year
 * is inside the window, so a president's term (inauguration year to inauguration year) holds exactly the Congresses that ran in it,
 * and any window two years or wider holds at least one. With "major laws only" the window stops at the last assessed Congress.
 */
export function windowIndexes(p: LawsPayload, range: YearRange, major: boolean): [number, number] {
  let a = -1;
  let b = -2;
  p.congresses.forEach((c, i) => {
    const y = openYear(c) + 1;
    if (y < range[0] || y > range[1] || (major && c > p.majorThrough)) return;
    if (a < 0) a = i;
    b = i;
  });
  return a < 0 ? [0, -1] : [a, b];
}

export const SUPPORT_LABELS = ["No recorded vote", "Under 60% yes", "60\u201375% yes", "75\u201390% yes", "90% or more yes"] as const;
export const SUPPORT_SHORT = ["No recorded vote", "Under 60%", "60\u201375%", "75\u201390%", "90%+"] as const;
/** The split palette, one slot per band in data order (the darkest is "no recorded vote"; the cool end is broad support). */
export const SUPPORT_COLORS = ["var(--split-0)", "var(--split-4)", "var(--split-3)", "var(--split-2)", "var(--split-1)"] as const;

/** Below this many laws a Congress (median over the window), shares swing on a handful of laws. */
export const SMALL_LAWS_MEDIAN = 15;

/** Presidents for `TermBandSvg`, one slot per Congress in `indexes`: whoever signed most of that Congress's laws. */
export function signedMostSegments(p: LawsPayload, indexes: readonly number[]): TermSegment[] {
  const out: TermSegment[] = [];
  indexes.forEach((ci, slot) => {
    const s = p.signedMost[ci]!;
    const prev = out[out.length - 1];
    if (prev && prev.president === s.president && prev.e === slot - 1) prev.e = slot;
    else out.push({ id: s.termId, last: s.president.split(" ").pop() ?? s.president, president: s.president, party: s.party, s: slot, e: slot });
  });
  return out;
}

/** Share of laws in `[firstCongress, lastCongress]` that had no recorded final-passage vote in either chamber. */
export function noVoteShare(p: LawsPayload, firstCongress: number, lastCongress: number): number {
  let none = 0;
  let all = 0;
  p.congresses.forEach((c, ci) => {
    if (c < firstCongress || c > lastCongress) return;
    p.bands[ci]!.forEach((b) => {
      none += b[0];
      all += b[0] + b[1] + b[2] + b[3] + b[4];
    });
  });
  return all ? none / all : 0;
}
