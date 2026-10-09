import {
  CommitteeBillsDataError,
  type CommitteeBillRow,
  type CommitteeBillsShard,
  type RawBill,
  type RawBillAction,
} from "../../lib/committee-bills-entities";
import type { RawCommittee } from "../../lib/laws-entities";

/**
 * Committee-legislation transform, pure part: one raw bill digest -> one row per committee it was referred to, rows grouped
 * into one shard per committee. The stage a bill has reached is NOT stored: the rows carry the dated events and
 * `lib/committee-bills-derive.ts` reads the stage from them (so the rule can change without a pipeline run).
 * Gates and file writing: `committee-bills-run.ts`. See docs/COMMITTEE_BILLS_METHODOLOGY.md.
 */

export interface KnownCommittee {
  committee_id: string;
  chamber: "house" | "senate" | "joint";
}
export interface KnownSubcommittee {
  subcommittee_id: string;
  parent_committee_id: string;
  name: string;
}

/** `hsii00` -> `HSII`: the join to `committees.json`. */
export const committeeIdOf = (code: string): string => code.slice(0, 4).toUpperCase();
/** `hsii13` -> `HSII13`: the join to `subcommittees.json`. */
export const subcommitteeIdOf = (code: string): string => code.toUpperCase();
const isFull = (code: string) => code.endsWith("00");

const VOTE_TALLY = /(?:yeas? and nays?|roll call vote|recorded vote|a record vote)[^:\d]*:?\s*(\d+)\s*-\s*(\d+)/i;
const ORDERED = /ordered to be reported|ordered reported/i;
const MARKUP = /mark-?up/i;

/** How a committee ordered a bill reported, from the action text; null when the text says nothing about it. */
export function orderedVote(text: string): CommitteeBillRow["q"] | null {
  if (!ORDERED.test(text)) return null;
  const tally = VOTE_TALLY.exec(text);
  if (tally) return [Number(tally[1]), Number(tally[2])];
  if (/voice vote/i.test(text)) return "voice";
  if (/unanimous consent/i.test(text)) return "unanimous";
  return null;
}

const earliest = (dates: (string | null | undefined)[]): string | undefined => {
  const ds = dates.filter((d): d is string => !!d).sort();
  return ds[0];
};

/** Fold repeat entries for one committee (a bill re-referred lists it twice) into one. */
function mergeByCode(list: readonly RawCommittee[]): Map<string, RawCommittee> {
  const out = new Map<string, RawCommittee>();
  for (const c of list) {
    const prev = out.get(c.code);
    if (!prev) {
      out.set(c.code, { ...c, subcommittees: c.subcommittees.map((s) => ({ ...s })) });
      continue;
    }
    prev.activities.push(...c.activities);
    for (const s of c.subcommittees) {
      const ps = prev.subcommittees.find((x) => x.code === s.code);
      if (ps) ps.activities.push(...s.activities);
      else prev.subcommittees.push({ ...s });
    }
  }
  return out;
}

/** Bill-level facts every row of a bill shares. */
export function billFacts(b: RawBill): { house: string | null; senate: string | null; vetoed: boolean; calendar: string | undefined; signed: string | undefined } {
  const first = (re: RegExp) => earliest(b.actions.filter((a) => re.test(a.text)).map((a) => a.date)) ?? null;
  // A law number is assigned before the signing; like the Laws track, a bill is enacted only once a "became law" action exists.
  const signed = b.laws.length > 0 ? earliest(b.actions.filter((a) => a.type === "BecameLaw" || (a.type === "President" && /became public law/i.test(a.text))).map((a) => a.date)) : undefined;
  return {
    house: first(/passed\/agreed to in house/i),
    senate: first(/passed\/agreed to in senate/i),
    vetoed: b.actions.some((a) => a.type === "Veto"),
    calendar: earliest(b.actions.filter((a) => a.type === "Calendars").map((a) => a.date)),
    signed,
  };
}

/** The part of a bill that belongs to one committee: its dated steps. */
export interface CommitteeEvents {
  r: string;
  h?: string;
  m?: string;
  p?: string;
  d?: string;
  k?: string;
  q?: CommitteeBillRow["q"];
  /** Subcommittee codes the bill was referred to or acted on in. */
  subs: string[];
}

export function committeeEvents(b: RawBill, c: RawCommittee, calendar: string | undefined): CommitteeEvents {
  const all = [...c.activities, ...c.subcommittees.flatMap((s) => s.activities)];
  const named = (re: RegExp) => earliest(all.filter((a) => re.test(a.name)).map((a) => a.date));
  const codes = new Set([c.code, ...c.subcommittees.map((s) => s.code)]);
  const mine = b.actions.filter((a: RawBillAction) => a.committees.some((x) => codes.has(x)));
  const steps = mine.filter((a) => MARKUP.test(a.text) || ORDERED.test(a.text));
  const ordered = mine.filter((a) => ORDERED.test(a.text)).sort((x, y) => x.date.localeCompare(y.date));
  const orderedWithHow = ordered.map((a) => ({ a, q: orderedVote(a.text) })).find((x) => x.q !== null);
  const r = named(/^referred/i) ?? b.introduced ?? "";
  const p = named(/^reported/i);
  const d = named(/^discharged/i);
  return {
    r,
    h: named(/^hearings?/i),
    m: earliest([named(/^markup/i), ...steps.map((a) => a.date)]),
    p,
    d,
    k: p || d ? calendar : undefined,
    q: orderedWithHow?.q ?? undefined,
    subs: c.subcommittees.map((s) => s.code),
  };
}

/** "Rep. Biggs, Andy [R-AZ-5]" -> ["Biggs, Andy", "R", "AZ-5"]; null when the source's wording is not that. */
export function parseSponsorName(raw: string): { name: string; party: string; place: string } | null {
  const m = /^(?:Rep|Sen|Del|Rescom)\.\s+(.+?)\s+\[([A-Z])-([A-Z]{2})(?:-(.+))?\]$/.exec(raw.trim());
  if (!m) return null;
  const district = m[4];
  return { name: m[1]!, party: m[2]!, place: district && !/^at large$/i.test(district) ? `${m[3]}-${district}` : m[3]! };
}

const AREA_NONE = -1;

export interface BuildReport {
  bills: number;
  rows: number;
  /** Raw committee codes that are not in `committees.json` (retired, select, joint ...): their rows are not written. */
  unmapped_committees: Record<string, { name: string; chamber: string | null; rows: number }>;
  unmapped_subcommittees: Record<string, { name: string; rows: number }>;
  unparsed_sponsor_names: number;
  /** Rows for bills with no public law of their own whose latest action says they became one (enacted inside another bill). */
  enacted_elsewhere: number;
  events_before_introduction: number;
  rows_by_committee: Record<string, number>;
  law_numbers: string[];
}

/** The bill a public law is, as the Laws track holds it (`119-37` -> H.R. 5371). */
export interface EnactingBill {
  b: CommitteeBillRow["b"];
  n: string;
}

/**
 * A bill with no public law of its own whose latest action reads "Became Public Law No: 119-37." was enacted inside another bill
 * (an omnibus, or a companion the law carried). Returns that law and the bill that is the law, or undefined. Never for a bill that
 * carries a law itself, and never when the law is not in `vehicles` (the text is then not trusted).
 */
export function enactedElsewhere(b: RawBill, vehicles: ReadonlyMap<string, EnactingBill>): NonNullable<CommitteeBillRow["y"]> | undefined {
  if (b.laws.length > 0 || !b.latest_action) return undefined;
  const m = /Became Public Law No:\s*(\d+-\d+)/i.exec(b.latest_action.text);
  const v = m ? vehicles.get(m[1]!) : undefined;
  if (!m || !v || (v.b === b.type && v.n === b.number)) return undefined;
  return [m[1]!, v.b, v.n];
}

/** Every bill -> a shard per committee (those in `committees`), newest referral first. */
export function buildShards(
  bills: readonly RawBill[],
  congress: number,
  committees: readonly KnownCommittee[],
  subcommittees: readonly KnownSubcommittee[],
  vehicles: ReadonlyMap<string, EnactingBill> = new Map(),
): { shards: Map<string, CommitteeBillsShard>; report: BuildReport } {
  const known = new Map(committees.map((c) => [c.committee_id, c]));
  const subName = new Map(subcommittees.map((s) => [s.subcommittee_id, s.name]));
  const report: BuildReport = { bills: bills.length, rows: 0, unmapped_committees: {}, unmapped_subcommittees: {}, unparsed_sponsor_names: 0, enacted_elsewhere: 0, events_before_introduction: 0, rows_by_committee: {}, law_numbers: [] };
  const work = new Map<string, { areas: Map<string, number>; subs: Map<string, number>; sponsors: Map<string, number>; shard: CommitteeBillsShard }>();
  const laws = new Set<string>();

  for (const b of bills) {
    const facts = billFacts(b);
    if (facts.signed) for (const n of b.laws) laws.add(n);
    const merged = mergeByCode(b.committees.filter((c) => isFull(c.code)));
    // A subcommittee entry can arrive under a code whose parent is listed too; only full committees are rows.
    for (const [code, c] of merged) {
      const id = committeeIdOf(code);
      const meta = known.get(id);
      if (!meta) {
        const u = (report.unmapped_committees[code] ??= { name: c.name, chamber: c.chamber, rows: 0 });
        u.rows++;
        continue;
      }
      let w = work.get(id);
      if (!w) {
        w = { areas: new Map(), subs: new Map(), sponsors: new Map(), shard: { committee_id: id, congress, chamber: meta.chamber, areas: [], subs: [], sponsors: [], rows: [] } };
        work.set(id, w);
      }
      const ev = committeeEvents(b, c, facts.calendar);
      if (b.introduced && ev.r < b.introduced) report.events_before_introduction++;

      const row: CommitteeBillRow = { b: b.type, n: b.number, t: b.title, i: b.introduced ?? ev.r, r: ev.r };
      if (b.sponsor) {
        let si = w.sponsors.get(b.sponsor.id);
        if (si === undefined) {
          const p = parseSponsorName(b.sponsor.name);
          if (!p) report.unparsed_sponsor_names++;
          si = w.shard.sponsors.push([b.sponsor.id, p?.name ?? b.sponsor.name, p?.party ?? "", p?.place ?? ""]) - 1;
          w.sponsors.set(b.sponsor.id, si);
        }
        row.s = si;
      }
      if (b.cosponsors.some((n) => n > 0)) row.c = b.cosponsors;
      if (b.policy_area) {
        let ai = w.areas.get(b.policy_area) ?? AREA_NONE;
        if (ai === AREA_NONE) {
          ai = w.shard.areas.push(b.policy_area) - 1;
          w.areas.set(b.policy_area, ai);
        }
        row.a = ai;
      }
      if (ev.h) row.h = ev.h;
      if (ev.m) row.m = ev.m;
      if (ev.p) row.p = ev.p;
      if (ev.d) row.d = ev.d;
      if (ev.k) row.k = ev.k;
      if (ev.q !== undefined) row.q = ev.q;
      const subIdx: number[] = [];
      for (const sc of ev.subs) {
        const sid = subcommitteeIdOf(sc);
        const parent = subcommittees.find((s) => s.subcommittee_id === sid)?.parent_committee_id;
        if (parent !== id) {
          const u = (report.unmapped_subcommittees[sc] ??= { name: c.subcommittees.find((s) => s.code === sc)?.name ?? "", rows: 0 });
          u.rows++;
          continue;
        }
        let si = w.subs.get(sid);
        if (si === undefined) {
          si = w.shard.subs.push({ id: sid, name: subName.get(sid)! }) - 1;
          w.subs.set(sid, si);
        }
        if (!subIdx.includes(si)) subIdx.push(si);
      }
      if (subIdx.length > 0) row.u = subIdx.sort((x, y) => x - y);
      const others = merged.size - 1;
      if (others > 0) row.x = others;
      if (facts.house || facts.senate) row.g = [facts.house, facts.senate];
      const law = facts.signed ? [...b.laws].sort()[0] : undefined;
      if (law) {
        row.l = law;
        row.w = facts.signed;
      }
      const via = law ? undefined : enactedElsewhere(b, vehicles);
      if (via) {
        row.y = via;
        report.enacted_elsewhere++;
      }
      if (facts.vetoed) row.v = 1;
      if (b.cbo_estimates > 0) row.o = b.cbo_estimates;
      if (b.reports.length > 0) row.e = b.reports;
      const moved = !!(row.h || row.m || row.p || row.d || row.g || row.l || row.y);
      if (moved && b.latest_action) row.z = [b.latest_action.date, b.latest_action.text];
      w.shard.rows.push(row);
      report.rows++;
      report.rows_by_committee[id] = (report.rows_by_committee[id] ?? 0) + 1;
    }
  }
  const shards = new Map<string, CommitteeBillsShard>();
  for (const [id, w] of [...work].sort(([a], [b]) => a.localeCompare(b))) {
    w.shard.rows.sort((a, b) => b.r.localeCompare(a.r) || a.b.localeCompare(b.b) || Number(a.n) - Number(b.n));
    shards.set(id, w.shard);
  }
  report.law_numbers = [...laws].sort();
  return { shards, report };
}

/** The latest dated event anywhere in the shards: what the page says the data runs "through". */
export function dataThrough(bills: readonly RawBill[]): string {
  let max = "";
  const see = (d: string | null | undefined) => {
    if (d && d > max) max = d;
  };
  for (const b of bills) {
    see(b.introduced);
    see(b.latest_action?.date);
    for (const a of b.actions) see(a.date);
    for (const c of b.committees) {
      for (const x of c.activities) see(x.date);
      for (const s of c.subcommittees) for (const x of s.activities) see(x.date);
    }
  }
  return max;
}

/**
 * Gate: the public laws among the bills are exactly the laws the Laws track holds for the Congress. Both read the same
 * Bill Status ZIPs, so any difference means one raw file is stale or a parser changed.
 */
export function checkLaws(lawNumbers: readonly string[], lawsTrack: readonly string[], congress: number): void {
  const mine = new Set(lawNumbers.filter((n) => n.startsWith(`${congress}-`)));
  const theirs = new Set(lawsTrack);
  const missing = [...theirs].filter((n) => !mine.has(n));
  const extra = [...mine].filter((n) => !theirs.has(n));
  if (missing.length > 0 || extra.length > 0) {
    throw new CommitteeBillsDataError(`public laws differ from the Laws track for the ${congress}th Congress. Only in laws.json: ${missing.slice(0, 8).join(", ") || "none"}; only in the bills: ${extra.slice(0, 8).join(", ") || "none"}`);
  }
}
