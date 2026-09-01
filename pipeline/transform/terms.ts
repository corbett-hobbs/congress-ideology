import type {
  Legislator as RawLegislator,
  LegislatorTerm,
} from "../validate/schemas";
import type { Term } from "../../lib/entities";
import { congressStartDate, congressesForTerm } from "./congress";

type PartyAffiliation = NonNullable<Term["party_affiliations"]>[number];

function parseIso(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}
function isoOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function maxDate(...ds: Date[]): Date {
  return ds.reduce((a, b) => (a > b ? a : b));
}
function minDate(...ds: Date[]): Date {
  return ds.reduce((a, b) => (a < b ? a : b));
}

function chamberOf(term: LegislatorTerm): Term["chamber"] {
  return term.type === "sen" ? "senate" : "house";
}

function districtOf(term: LegislatorTerm): number | null {
  if (term.type === "sen") return null;
  // congress-legislators uses -1 and 0 both for at-large.
  return term.district != null && term.district >= 1 ? term.district : null;
}

/**
 * The party_affiliations entries that overlap one Congress's date window,
 * clipped to it. Empty when the term has no party_affiliations.
 */
function affiliationsInCongress(
  term: LegislatorTerm,
  congress: number,
): PartyAffiliation[] {
  if (!term.party_affiliations) return [];
  const winStart = congressStartDate(congress);
  const winEnd = congressStartDate(congress + 1);
  const termStart = parseIso(term.start);
  const termEnd = parseIso(term.end);

  const out: PartyAffiliation[] = [];
  for (const pa of term.party_affiliations) {
    const start = maxDate(parseIso(pa.start), winStart, termStart);
    const end = minDate(parseIso(pa.end), winEnd, termEnd);
    if (start.getTime() < end.getTime()) {
      out.push({
        start: isoOf(start),
        end: isoOf(end),
        party: pa.party,
        ...(pa.caucus ? { caucus: pa.caucus } : {}),
      });
    }
  }
  return out;
}

/** Resolve (party, caucus, party_affiliations?) for one legislator-Congress. */
function partyForCongress(
  term: LegislatorTerm,
  congress: number,
): Pick<Term, "party" | "caucus" | "party_affiliations"> {
  const affs = affiliationsInCongress(term, congress);

  if (affs.length >= 2) {
    // Changed affiliation during this Congress: top-level = the one in effect
    // at the start, full sequence carried through.
    return {
      party: affs[0].party,
      caucus: affs[0].caucus ?? affs[0].party,
      party_affiliations: affs,
    };
  }
  if (affs.length === 1) {
    return { party: affs[0].party, caucus: affs[0].caucus ?? affs[0].party };
  }
  return {
    party: term.party ?? null,
    caucus: term.caucus ?? term.party ?? null,
  };
}

function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as T;
}

/**
 * One `terms.json` row per (legislator, Congress, chamber) served, expanded
 * from congress-legislators term records. `capCongress` clamps sitting members'
 * multi-Congress terms to data we actually have.
 *
 * When two term records land on the same (legislator, Congress, chamber) — a
 * resignation and a same-Congress return, say — the earlier-starting one wins;
 * such collisions are reported by the caller.
 */
export function buildTerms(
  raw: readonly RawLegislator[],
  capCongress: number,
): { terms: Term[]; collisions: string[] } {
  const byKey = new Map<string, Term>();
  const collisions: string[] = [];

  for (const L of raw) {
    for (const term of L.terms) {
      const chamber = chamberOf(term);
      const district = districtOf(term);
      for (const congress of congressesForTerm(
        term.start,
        term.end,
        capCongress,
      )) {
        const key = `${L.id.bioguide}|${congress}|${chamber}`;
        if (byKey.has(key)) {
          collisions.push(key);
          continue;
        }
        byKey.set(
          key,
          compact({
            bioguide_id: L.id.bioguide,
            congress_number: congress,
            chamber,
            state: term.state,
            district,
            ...partyForCongress(term, congress),
          }) as Term,
        );
      }
    }
  }

  const terms = [...byKey.values()].sort(
    (a, b) =>
      a.bioguide_id.localeCompare(b.bioguide_id) ||
      a.congress_number - b.congress_number ||
      a.chamber.localeCompare(b.chamber),
  );
  return { terms, collisions };
}
