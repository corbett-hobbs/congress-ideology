import type { TermSegment } from "@/components/charts/TermBandSvg";
import type { CongressControlRow } from "./congress-control";
import type { Administration } from "./executive-orders-entities";
import type { LawCountRow, LawRow, LawsMeta } from "./laws-entities";
import type { BandCounts, ChamberTally, LawListRow, LawSigner, LawSponsor, LawsList, LawsPayload, LawsPresident, SignedMost } from "./laws-types";
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
    listVersion: "",
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
/** Topic groups the page can draw: one colour each, eight being the most a categorical palette keeps distinguishable (no "Other topics"). */
export const MAX_GROUPS = 8;
const NOT_CLASSIFIED = "not-classified";

export interface LawsSeries {
  id: string;
  label: string;
  /** Topic groups this series sums (always one). */
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
 * The series card 1 stacks, bottom to top: every topic group that has laws, largest first. "Not classified" comes last and only
 * while some law (in a Congress still in progress) has no area yet. More than `MAX_GROUPS` groups with laws throws: merge groups in
 * `law-policy-areas.json` rather than add a colour.
 */
export function seriesOf(p: LawsPayload): LawsSeries[] {
  const label = new Map(p.groups.map((g) => [g.id, g.label]));
  const ranked = groupTotals(p).filter((g) => g.n > 0);
  const topics = ranked.filter((g) => g.id !== NOT_CLASSIFIED);
  if (topics.length > MAX_GROUPS) throw new Error(`laws: ${topics.length} topic groups have laws; the page draws at most ${MAX_GROUPS}`);
  return ranked.map((g) => ({ id: g.id, label: label.get(g.id)!, groups: [g.id] }));
}

/** The groups a filter value selects; null = all. */
export function filterGroups(_p: LawsPayload, filter: string): ReadonlySet<string> | null {
  return filter === ALL_GROUPS ? null : new Set([filter]);
}

export function filterLabel(p: LawsPayload, filter: string): string {
  if (filter === ALL_GROUPS) return "All policy areas";
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

export const SUPPORT_LABELS = ["Voice vote or consent", "Under 60% yes", "60\u201375% yes", "75\u201390% yes", "90% or more yes"] as const;
export const SUPPORT_SHORT = ["Voice vote", "Under 60%", "60\u201375%", "75\u201390%", "90%+"] as const;
/** The split palette, one slot per band in data order (the darkest is the voice-vote band; the cool end is broad support). */
export const SUPPORT_COLORS = ["var(--split-0)", "var(--split-4)", "var(--split-3)", "var(--split-2)", "var(--split-1)"] as const;
/** Display order of the bands, bottom to top in the stack and left to right in bars, legends and tables: under 60% up to 90%+, then voice vote last, so the two broad-agreement bands sit together and the narrow-vote band leads. Data order stays 0..4. */
export const SUPPORT_ORDER = [1, 2, 3, 4, 0] as const;

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

/** Share of laws in `[firstCongress, lastCongress]` passed by voice vote or consent (no roll call on final passage in either chamber). */
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

// --------------------------------------------------------------------------- the list of every law

const BILL_LABEL: Record<LawRow["bill_type"], string> = { hr: "H.R.", s: "S.", hjres: "H.J.Res.", sjres: "S.J.Res." };
export const billLabel = (l: Pick<LawRow, "bill_type" | "bill_number">): string => `${BILL_LABEL[l.bill_type]} ${l.bill_number}`;

/**
 * The list payload: one compact tuple per law, newest first, plus the small tables the tuples index (sponsors, signers).
 * `sponsorOf` resolves a bioguide id to how the list shows them (name, party-state, profile path); the signer is derived from
 * the signing date, never stored on the law.
 */
export function buildLawsList(
  laws: readonly LawRow[],
  meta: Pick<LawsMeta, "areas">,
  admins: readonly Administration[],
  sponsorOf: (bioguideId: string, congress: number, origin: LawRow["origin_chamber"]) => LawSponsor | null,
): LawsList {
  const areaIndex = new Map(meta.areas.map((a, i) => [a.id, i]));
  const sponsors: LawSponsor[] = [];
  const sponsorKey = new Map<string, number>();
  const signers: LawSigner[] = [];
  const signerKey = new Map<string, number>();
  const rows = [...laws]
    .sort((a, b) => b.date.localeCompare(a.date) || b.congress - a.congress || b.number - a.number)
    .map((l): LawListRow => {
      const ai = areaIndex.get(l.area_id);
      if (ai === undefined) throw new Error(`laws: ${l.law_id} names area "${l.area_id}", which the catalog does not list`);
      let si = -1;
      if (l.sponsor_bioguide_id) {
        const key = `${l.sponsor_bioguide_id}|${l.congress}|${l.origin_chamber ?? ""}`;
        si = sponsorKey.get(key) ?? -1;
        if (si < 0) {
          const s = sponsorOf(l.sponsor_bioguide_id, l.congress, l.origin_chamber);
          if (s) {
            si = sponsors.push(s) - 1;
            sponsorKey.set(key, si);
          }
        }
      }
      const a = administrationOn(l.date, admins);
      if (!a) throw new Error(`laws: ${l.law_id} is dated ${l.date}, which no administration covers`);
      let gi = signerKey.get(a.term_id);
      if (gi === undefined) {
        gi = signers.push([a.president, partyLetter(a.party)]) - 1;
        signerKey.set(a.term_id, gi);
      }
      return [l.congress, l.number, l.date, l.title, ai, l.band, [l.house[0], l.house[1], l.house[2]], [l.senate[0], l.senate[1], l.senate[2]], si, l.major === null ? 2 : l.major ? 1 : 0, l.veto_override ? 1 : 0, l.summary ?? "", billLabel(l), gi, l.override_votes];
    });
  return { rows, sponsors, signers };
}

/** "House 267–140" / "Senate voice vote" / "Senate unanimous consent" / "House: no method stated". */
export function tallyText(chamber: "House" | "Senate", t: ChamberTally): string {
  if (t[0] === 0 && t[1] !== null && t[2] !== null) return `${chamber} ${t[1]}–${t[2]}`;
  if (t[0] === 1) return `${chamber} voice vote`;
  if (t[0] === 2) return `${chamber} unanimous consent`;
  return `${chamber}: no method stated`;
}

export interface LawFilter {
  /** Inclusive Congress index range into `data.congresses`; `first > last` = none. */
  window: [number, number];
  /** A pinned Congress number overrides the window. */
  congress: number | null;
  group: string;
  major: boolean;
  band: number | null;
}

/** The list rows a set of page-level filters keeps (order kept: newest first). */
export function filterLaws(p: LawsPayload, rows: readonly LawListRow[], f: LawFilter): LawListRow[] {
  const [lo, hi] = f.congress !== null ? [f.congress, f.congress] : [p.congresses[f.window[0]] ?? 1, p.congresses[f.window[1]] ?? 0];
  const groups = filterGroups(p, f.group);
  const ok = new Set(p.areas.flatMap((a, i) => (!groups || groups.has(a.group) ? [i] : [])));
  return rows.filter((r) => r[0] >= lo && r[0] <= hi && ok.has(r[4]) && (!f.major || r[9] === 1) && (f.band === null || r[5] === f.band));
}

/** Every word of `query` must appear in the law's name, bill, sponsor, policy area, summary or Pub. L. number. */
export function matchLaws(p: LawsPayload, list: Pick<LawsList, "sponsors">, rows: readonly LawListRow[], query: string): LawListRow[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...rows];
  return rows.filter((r) => {
    const sp = r[8] >= 0 ? list.sponsors[r[8]]![0] : "";
    const hay = `${r[3]} ${r[12]} ${sp} ${p.areas[r[4]]!.name ?? "Not classified"} ${p.groups.find((g) => g.id === p.areas[r[4]]!.group)?.label ?? ""} ${r[11]} ${r[0]}-${r[1]} pub. l. ${r[0]}–${r[1]}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

// --------------------------------------------------------------------------- card 3: topic groups by decade

export type GroupSortKey = "n" | "f" | "u" | "m" | "h" | "b";
export interface GroupSort {
  key: GroupSortKey;
  reversed: boolean;
}
/** Click on the active key reverses it; another key starts largest-first. */
export const nextGroupSort = (cur: GroupSort, key: GroupSortKey): GroupSort => (cur.key === key ? { key, reversed: !cur.reversed } : { key, reversed: false });

/** What each toggle key counts: every law, or the laws in one support band (1 = under 60% yes, 0 = voice vote or consent). */
export const GROUP_MEASURES: Record<GroupSortKey, { band: number | null; noun: string }> = {
  n: { band: null, noun: "laws" },
  f: { band: 1, noun: "passed on a narrow vote (under 60% yes)" },
  u: { band: 0, noun: "passed by voice vote or consent" },
  m: { band: 2, noun: "passed with 60\u201375% yes" },
  h: { band: 3, noun: "passed with 75\u201390% yes" },
  b: { band: 4, noun: "passed with 90% or more yes" },
};

/** The toggle key that measures a support band (what the page's vote filter locks card 3 to). */
export const GROUP_KEY_FOR_BAND: Record<number, GroupSortKey> = { 0: "u", 1: "f", 2: "m", 3: "h", 4: "b" };

export const ALL_ROW = "all";

export interface GroupRow {
  /** A topic group's id, or `ALL_ROW`. */
  id: string;
  label: string;
  bands: BandCounts;
  total: number;
}

const sumBands = (b: readonly number[]): number => b[0]! + b[1]! + b[2]! + b[3]! + b[4]!;

/** Laws in the Congresses `[a, b]` for `groups` (null = all): the five band counts. */
function windowBands(p: LawsPayload, a: number, b: number, groups: ReadonlySet<string> | null, major: boolean): BandCounts {
  const out: BandCounts = [0, 0, 0, 0, 0];
  for (let ci = a; ci <= b; ci++) cellFor(p, ci, groups, major).bands.forEach((n, k) => (out[k]! += n));
  return out;
}

/**
 * One row per topic group with laws in the window (Not classified included, so the 1973-78 gap stays visible), ordered by the
 * toggle's measure, with "All policy areas" pinned first. A comparison chart: the policy-area filter dims rows, never removes them.
 */
export function groupRows(p: LawsPayload, window: readonly [number, number], major: boolean, sort: GroupSort): GroupRow[] {
  const rows: GroupRow[] = p.groups
    .map((g) => {
      const bands = window[0] > window[1] ? ([0, 0, 0, 0, 0] as BandCounts) : windowBands(p, window[0], window[1], new Set([g.id]), major);
      return { id: g.id, label: g.label, bands, total: sumBands(bands) };
    })
    .filter((r) => r.total > 0);
  const measure = GROUP_MEASURES[sort.key].band;
  const value = (r: GroupRow): number => (measure === null ? r.total : r.total ? r.bands[measure]! / r.total : 0);
  const dir = sort.reversed ? 1 : -1;
  const order = new Map(p.groups.map((g, i) => [g.id, i]));
  rows.sort((a, b) => dir * (value(a) - value(b)) || order.get(a.id)! - order.get(b.id)!);
  const all = window[0] > window[1] ? ([0, 0, 0, 0, 0] as BandCounts) : windowBands(p, window[0], window[1], null, major);
  return [{ id: ALL_ROW, label: "All policy areas", bands: all, total: sumBands(all) }, ...rows];
}

export const bandShare = (r: Pick<GroupRow, "bands" | "total">, band: number): number => (r.total ? r.bands[band]! / r.total : 0);

/** The decade a Congress opened in (93rd = 1970). */
export const decadeOfCongress = (congress: number): number => Math.floor(openYear(congress) / 10) * 10;

export interface DecadeCell {
  decade: number;
  bands: BandCounts;
  total: number;
}

/** Decades the data spans, ascending. */
export const decadesOf = (p: LawsPayload): number[] => [...new Set(p.congresses.map(decadeOfCongress))];

/** One topic group's laws (`ALL_ROW` = every group) summed by decade, over every Congress (not only the window). */
export function decadeCells(p: LawsPayload, id: string, major: boolean): DecadeCell[] {
  const groups = id === ALL_ROW ? null : new Set([id]);
  return decadesOf(p).map((decade) => {
    const bands: BandCounts = [0, 0, 0, 0, 0];
    p.congresses.forEach((c, ci) => {
      if (decadeOfCongress(c) === decade) cellFor(p, ci, groups, major).bands.forEach((n, k) => (bands[k]! += n));
    });
    return { decade, bands, total: sumBands(bands) };
  });
}

/** The number a heatmap cell shows for a measure. */
export const heatCount = (c: DecadeCell, band: number | null): number => (band === null ? c.total : c.bands[band]!);

/** The top of the colour scale: the busiest decade of any one group (`ALL_ROW` has its own, being several times any group). */
export function heatMax(p: LawsPayload, id: string, band: number | null, major: boolean): number {
  const ids = id === ALL_ROW ? [ALL_ROW] : p.groups.map((g) => g.id);
  return Math.max(1, ...ids.flatMap((g) => decadeCells(p, g, major).map((c) => heatCount(c, band))));
}

/** Does any Congress of this decade have a second year inside the years window? */
export const decadeInWindow = (p: LawsPayload, decade: number, window: readonly [number, number]): boolean =>
  p.congresses.some((c, ci) => decadeOfCongress(c) === decade && ci >= window[0] && ci <= window[1]);

/** Is the topic group `id` selected by the policy-area filter? */
export function groupSelected(p: LawsPayload, filter: string, id: string): boolean {
  const g = filterGroups(p, filter);
  return g !== null && g.has(id) && g.size === 1;
}

/** Does the policy-area filter keep topic group `id` (everything, or the group / groups it names)? */
export function groupInFilter(p: LawsPayload, filter: string, id: string): boolean {
  const g = filterGroups(p, filter);
  return g === null || g.has(id);
}
