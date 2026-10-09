import type { CommitteeBillRow } from "./committee-bills-entities";
import type { BillSponsorCell, CommitteeBillsPayload, Stage } from "./committee-bills-types";

/**
 * Pure shaping for the legislation card on a committee page: the stage a bill has reached, the page's filters, the counts the
 * tiles and the flow chart read, the monthly columns and the flow's geometry. No file I/O, no React; unit-tested.
 *
 * A bill's stage is read from its dated steps, never stored:
 *   6 became law · 5 passed this committee's chamber · 4 reported or discharged · 3 marked up · 2 had a hearing · 1 referred only.
 * The first three are the committee's own; 5 and 6 belong to the bill. "Stopped" = the furthest stage reached; "reached" = at
 * least that stage. A step the source never logged is not inferred: a bill marked up with no hearing recorded is stage 3.
 */

export interface StageInfo {
  k: Stage;
  label: string;
  /** A name short enough for a narrow chart. */
  short: string;
  hint: string;
}

export const STAGES: readonly StageInfo[] = [
  { k: 1, label: "Referred", short: "Referred", hint: "Referred, nothing else recorded" },
  { k: 2, label: "Hearing", short: "Hearing", hint: "A hearing the bill was on" },
  { k: 3, label: "Markup", short: "Markup", hint: "Marked up, or ordered to be reported" },
  { k: 4, label: "Out of committee", short: "Out", hint: "Reported to the floor, or discharged" },
  { k: 5, label: "Passed chamber", short: "Passed", hint: "Passed this committee's chamber" },
  { k: 6, label: "Became law", short: "Law", hint: "Signed into law" },
];
export const STAGE_KEYS: readonly Stage[] = [1, 2, 3, 4, 5, 6];
export const stageVar = (k: Stage): string => `var(--stage-${k})`;

/** Has the bill passed the chamber this committee sits in? A joint committee counts either. */
export function passedHere(g: CommitteeBillRow["g"], chamber: CommitteeBillsPayload["chamber"]): boolean {
  if (!g) return false;
  return chamber === "house" ? g[0] !== null : chamber === "senate" ? g[1] !== null : g[0] !== null || g[1] !== null;
}

export function stageOf(r: CommitteeBillRow, chamber: CommitteeBillsPayload["chamber"]): Stage {
  if (r.l) return 6;
  if (passedHere(r.g, chamber)) return 5;
  if (r.p || r.d) return 4;
  if (r.m) return 3;
  if (r.h) return 2;
  return 1;
}

const BILL_LABEL = { hr: "H.R.", s: "S.", hjres: "H.J.Res.", sjres: "S.J.Res." } as const;
export const billLabel = (r: Pick<CommitteeBillRow, "b" | "n">): string => `${BILL_LABEL[r.b]} ${r.n}`;
const BILL_SLUG = { hr: "house-bill", s: "senate-bill", hjres: "house-joint-resolution", sjres: "senate-joint-resolution" } as const;
export const congressGovUrl = (r: Pick<CommitteeBillRow, "b" | "n">, congress: number): string => {
  const v = congress % 100;
  const ord = v >= 11 && v <= 13 ? "th" : (["th", "st", "nd", "rd"][congress % 10] ?? "th");
  return `https://www.congress.gov/bill/${congress}${ord}-congress/${BILL_SLUG[r.b]}/${r.n}`;
};

const DAY = 86_400_000;
export const daysBetween = (from: string, to: string): number => Math.round((Date.parse(to) - Date.parse(from)) / DAY);
/** A bill waiting at least this long (and not past markup) is flagged as waiting. */
export const WAITING_FROM_DAYS = 30;

export interface PreparedBill {
  row: CommitteeBillRow;
  stage: Stage;
  /** All current cosponsors. */
  cosponsors: number;
  /** The sponsor and at least one cosponsor of the other party (an independent sponsor: both parties among the cosponsors). */
  bipartisan: boolean;
  /** `YYYY-MM` of the referral. */
  month: string;
  /** Latest date among this committee's own steps (referral, hearing, markup, report, discharge). */
  last: string;
  /** Days since `last`, for a bill not past markup and waiting at least `WAITING_FROM_DAYS`; else null. */
  waiting: number | null;
  /** Lower-case text the search matches: bill, title, sponsor, policy area, law number. */
  haystack: string;
}

export function isBipartisan(sponsorParty: string | undefined, c: CommitteeBillRow["c"]): boolean {
  if (!c) return false;
  if (sponsorParty === "R") return c[0] > 0;
  if (sponsorParty === "D") return c[1] > 0;
  return c[0] > 0 && c[1] > 0;
}

export function prepareBills(p: Pick<CommitteeBillsPayload, "rows" | "chamber" | "dataThrough" | "areas" | "sponsors">): PreparedBill[] {
  return p.rows.map((row) => {
    const stage = stageOf(row, p.chamber);
    const sponsor: BillSponsorCell | undefined = row.s === undefined ? undefined : p.sponsors[row.s];
    const last = [row.r, row.h, row.m, row.p, row.d].filter((d): d is string => !!d).sort().at(-1)!;
    const waited = daysBetween(last, p.dataThrough);
    return {
      row,
      stage,
      cosponsors: row.c ? row.c[0] + row.c[1] + row.c[2] : 0,
      bipartisan: isBipartisan(sponsor?.[2], row.c),
      month: row.r.slice(0, 7),
      last,
      waiting: stage <= 3 && waited >= WAITING_FROM_DAYS ? waited : null,
      haystack: [billLabel(row), row.t, sponsor?.[0] ?? "", row.a === undefined ? "" : (p.areas[row.a] ?? ""), row.l ?? "", row.y ? `${row.y[0]} ${billLabel({ b: row.y[1], n: row.y[2] })}` : ""].join(" ").toLowerCase(),
    };
  });
}

export interface BillFilter {
  stage: { k: Stage; mode: "stop" | "reach" } | null;
  /** Sponsor's party. */
  party: "" | "D" | "R";
  bipartisan: boolean;
  /** Index into the shard's `areas`. */
  area: number | null;
  /** Index into the shard's `subs`. */
  sub: number | null;
  /** `YYYY-MM` of the referral. */
  month: string | null;
  query: string;
}

export const NO_FILTER: BillFilter = { stage: null, party: "", bipartisan: false, area: null, sub: null, month: null, query: "" };

export function matchesBill(b: PreparedBill, f: BillFilter, sponsorParty: (b: PreparedBill) => string, skip?: "stage" | "month"): boolean {
  if (skip !== "stage" && f.stage) {
    if (f.stage.mode === "stop" ? b.stage !== f.stage.k : b.stage < f.stage.k) return false;
  }
  if (skip !== "month" && f.month && b.month !== f.month) return false;
  if (f.party && sponsorParty(b) !== f.party) return false;
  if (f.bipartisan && !b.bipartisan) return false;
  if (f.area !== null && b.row.a !== f.area) return false;
  if (f.sub !== null && !(b.row.u ?? []).includes(f.sub)) return false;
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean);
  return words.every((w) => b.haystack.includes(w));
}

/** The filter the card applies to the list: `skip` leaves out the stage or the month (the tiles and the month chart ignore their own). */
export function filterBills(list: readonly PreparedBill[], f: BillFilter, sponsors: readonly BillSponsorCell[], skip?: "stage" | "month"): PreparedBill[] {
  const party = (b: PreparedBill) => (b.row.s === undefined ? "" : (sponsors[b.row.s]?.[2] ?? ""));
  return list.filter((b) => matchesBill(b, f, party, skip));
}

export interface StageCounts {
  /** Index 1..6 (0 unused): bills whose furthest stage is this one. */
  stop: number[];
  /** Index 1..6: bills that reached at least this stage. */
  reach: number[];
  /** Of the bills that stopped at stage 4, those discharged rather than reported. */
  discharged: number;
}

export function stageCounts(list: readonly PreparedBill[]): StageCounts {
  const stop = [0, 0, 0, 0, 0, 0, 0];
  let discharged = 0;
  for (const b of list) {
    stop[b.stage]!++;
    if (b.stage === 4 && b.row.d && !b.row.p) discharged++;
  }
  const reach = [0, 0, 0, 0, 0, 0, 0];
  for (let k = 6; k >= 1; k--) reach[k] = stop[k]! + (reach[k + 1] ?? 0);
  return { stop, reach, discharged };
}

export const SORTS = [
  { id: "new", label: "Newest referral" },
  { id: "far", label: "Furthest along" },
  { id: "wait", label: "Waiting longest" },
  { id: "cos", label: "Most cosponsors" },
] as const;
export type SortId = (typeof SORTS)[number]["id"];

const byBill = (a: PreparedBill, b: PreparedBill) => a.row.b.localeCompare(b.row.b) || Number(a.row.n) - Number(b.row.n);

export function sortBills(list: readonly PreparedBill[], id: SortId): PreparedBill[] {
  const out = [...list];
  const cmp: Record<SortId, (a: PreparedBill, b: PreparedBill) => number> = {
    new: (a, b) => b.row.r.localeCompare(a.row.r) || byBill(a, b),
    far: (a, b) => b.stage - a.stage || b.last.localeCompare(a.last) || byBill(a, b),
    wait: (a, b) => (b.waiting ?? -1) - (a.waiting ?? -1) || a.last.localeCompare(b.last) || byBill(a, b),
    cos: (a, b) => b.cosponsors - a.cosponsors || byBill(a, b),
  };
  return out.sort(cmp[id]);
}

// ---- the month chart --------------------------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Mar ’26". */
export const monthLabel = (key: string): string => `${MONTHS[Number(key.slice(5)) - 1]} ’${key.slice(2, 4)}`;

export interface MonthColumn {
  key: string;
  label: string;
  /** "Mar": the axis label on a narrow chart. */
  shortLabel: string;
  total: number;
  /** Bills by furthest stage; keys "1".."6". */
  values: Record<string, number>;
}

/** One column per month from the Congress's first month (or the earliest referral) to the month the data runs through. */
export function monthColumns(list: readonly PreparedBill[], congress: number, dataThrough: string): MonthColumn[] {
  const first = [`${1789 + 2 * (congress - 1)}-01`, ...list.map((b) => b.month)].sort()[0]!;
  const last = [dataThrough.slice(0, 7), ...list.map((b) => b.month)].sort().at(-1)!;
  const keys: string[] = [];
  let [y, m] = [Number(first.slice(0, 4)), Number(first.slice(5))];
  for (;;) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    keys.push(key);
    if (key >= last) break;
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  const by = new Map(keys.map((k) => [k, { key: k, label: monthLabel(k), shortLabel: MONTHS[Number(k.slice(5)) - 1]!, total: 0, values: Object.fromEntries(STAGE_KEYS.map((s) => [String(s), 0])) } as MonthColumn]));
  for (const b of list) {
    const c = by.get(b.month)!;
    c.total++;
    c.values[String(b.stage)]!++;
  }
  return keys.map((k) => by.get(k)!);
}

// ---- the flow (Sankey) -------------------------------------------------------------------------------------------

export interface FlowNode {
  id: string;
  kind: "reach" | "stop";
  stage: Stage;
  value: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface FlowLink {
  id: string;
  /** The stage whose colour the band takes: the step it reaches, or the step it ended at. */
  stage: Stage;
  kind: "reach" | "stop";
  value: number;
  d: string;
}
export interface FlowLayout {
  nodes: FlowNode[];
  links: FlowLink[];
  /** Height the drawing needs under the plot for the bottom labels. */
  labelBand: number;
}

export interface FlowOptions {
  width: number;
  height: number;
  /** Room above the nodes for their labels. */
  top: number;
  /** Room below the lowest node for its label. */
  bottom: number;
  nodeW: number;
  padL: number;
  padR: number;
}

/** A band's smallest drawn thickness, so a handful of bills stays visible. */
export const FLOW_MIN_BAND = 1.5;
export const FLOW_MIN_NODE = 3;

/**
 * The stages left to right: a node for the bills that reached each stage (top), and, one column to the right and low, a node
 * for those that ended at the stage before. Bands run from a reached node to the next reached node and to the node for those
 * that ended there; widths are proportional to counts (drawn at least `FLOW_MIN_BAND`).
 */
export function flowLayout(counts: Pick<StageCounts, "stop" | "reach">, o: FlowOptions): FlowLayout {
  const total = counts.reach[1] ?? 0;
  const plotH = o.height - o.top - o.bottom;
  const scale = total > 0 ? (plotH - 20) / total : 0;
  const col = (k: number) => o.padL + (k - 1) * ((o.width - o.padL - o.padR - o.nodeW) / 5);
  const th = (v: number) => (v > 0 ? Math.max(v * scale, FLOW_MIN_NODE) : 0);
  const bw = (v: number) => (v > 0 ? Math.max(v * scale, FLOW_MIN_BAND) : 0);
  const floor = o.top + plotH;
  const nodes: FlowNode[] = [];
  const links: FlowLink[] = [];
  for (const k of STAGE_KEYS) nodes.push({ id: `reach-${k}`, kind: "reach", stage: k, value: counts.reach[k] ?? 0, x: col(k), y: o.top, w: o.nodeW, h: th(counts.reach[k] ?? 0) });
  const ribbon = (x0: number, y0: number, x1: number, y1: number, w: number) => {
    const mid = (x0 + x1) / 2;
    return `M${x0},${y0} C${mid},${y0} ${mid},${y1} ${x1},${y1} L${x1},${y1 + w} C${mid},${y1 + w} ${mid},${y0 + w} ${x0},${y0 + w} Z`;
  };
  for (const k of [1, 2, 3, 4, 5] as const) {
    const x0 = col(k) + o.nodeW;
    const x1 = col(k + 1);
    const onward = counts.reach[k + 1] ?? 0;
    const w1 = bw(onward);
    if (w1 > 0) links.push({ id: `reach-${k}-${k + 1}`, stage: (k + 1) as Stage, kind: "reach", value: onward, d: ribbon(x0, o.top, x1, o.top, w1) });
    const ended = counts.stop[k] ?? 0;
    if (ended > 0) {
      const w2 = bw(ended);
      const h = th(ended);
      const y = floor - h;
      nodes.push({ id: `stop-${k}`, kind: "stop", stage: k, value: ended, x: x1, y, w: o.nodeW, h });
      links.push({ id: `stop-${k}`, stage: k, kind: "stop", value: ended, d: ribbon(x0, o.top + w1, x1, y, w2) });
    }
  }
  return { nodes, links, labelBand: o.bottom };
}

// ---- one bill's timeline -----------------------------------------------------------------------------------------

export interface TimelineStep {
  label: string;
  /** `YYYY-MM-DD`, or null when the source has no date for a step it records (or none recorded at all, see `done`). */
  date: string | null;
  done: boolean;
  stage: Stage;
  /** A vote or a citation: "24–11 vote", "H. Rept. 119-12". */
  note?: string;
}

const orderedNote = (q: CommitteeBillRow["q"]): string | undefined =>
  q === undefined ? undefined : q === "voice" ? "voice vote" : q === "unanimous" ? "unanimous consent" : `${q[0]}–${q[1]} vote`;

export function timelineSteps(r: CommitteeBillRow, chamber: CommitteeBillsPayload["chamber"]): TimelineStep[] {
  const here = chamber === "senate" ? "Senate" : "House";
  const passed = chamber === "senate" ? (r.g?.[1] ?? null) : chamber === "house" ? (r.g?.[0] ?? null) : (r.g?.[0] ?? r.g?.[1] ?? null);
  const out: TimelineStep[] = [
    { label: "Referred", date: r.r, done: true, stage: 1 },
    { label: "Hearing", date: r.h ?? null, done: !!r.h, stage: 2 },
    { label: "Markup or ordered reported", date: r.m ?? null, done: !!r.m, stage: 3, note: orderedNote(r.q) },
  ];
  if (r.d && !r.p) out.push({ label: "Discharged", date: r.d, done: true, stage: 4 });
  else out.push({ label: "Reported", date: r.p ?? null, done: !!r.p, stage: 4, note: r.e?.join(", ") });
  if (r.k) out.push({ label: "Placed on a calendar", date: r.k, done: true, stage: 4 });
  out.push({ label: `Passed the ${here}`, date: passed, done: passed !== null, stage: 5 });
  out.push({ label: "Became law", date: r.w ?? null, done: !!r.l, stage: 6, note: r.l ? `Pub. L. ${r.l.replace("-", "–")}` : undefined });
  return out;
}
