import { median as d3median } from "d3-array";
import type { FinancialDisclosure } from "./entities";
import { congressStartYear } from "./congress-types";
import type { Chamber } from "./chamber";
import { filingRange } from "./wealth-bands";

/**
 * Pure net-worth data-shaping logic — no file I/O, no `"server-only"` (unlike
 * `lib/wealth-data.ts`, which reads `pipeline/output/*.json` and is the thing
 * pages actually import). Split out so this logic is unit-testable directly,
 * the same way `lib/congress-data.ts` (server-only, untested) delegates its
 * pure math to files like `lib/party-palette.ts` (tested). See
 * docs/NET_WORTH_METHODOLOGY.md for the policy this implements.
 */

export const FIRST_USABLE_YEAR = 2013;
export const LAST_USABLE_YEAR = 2025;
/** `|annualized rate| >` this is pinned to the scatter's axis edge. */
export const PINNED_OUTLIER_THRESHOLD = 15_000_000;
/** A member's latest usable year must be at least this to appear in a list. */
export const LIST_ELIGIBLE_FROM_YEAR = 2023;

/** `series[i]` <-> this calendar year + i. */
export const SERIES_YEARS: readonly number[] = Array.from(
  { length: LAST_USABLE_YEAR - FIRST_USABLE_YEAR + 1 },
  (_, i) => FIRST_USABLE_YEAR + i,
);

/**
 * A row is "usable" for every wealth aggregate (chart, list, scatter) iff it
 * parsed with high confidence, isn't flagged for review, and covers a year in
 * the pipeline's stable 2013–2025 window (2026 rows are placeholders).
 */
export function isUsableRow(row: FinancialDisclosure): boolean {
  return (
    row.parse_confidence === "high" &&
    !row.needs_review &&
    row.year >= FIRST_USABLE_YEAR &&
    row.year <= LAST_USABLE_YEAR
  );
}

export interface WealthRange {
  lo: number | null;
  hi: number | null;
  openEnded: boolean;
  /** True when the filing's bands can't be turned into a range at all (an
   *  unrecognized/mangled label). The member's `net_worth` midpoint is still
   *  available in this case — only the range is unknown. */
  unavailable: boolean;
}

/** One usable filing year, already reduced to what the UI needs. */
export interface WealthYearPoint {
  year: number;
  /** The pipeline's `net_worth` for this (member, year) — the midpoint series
   *  value. Never null on a usable row. */
  midpoint: number;
  range: WealthRange;
}

export interface WealthMember {
  bioguideId: string;
  name: string;
  chamber: Chamber;
  state: string;
  /** House only; `null` for at-large seats and all Senate seats. */
  district: number | null;
  caucus: "Democrat" | "Republican";
  /** Calendar year the member's first Congress (either chamber) convened. */
  entryYear: number;
  /** Whether an official photo is committed — see lib/member-photo.ts. */
  hasPhoto: boolean;
  /** One entry per usable year 2013–2025, in order; empty years omitted. */
  points: WealthYearPoint[];
  /** Dense 2013–2025 midpoint series, `null` for years with no usable filing —
   *  the exact shape sparklines/the scatter index into without re-deriving
   *  gaps. */
  series: (number | null)[];
}

function toRange(row: FinancialDisclosure): WealthRange {
  const r = filingRange(row.asset_band_counts, row.liability_band_counts);
  return { lo: r.lo, hi: r.hi, openEnded: r.openEnded, unavailable: r.unavailable };
}

export interface CurrentMemberFacts {
  name: string;
  chamber: Chamber;
  state: string;
  district: number | null;
  caucus: string;
  hasPhoto: boolean;
}

/**
 * Joins usable financial-disclosure rows onto the current-member roster.
 * `currentMembers` and `firstCongressByMember` are read from `terms.json` /
 * `legislators.json` by the caller (`lib/wealth-data.ts`'s `getCurrentMemberIndex`
 * wrapper) — this function does no file I/O, so it's directly unit-testable.
 * Never drops a current member, even one with zero filing rows.
 */
export function buildWealthMembers(
  allRows: FinancialDisclosure[],
  currentMembers: Map<string, CurrentMemberFacts>,
  firstCongressByMember: Map<string, number>,
): WealthMember[] {
  const byMember = new Map<string, FinancialDisclosure[]>();
  for (const row of allRows) {
    if (!isUsableRow(row)) continue;
    const list = byMember.get(row.bioguide_id);
    if (list) list.push(row);
    else byMember.set(row.bioguide_id, [row]);
  }

  const out: WealthMember[] = [];
  for (const [bioguideId, m] of currentMembers) {
    if (m.caucus !== "Democrat" && m.caucus !== "Republican") {
      throw new Error(
        `wealth-data: current member ${bioguideId} (${m.name}) has caucus ${JSON.stringify(m.caucus)}, expected "Democrat" or "Republican"`,
      );
    }

    const memberRows = (byMember.get(bioguideId) ?? []).sort(
      (a, b) => a.year - b.year,
    );
    const points: WealthYearPoint[] = memberRows.map((row) => ({
      year: row.year,
      midpoint: row.net_worth ?? 0,
      range: toRange(row),
    }));
    const midpointByYear = new Map(points.map((p) => [p.year, p.midpoint]));
    const series = SERIES_YEARS.map((y) => midpointByYear.get(y) ?? null);

    const fc = firstCongressByMember.get(bioguideId);
    if (fc === undefined) {
      throw new Error(
        `wealth-data: current member ${bioguideId} (${m.name}) has no terms.json row`,
      );
    }

    out.push({
      bioguideId,
      name: m.name,
      chamber: m.chamber,
      state: m.state,
      district: m.district,
      caucus: m.caucus,
      entryYear: congressStartYear(fc),
      hasPhoto: m.hasPhoto,
      points,
      series,
    });
  }

  out.sort((a, b) => a.bioguideId.localeCompare(b.bioguideId));
  return out;
}

// --- derived helpers ---------------------------------------------------

/** Members with at least two usable years — the scatter/rate cohort. */
export function wealthCohort(members: WealthMember[]): WealthMember[] {
  return members.filter((m) => m.points.length >= 2);
}

/** `(last midpoint - first midpoint) / (last usable year - first usable year)`.
 *  Requires `member.points.length >= 2` (undefined rate otherwise). */
export function annualizedRate(member: WealthMember): number {
  const first = member.points[0];
  const last = member.points[member.points.length - 1];
  return (last.midpoint - first.midpoint) / (last.year - first.year);
}

export function isPinnedOutlier(rate: number): boolean {
  return Math.abs(rate) > PINNED_OUTLIER_THRESHOLD;
}

/** Latest usable year, or `null` if the member has none. */
export function latestUsableYear(member: WealthMember): number | null {
  if (member.points.length === 0) return null;
  return member.points[member.points.length - 1].year;
}

/** Eligible for the highest/lowest lists: a usable filing from 2023 or later. */
export function isListEligible(member: WealthMember): boolean {
  const y = latestUsableYear(member);
  return y !== null && y >= LIST_ELIGIBLE_FROM_YEAR;
}

/**
 * Flagged in the profile/hover-card gap note (section 6 of the plan): the
 * member's usable data starts meaningfully later than when they entered
 * Congress, as opposed to just trailing the pipeline's 2013 floor or the
 * one-year lag between taking office and filing a first annual report.
 */
export function hasDataGap(member: WealthMember): boolean {
  if (member.points.length === 0) return false;
  const first = member.points[0].year;
  const entry = member.entryYear;
  if (entry < FIRST_USABLE_YEAR) return first > FIRST_USABLE_YEAR;
  return first - entry >= 2;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  return d3median(values) ?? null;
}

export interface PartyMedian {
  median: number | null;
  count: number;
}

/** Median net worth by caucus for one year, over the given member pool. */
export function partyMedians(
  members: WealthMember[],
  year: number,
): { dem: PartyMedian; rep: PartyMedian } {
  const byCaucus = (caucus: "Democrat" | "Republican"): PartyMedian => {
    const values = members
      .filter((m) => m.caucus === caucus)
      .map((m) => m.series[year - FIRST_USABLE_YEAR])
      .filter((v): v is number => v !== null && v !== undefined);
    return { median: median(values), count: values.length };
  };
  return { dem: byCaucus("Democrat"), rep: byCaucus("Republican") };
}

// --- compact client payload ---------------------------------------------
//
// `/congress/wealth` filters entirely client-side (chamber, state, search),
// so every current member's data ships in one static JSON asset. A plain
// array of `WealthMember`-shaped objects repeats every key name ~500 times;
// serializing each member as a positional tuple instead avoids that (JSON
// arrays carry no key names), which is most of the gap between the ~500-row
// raw size and the 130 KB target. Keep this file the only place that knows
// the tuple's column order — everything else reads through `WealthMember` /
// `WealthClientMember`.

/** `0` closed range, `1` open-ended (lo known, hi unknown), `2` unavailable
 *  (unrecognized band, no range at all), `null` no usable filing at all. */
export type WealthRangeStatus = 0 | 1 | 2 | null;

export type WealthPayloadRow = [
  bioguideId: string,
  name: string,
  chamber: Chamber,
  state: string,
  district: number | null,
  caucus: "D" | "R",
  entryYear: number,
  series: (number | null)[],
  latestRangeStatus: WealthRangeStatus,
  latestRangeLo: number | null,
  latestRangeHi: number | null,
];

function rangeStatus(range: WealthRange): Exclude<WealthRangeStatus, null> {
  if (range.unavailable) return 2;
  if (range.openEnded) return 1;
  return 0;
}

export function toWealthPayload(members: WealthMember[]): WealthPayloadRow[] {
  return members.map((m) => {
    const latest = m.points[m.points.length - 1];
    return [
      m.bioguideId,
      m.name,
      m.chamber,
      m.state,
      m.district,
      m.caucus === "Democrat" ? "D" : "R",
      m.entryYear,
      m.series,
      latest ? rangeStatus(latest.range) : null,
      latest?.range.lo ?? null,
      latest?.range.hi ?? null,
    ];
  });
}

export interface WealthClientMember {
  bioguideId: string;
  name: string;
  chamber: Chamber;
  state: string;
  district: number | null;
  caucus: "Democrat" | "Republican";
  entryYear: number;
  series: (number | null)[];
  latestRangeStatus: WealthRangeStatus;
  latestRangeLo: number | null;
  latestRangeHi: number | null;
}

export function fromWealthPayload(
  rows: WealthPayloadRow[],
): WealthClientMember[] {
  return rows.map(
    ([
      bioguideId,
      name,
      chamber,
      state,
      district,
      caucus,
      entryYear,
      series,
      latestRangeStatus,
      latestRangeLo,
      latestRangeHi,
    ]) => ({
      bioguideId,
      name,
      chamber,
      state,
      district,
      caucus: caucus === "D" ? ("Democrat" as const) : ("Republican" as const),
      entryYear,
      series,
      latestRangeStatus,
      latestRangeLo,
      latestRangeHi,
    }),
  );
}
