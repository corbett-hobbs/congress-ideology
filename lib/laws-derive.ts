import type { Administration } from "./executive-orders-entities";
import type { LawCountRow, LawRow, LawsMeta } from "./laws-entities";
import type { LawsPayload, SignedMost } from "./laws-types";

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
export function buildLawsPayload(counts: readonly LawCountRow[], laws: readonly LawRow[], meta: LawsMeta, admins: readonly Administration[]): LawsPayload {
  const congresses: number[] = [];
  for (let c = meta.first_congress; c <= meta.last_congress; c++) congresses.push(c);
  const areaIndex = new Map(meta.areas.map((a, i) => [a.id, i]));
  const cIndex = new Map(congresses.map((c, i) => [c, i]));
  const grid = congresses.map(() => meta.areas.map(() => 0));
  for (const r of counts) {
    const ci = cIndex.get(r.congress);
    const ai = areaIndex.get(r.area_id);
    if (ci === undefined || ai === undefined) throw new Error(`laws: counts row (${r.congress}, ${r.area_id}) is outside the catalog`);
    grid[ci]![ai]! += r.n;
  }
  const signed = signedMostByCongress(laws, admins);
  return {
    congresses,
    partial: congresses.map((c) => meta.partial_congresses.includes(c)),
    areas: meta.areas,
    groups: meta.groups,
    counts: grid,
    signedMost: congresses.map((c) => {
      const s = signed.get(c);
      if (!s) throw new Error(`laws: no laws in the ${c}th Congress`);
      return s;
    }),
    dataThrough: meta.data_through,
    lawCount: meta.law_count,
  };
}
