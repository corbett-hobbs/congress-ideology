import type { Justice, MqScore } from "./court-entities";
import { buildCourtPayload } from "./court-derive";
import type { CourtJustice, CourtPayload } from "./court-types";
import { justicePath } from "./justice-url";
import type {
  JusticeProfile,
  PeerTrace,
  RosterRow,
  SwarmPoint,
} from "./justice-types";
import { nearestNeighbors } from "./neighbors";

/**
 * Pure (no file I/O) derivation of a justice profile page from the Court
 * payload plus the raw `Justice` rows. `lib/justice-data.ts` reads the files and
 * calls this; `lib/justice-derive.test.ts` runs it over the real data.
 *
 * Conventions (also in docs/SCOTUS_DATA_METHODOLOGY.md):
 *  - career average = unweighted mean of a justice's per-term scores
 *    (already `CourtJustice.career`);
 *  - a peer is anyone sharing at least one scored term; its trace is clipped to
 *    the shared terms only;
 *  - nearest neighbors = the four smallest |career difference| across the whole
 *    data set, overlap or not;
 *  - the score domain is ONE constant for every page, fitted to every score and
 *    95% interval bound.
 */

/** Interval-aware domain: every `mq_lo95`/`mq_hi95`, 3% padding, rounded outward to 0.5. */
export function fitIntervalDomain(scores: readonly MqScore[]): [number, number] {
  const lo = Math.min(...scores.map((s) => s.mq_lo95));
  const hi = Math.max(...scores.map((s) => s.mq_hi95));
  const pad = (hi - lo) * 0.03;
  return [Math.floor((lo - pad) * 2) / 2, Math.ceil((hi + pad) * 2) / 2];
}

/** "1975–2009", or just "2009" when both ends match. */
export const yearSpan = (a: number, b: number | "present") =>
  a === b ? String(a) : `${a}–${b}`;

const year = (iso: string) => Number(iso.slice(0, 4));

/** FJC writes "Harry S Truman"; everywhere else it is "Harry S. Truman". */
export const presidentDisplay = (p: string) => (p === "Harry S Truman" ? "Harry S. Truman" : p);

export function servedLine(
  j: Pick<Justice, "appointment_start" | "service_end">,
  termCount: number,
  firstDataTerm: number,
): string {
  const start = year(j.appointment_start);
  const end = j.service_end ? year(j.service_end) : "present";
  // Sat in (or before) the last term that precedes the data: the data truncates their service.
  const truncated = j.appointment_start <= `${firstDataTerm}-06-30`;
  const n = `${termCount} ${termCount === 1 ? "term" : "terms"}`;
  return `Served ${yearSpan(start, end)} · ${n}${truncated ? " in the data" : ""}`;
}

export function confirmedLine(j: Pick<Justice, "senate_vote">): string {
  // null is a voice vote: every null in the data is an FJC "Voice" row.
  return j.senate_vote
    ? `Confirmed ${j.senate_vote.ayes}–${j.senate_vote.nays}`
    : "Confirmed by voice vote";
}

export function elevatedLine(
  j: Pick<Justice, "confirmation_date" | "chief_justice_appointment">,
): string | null {
  const c = j.chief_justice_appointment;
  if (!c || c.confirmation_date === j.confirmation_date) return null;
  return `Elevated to Chief Justice by ${presidentDisplay(c.president)}, ${year(c.start_date)}`;
}

const sharedRange = (a: CourtJustice, b: CourtJustice): [number, number] | null => {
  const from = Math.max(a.t0, b.t0);
  const to = Math.min(a.t1, b.t1);
  return from <= to ? [from, to] : null;
};

const slice = (j: CourtJustice, arr: number[], from: number, to: number) =>
  arr.slice(from - j.t0, to - j.t0 + 1);

export interface ProfileInput {
  justices: Justice[];
  scores: MqScore[];
  terms: Parameters<typeof buildCourtPayload>[0]["terms"];
  probabilities: Parameters<typeof buildCourtPayload>[0]["probabilities"];
  bios: Map<number, { extract: string; url: string; photoPath: string | null }>;
}

export function buildJusticeProfiles(input: ProfileInput): {
  payload: CourtPayload;
  profiles: JusticeProfile[];
} {
  const payload = buildCourtPayload(input);
  const domain = fitIntervalDomain(input.scores);
  const rawById = new Map(input.justices.map((j) => [j.justice_id, j]));
  const { justices, firstTerm, lastTerm } = payload;

  const profiles = justices.map((subject): JusticeProfile => {
    const raw = rawById.get(subject.id) as Justice;
    const sitting = raw.service_end === null;
    if (sitting && subject.t1 !== lastTerm) {
      throw new Error(`justice ${subject.id}: no end date but last scored term is ${subject.t1}`);
    }
    if (raw.service_end) {
      // The end date comes from FJC senior-status/termination fields; it must
      // agree with the last Martin-Quinn term (+1) to within a calendar year.
      const endYear = year(raw.service_end);
      if (Math.abs(endYear - (subject.t1 + 1)) > 1) {
        throw new Error(
          `justice ${subject.id} ${subject.name}: service ends ${raw.service_end} but last scored term is ${subject.t1}`,
        );
      }
    }

    const neighborIds = new Set(
      nearestNeighbors(
        { id: subject.id, dim1: subject.career, dim2: 0 },
        justices.map((j) => ({ id: j.id, dim1: j.career, dim2: 0 })),
        4,
        (x) => x.id,
      ).map((n) => n.member.id),
    );

    const peers: PeerTrace[] = [];
    const alongsideIds = new Set<number>();
    for (const p of justices) {
      if (p.id === subject.id) continue;
      const r = sharedRange(subject, p);
      if (!r) continue;
      alongsideIds.add(p.id);
      peers.push({
        id: p.id,
        name: p.name,
        short: p.short,
        party: p.party,
        t0: r[0],
        t1: r[1],
        s: slice(p, p.s, r[0], r[1]),
        lo: slice(p, p.lo, r[0], r[1]),
        hi: slice(p, p.hi, r[0], r[1]),
        career: p.career,
        sharedTerms: r[1] - r[0] + 1,
        endsAtEdge: r[1] === subject.t1,
        isNeighbor: neighborIds.has(p.id),
      });
    }

    const points: SwarmPoint[] = justices.map((j) => ({
      id: j.id,
      name: j.name,
      short: j.short,
      party: j.party,
      career: j.career,
      alongside: alongsideIds.has(j.id),
      neighbor: neighborIds.has(j.id),
    }));

    const byCareerGap = <T extends { career: number; id: number }>(a: T, b: T) =>
      Math.abs(a.career - subject.career) - Math.abs(b.career - subject.career) || a.id - b.id;
    const row = (j: CourtJustice, together: string | null): RosterRow => {
      const r = rawById.get(j.id) as Justice;
      return {
        id: j.id,
        name: j.name,
        party: j.party,
        href: justicePath(j),
        together,
        tenure: yearSpan(year(r.appointment_start), r.service_end ? year(r.service_end) : "present"),
        career: j.career,
      };
    };
    const byId = new Map(justices.map((j) => [j.id, j]));
    const alongside = peers
      .sort(byCareerGap)
      .map((p) => row(byId.get(p.id) as CourtJustice, yearSpan(p.t0, p.t1)));
    const neighbors = points
      .filter((p) => p.neighbor)
      .sort(byCareerGap)
      .map((p) => row(byId.get(p.id) as CourtJustice, null));

    const min = Math.min(...subject.s);
    const max = Math.max(...subject.s);
    const last = subject.short;
    const overlap = peers.length;

    const bio = input.bios.get(subject.id);
    return {
      justice: subject,
      last,
      identity: {
        role: raw.chief_justice_appointment ? "Chief Justice" : "Associate Justice",
        appointedBy: {
          president: presidentDisplay(raw.appointing_president),
          party: subject.party,
        },
        served: servedLine(raw, subject.s.length, firstTerm),
        confirmed: confirmedLine(raw),
        elevated: elevatedLine(raw),
      },
      bio: bio ? { extract: bio.extract, url: bio.url } : null,
      photoSrc: bio?.photoPath ?? null,
      chart: {
        domain,
        subtitle: `${last} and the ${overlap} ${overlap === 1 ? "justice" : "justices"} who overlapped with ${last}, ${yearSpan(subject.t0, sitting ? "present" : subject.t1)}`,
        peers,
        median: payload.terms
          .filter((t) => t.term >= subject.t0 && t.term <= subject.t1)
          .map((t) => ({ term: t.term, median: t.median })),
        sitting,
      },
      swarm: {
        points,
        range: {
          min,
          max,
          minTerm: subject.t0 + subject.s.indexOf(min),
          maxTerm: subject.t0 + subject.s.indexOf(max),
        },
      },
      roster: { alongside, neighbors },
    };
  });

  return { payload, profiles };
}
