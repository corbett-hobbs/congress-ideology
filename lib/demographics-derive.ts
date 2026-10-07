import type { Chamber, ChamberView } from "./chamber";
import { CAUCUS_OVERRIDE, CONVENING, FIRST_DEMO_CONGRESS, LAST_TERRITORY_CONGRESS, NON_VOTING_MEMBER_CONGRESS, NON_VOTING_STATES, tenureBand } from "./demographics-entities";
import type { AgeStat, CaucusGroup, DemoCongress, DemoPresident, DemographicsPayload } from "./demographics-types";
import type { Administration } from "./executive-orders-entities";

/** The fields of `legislators.json` / `terms.json` this page reads. */
export interface DemoLegislator {
  bioguide_id: string;
  birthday?: string;
  gender: "M" | "F";
}
export interface DemoTerm {
  bioguide_id: string;
  congress_number: number;
  chamber: Chamber;
  state: string;
  caucus: string | null;
}

/** The day a Congress convened (ISO). */
export function conveningDate(congress: number): string {
  const d = CONVENING[congress];
  if (!d) throw new Error(`demographics: no convening date for the ${congress}th Congress`);
  return d;
}

/** Whole years of age on `onIso` for someone born `birthdayIso` (a birthday on the day counts). */
export function ageOn(birthdayIso: string, onIso: string): number {
  const [by, bm, bd] = birthdayIso.split("-").map(Number);
  const [y, m, d] = onIso.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** Exact age in years on `onIso` (days lived / 365.25), so a median or average can fall between whole years. */
export function ageYearsOn(birthdayIso: string, onIso: string): number {
  const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
  return (day(onIso) - day(birthdayIso)) / 365.25;
}

/** A voting seat: not a delegate or resident commissioner, and not a territory's delegate before statehood. */
export function isVotingTerm(t: Pick<DemoTerm, "bioguide_id" | "congress_number" | "chamber" | "state">): boolean {
  if (NON_VOTING_STATES.has(t.state)) return false;
  const last = LAST_TERRITORY_CONGRESS[t.state];
  if (last !== undefined && t.chamber === "house" && t.congress_number <= last) return false;
  return !NON_VOTING_MEMBER_CONGRESS.has(`${t.bioguide_id}@${t.congress_number}`);
}

/** Democrats and Republicans (compound caucus names follow their party); everything else is "O". */
export function caucusGroup(caucus: string | null): CaucusGroup {
  if (caucus?.startsWith("Democrat")) return "D";
  if (caucus?.startsWith("Republican")) return "R";
  return "O";
}

function median(sorted: readonly number[]): number {
  const m = sorted.length >> 1;
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}
const round1 = (v: number) => Math.round(v * 10) / 10;

function ageStat(ages: number[]): AgeStat {
  if (ages.length === 0) return { median: null, average: null, n: 0 };
  const s = [...ages].sort((a, b) => a - b);
  return { median: round1(median(s)), average: round1(s.reduce((a, b) => a + b, 0) / s.length), n: s.length };
}

/** Presidents for the band: the shared list, sorted, as slim rows. */
export function toPresidents(admins: readonly Administration[]): DemoPresident[] {
  return [...admins]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((a) => ({ id: a.term_id, president: a.president, last: a.president.split(" ").pop() ?? a.president, party: a.party === "Democratic" ? "D" : "R" }));
}

/** The president in office on the Congress's convening day. */
export function presidentOnConvening(admins: readonly Administration[], congress: number): Administration {
  const day = conveningDate(congress);
  const hit = [...admins].sort((a, b) => a.start.localeCompare(b.start)).filter((a) => a.start <= day).pop();
  if (!hit) throw new Error(`demographics: no president on ${day}`);
  return hit;
}

/**
 * Per Congress (73rd to the latest in `terms`) and chamber view: seats, age by caucus, women by caucus and tenure bands.
 * The roster is every voting member who held a seat at any time in the Congress (see DEMOGRAPHICS_METHODOLOGY.md); the
 * "both" view counts each person once. Tenure counts every Congress up to and including this one that has any `terms`
 * row for the person, in either chamber and including delegate service, back to the 1st Congress.
 */
export function buildDemographics(legislators: readonly DemoLegislator[], terms: readonly DemoTerm[], admins: readonly Administration[]): DemographicsPayload {
  const person = new Map(legislators.map((l) => [l.bioguide_id, l]));
  const served = new Map<string, number[]>();
  for (const t of terms) {
    const l = served.get(t.bioguide_id) ?? [];
    if (l[l.length - 1] !== t.congress_number && !l.includes(t.congress_number)) l.push(t.congress_number);
    served.set(t.bioguide_id, l);
  }
  for (const l of served.values()) l.sort((a, b) => a - b);
  const servedThrough = (id: string, congress: number) => {
    const l = served.get(id) ?? [];
    let n = 0;
    while (n < l.length && l[n] <= congress) n++;
    return n;
  };

  const lastCongress = Math.max(...terms.map((t) => t.congress_number));
  const byCongress = new Map<number, Map<string, { caucus: string | null; chambers: Set<Chamber> }>>();
  for (const t of terms) {
    if (t.congress_number < FIRST_DEMO_CONGRESS || !isVotingTerm(t)) continue;
    const m = byCongress.get(t.congress_number) ?? new Map();
    const e = m.get(t.bioguide_id) ?? { caucus: t.caucus, chambers: new Set<Chamber>() };
    e.chambers.add(t.chamber);
    m.set(t.bioguide_id, e);
    byCongress.set(t.congress_number, m);
  }

  const views: Record<ChamberView, DemoCongress[]> = { both: [], senate: [], house: [] };
  for (let c = FIRST_DEMO_CONGRESS; c <= lastCongress; c++) {
    const date = conveningDate(c);
    const roster = byCongress.get(c) ?? new Map();
    const termId = presidentOnConvening(admins, c).term_id;
    for (const view of ["both", "senate", "house"] as const) {
      const ages: Record<"D" | "R", number[]> = { D: [], R: [] };
      const all: number[] = [];
      let servedSum = 0;
      const women: Record<CaucusGroup, number> = { D: 0, R: 0, O: 0 };
      const tenure: [number, number, number, number] = [0, 0, 0, 0];
      let seats = 0;
      let ageMissing = 0;
      for (const [id, e] of roster as Map<string, { caucus: string | null; chambers: Set<Chamber> }>) {
        if (view !== "both" && !e.chambers.has(view)) continue;
        const p = person.get(id);
        if (!p) throw new Error(`demographics: ${id} is in terms.json but not legislators.json`);
        const g = (CAUCUS_OVERRIDE[`${id}@${c}`] as CaucusGroup | undefined) ?? caucusGroup(e.caucus);
        seats++;
        const n = servedThrough(id, c);
        tenure[tenureBand(n)]++;
        servedSum += n;
        if (p.birthday) all.push(ageYearsOn(p.birthday, date));
        if (p.gender === "F") women[g]++;
        if (g !== "O") {
          if (p.birthday) ages[g].push(ageYearsOn(p.birthday, date));
          else ageMissing++;
        } else if (!p.birthday) ageMissing++;
      }
      views[view].push({
        congress: c,
        date,
        year: Number(date.slice(0, 4)),
        termId,
        seats,
        age: { D: ageStat(ages.D), R: ageStat(ages.R) },
        ageAll: ageStat(all),
        ageMissing,
        women,
        tenure,
        servedSum,
      });
    }
  }
  return { firstCongress: FIRST_DEMO_CONGRESS, lastCongress, presidents: toPresidents(admins), views };
}
