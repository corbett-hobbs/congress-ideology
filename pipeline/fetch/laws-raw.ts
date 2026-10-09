import type { RawAction, RawCommittee, RawLaw } from "../../lib/laws-entities";

/**
 * Helpers both Laws fetchers share, so a law reads the same whether it came from GovInfo Bill Status XML or
 * the Congress.gov API: which actions are kept, which summary is kept, how the date and the law id are formed.
 */

/** Keep the enacted summary's HTML up to this many characters; Session 3 reads the first sentence. */
export const SUMMARY_CAP = 3000;
/** Keep an action's text up to this many characters. */
export const ACTION_TEXT_CAP = 280;

/** Action types that can carry passage, conference, concurrence, veto or enactment. */
const KEPT_TYPES = new Set(["ResolvingDifferences", "BecameLaw", "Veto", "President"]);
/** A Floor action is kept only when it reads like a vote or a passage, not procedure ("Motion to reconsider laid on the table"). */
const FLOOR_RELEVANT = /pass|agree|concur|recede|disagree|vote|yea|nay|roll|veto|reject|fail|conference|unanimous|without objection|suspend/i;

export const isoDay = (s: string | null | undefined): string | null => {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s ?? "");
  return m ? m[1]! : null;
};

export const lawId = (congress: number, number: number) => `${congress}-pub-${number}`;

/** Parse "118-90" into [118, 90]; null when it is not a plain public-law citation. */
export function parsePublicLawNumber(s: string): [number, number] | null {
  const m = /^(\d+)-(\d+)$/.exec(s.trim());
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** Should this action be kept? `hasVotes` = the source attached a recorded-vote reference to it. */
export function keepAction(type: string, text: string, hasVotes: boolean): boolean {
  if (hasVotes) return true;
  if (KEPT_TYPES.has(type)) return true;
  return type === "Floor" && FLOOR_RELEVANT.test(text);
}

const trimText = (s: string) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > ACTION_TEXT_CAP ? t.slice(0, ACTION_TEXT_CAP - 1) + "…" : t;
};

/** Build a slimmed, de-duplicated, date-ordered action list (oldest first; ties keep source order). */
export function slimActions(actions: RawAction[]): RawAction[] {
  const seen = new Set<string>();
  const out: RawAction[] = [];
  for (const a of actions) {
    const text = trimText(a.text);
    const key = `${a.date}|${a.type}|${a.src ?? ""}|${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...a, text });
  }
  return out
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (x.a.date < y.a.date ? -1 : x.a.date > y.a.date ? 1 : x.i - y.i))
    .map((x) => x.a);
}

/** Dates of every `BecameLaw` action, falling back to a President action that says "Became Public Law" when none is typed BecameLaw. */
export function becameLawDates(actions: { date: string; type: string; text: string }[]): string[] {
  const typed = actions.filter((a) => a.type === "BecameLaw").map((a) => a.date);
  const dates = typed.length > 0 ? typed : actions.filter((a) => a.type === "President" && /became public law/i.test(a.text)).map((a) => a.date);
  return [...new Set(dates)].sort();
}

export interface SummaryVersion {
  stage: string | null;
  date: string | null;
  html: string;
}

/** The CRS summary of the enacted version ("Public Law"), else the latest version by date. Capped. */
export function pickSummary(versions: SummaryVersion[]): { html: string; stage: string | null } | null {
  const usable = versions.filter((v) => v.html.trim() !== "");
  if (usable.length === 0) return null;
  const enacted = usable.filter((v) => /public law/i.test(v.stage ?? ""));
  const pool = enacted.length > 0 ? enacted : usable;
  const best = [...pool].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")).at(-1)!;
  const html = best.html.trim();
  return { html: html.length > SUMMARY_CAP ? html.slice(0, SUMMARY_CAP) : html, stage: best.stage };
}

/** Build the RawLaw fields shared by a bill's laws (everything except the law number). */
export type BillFields = Omit<RawLaw, "law_id" | "number" | "congress"> & { congress: number };

/** Congress number for a calendar date (the 119th starts 2025-01-03). */
export const congressForDate = (d: Date): number => Math.floor((d.getUTCFullYear() - 1789) / 2) + 1;

/** Serialise one Congress's raw file with one law per line, so a `git diff` shows which laws changed. */
export function formatRawCongress(file: { laws: unknown[] } & Record<string, unknown>): string {
  const { laws, ...head } = file;
  return `{\n${Object.entries(head)
    .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join("\n")}\n"laws": [\n${laws.map((l) => JSON.stringify(l)).join(",\n")}\n]\n}\n`;
}

interface LooseActivity {
  name?: string | null;
  date?: string | null;
}
interface LooseCommittee {
  code?: string | null;
  name?: string | null;
  chamber?: string | null;
  activities?: LooseActivity[];
  subcommittees?: LooseCommittee[];
}

const CODE = /^[a-z]{4}\d{2}$/;
const cleanActivities = (a: LooseActivity[] | undefined) =>
  (a ?? []).flatMap((x) => {
    const name = (x.name ?? "").replace(/\s+/g, " ").trim();
    return name === "" ? [] : [{ name, date: isoDay(x.date) }];
  });

/** Committees as both sources give them -> the stored shape: lower-case codes, no entry without a valid code, a stable order. */
export function normaliseCommittees(list: LooseCommittee[]): RawCommittee[] {
  return list
    .flatMap((c) => {
      const code = (c.code ?? "").toLowerCase();
      if (!CODE.test(code)) return [];
      const subs = (c.subcommittees ?? []).flatMap((s) => {
        const sc = (s.code ?? "").toLowerCase();
        return CODE.test(sc) ? [{ code: sc, name: (s.name ?? "").trim(), activities: cleanActivities(s.activities) }] : [];
      });
      return [{ code, name: (c.name ?? "").trim(), chamber: c.chamber ?? null, activities: cleanActivities(c.activities), subcommittees: subs.sort((a, b) => a.code.localeCompare(b.code)) }];
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}
