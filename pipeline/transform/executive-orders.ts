import {
  EO_TOPICS,
  type Administration,
  type EoTopicCacheEntry,
  type ExecutiveOrder,
  type RawExecutiveOrder,
} from "../../lib/executive-orders-entities";

/**
 * Pure logic for the executive-orders track (no file I/O): normalizing the
 * Federal Register snapshot, parsing relationships out of the notes field,
 * assigning terms, deriving topic parents, and the validation checks (including
 * the count anchors). The runner is `executive-orders-run.ts`.
 */

export class ExecutiveOrderDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutiveOrderDataError";
  }
}

// ---- snapshot normalization -------------------------------------------------

/** Federal Register republications/corrections carry the original's EO number under a C1-/R1- document number. */
const CORRECTION_DOC = /^(C|R)\d+-/;

export interface NormalizedRaw {
  /** One row per EO, with a number, ascending. */
  rows: (RawExecutiveOrder & { eo_number: number })[];
  droppedNoNumber: string[];
  droppedCorrections: string[];
}

/**
 * Keep one row per executive order. Drops (and reports) documents the API files
 * under "executive order" that are not an EO of their own: ones with no EO
 * number (e.g. a 1995 UNITA notice mis-filed as an EO) and the C1-/R1-
 * correction/republication documents that duplicate an original's number.
 */
export function normalizeRaw(raw: readonly RawExecutiveOrder[]): NormalizedRaw {
  const droppedNoNumber: string[] = [];
  const droppedCorrections: string[] = [];
  const rows: NormalizedRaw["rows"] = [];
  for (const r of raw) {
    if (r.executive_order_number == null) {
      droppedNoNumber.push(`${r.document_number} (${r.signing_date}) ${r.title}`);
    } else if (CORRECTION_DOC.test(r.document_number)) {
      droppedCorrections.push(`${r.document_number} (EO ${r.executive_order_number})`);
    } else {
      rows.push({ ...r, eo_number: Number(r.executive_order_number) });
    }
  }
  rows.sort((a, b) => a.eo_number - b.eo_number);
  return { rows, droppedNoNumber, droppedCorrections };
}

// ---- notes: amends / revokes -------------------------------------------------

/**
 * Relationships this EO has to earlier ones, from the Federal Register's
 * `executive_order_notes` (e.g. "Amends: EO 13212, May 18, 2001\nSee: EO ...").
 * Only the *forward* labels count — "Revoked by"/"Amended by" describe the other
 * order and are that order's own `amends`/`revokes`. "See", "Continues",
 * "Note" and the like are not relationships we use.
 */
export function parseNotes(notes: string | null): { amends: number[]; revokes: number[] } {
  const amends = new Set<number>();
  const revokes = new Set<number>();
  if (notes) {
    const parts = notes.split(/(?:^|\n|;)\s*([A-Za-z][A-Za-z ]{1,60}):/);
    for (let i = 1; i < parts.length; i += 2) {
      const label = parts[i].trim().toLowerCase();
      const nums = [...parts[i + 1].matchAll(/\bEO (\d{4,5})\b/g)].map((m) => Number(m[1]));
      if (/\bby\b/.test(label)) continue;
      if (/(amends|revokes in part|supersedes in part|partially supersedes|supplements)/.test(label)) {
        nums.forEach((n) => amends.add(n));
      } else if (/^(revokes|rescinds|supersedes|suspersedes|terminates)$/.test(label)) {
        nums.forEach((n) => revokes.add(n));
      }
    }
  }
  const sort = (s: Set<number>) => [...s].sort((a, b) => a - b);
  return { amends: sort(amends), revokes: sort(revokes) };
}

// ---- terms -------------------------------------------------------------------

/** The tenure in force on `date` (ISO): `start <= date < next start`. */
export function termFor(date: string, administrations: readonly Administration[]): Administration {
  const sorted = [...administrations].sort((a, b) => a.start.localeCompare(b.start));
  let found: Administration | undefined;
  for (const a of sorted) if (a.start <= date) found = a;
  if (!found || (found.end != null && date > found.end)) {
    throw new ExecutiveOrderDataError(`no administration in force on ${date}`);
  }
  return found;
}

// ---- topic inheritance --------------------------------------------------------

const EO_REF_IN_TITLE = /Executive Orders?\s+(?:No\.\s*)?(\d{4,5})/gi;
/** Titles that carry no subject of their own: "Amendment to EO N", or the bare "Executive Order N of <date>". */
const SUBJECTLESS_TITLE = /Executive Orders?\s+(?:No\.\s*)?\d{4,5}|^(Revocation|Revoking|Termination of Executive|Amend)/i;

/**
 * The EOs whose topic an amending/revoking order inherits, or `[]` when the
 * order is a substantive order in its own right (e.g. a new order that happens
 * to revoke an old one, like "Classified National Security Information").
 * Only orders whose *title* is a pointer to another EO inherit, per the
 * scope: those titles carry no signal of their own.
 */
export function inheritanceParents(row: Pick<ExecutiveOrder, "title" | "amends" | "revokes">): number[] {
  if (!SUBJECTLESS_TITLE.test(row.title)) return [];
  const fromNotes = [...row.amends, ...row.revokes];
  if (fromNotes.length > 0) return [...new Set(fromNotes)];
  return [...new Set([...row.title.matchAll(EO_REF_IN_TITLE)].map((m) => Number(m[1])))];
}

// ---- building + validation -------------------------------------------------

export function buildExecutiveOrders(
  norm: NormalizedRaw,
  administrations: readonly Administration[],
  cache: ReadonlyMap<number, EoTopicCacheEntry>,
): ExecutiveOrder[] {
  const missing: number[] = [];
  const rows: ExecutiveOrder[] = [];
  for (const r of norm.rows) {
    const term = termFor(r.signing_date, administrations);
    if (term.president_slug !== r.president.identifier) {
      throw new ExecutiveOrderDataError(
        `EO ${r.eo_number} signed ${r.signing_date}: the Federal Register says ${r.president.identifier}, but ${term.president_slug} is in office by pipeline/transform/administrations.ts`,
      );
    }
    const cached = cache.get(r.eo_number);
    if (!cached) {
      missing.push(r.eo_number);
      continue;
    }
    const { amends, revokes } = parseNotes(r.executive_order_notes);
    rows.push({
      eo_number: r.eo_number,
      document_number: r.document_number,
      // Collapse whitespace; the Federal Register drops the space after an EO number in two titles ("13959Addressing").
      title: r.title.replace(/\s+/g, " ").replace(/(\d)([A-Z][a-z])/g, "$1 $2").trim(),
      abstract: r.abstract,
      signing_date: r.signing_date,
      publication_date: r.publication_date,
      term_id: term.term_id,
      // Older documents have no canonical `name`; their `raw_name` sometimes lacks a space ("ExecutiveOffice of the President").
      agencies: r.agencies.map((a) => a.name ?? a.raw_name.replace(/([a-z])([A-Z])/g, "$1 $2")),
      amends,
      revokes,
      topic: cached.topic,
      topic_method: cached.topic_method,
      needs_review: cached.needs_review,
    });
  }
  if (missing.length > 0) {
    throw new ExecutiveOrderDataError(
      `${missing.length} executive order(s) have no cached topic in pipeline/classification/eo_topics.json (the build never classifies on its own, and never falls back to a default topic): ${missing.slice(0, 20).join(", ")}${missing.length > 20 ? ", …" : ""}\nRun \`pnpm classify:eos\` to inherit parent topics, then add a topic for each remaining order.`,
    );
  }
  return rows;
}

/**
 * EOs whose number is out of signing-date order. The Federal Register numbers
 * orders as they are *published*, so an order signed a few days earlier can
 * carry a higher number than its neighbours; each was checked against the
 * Federal Register. A new inversion is an error.
 */
export const KNOWN_OUT_OF_ORDER: Readonly<Record<number, string>> = {
  13300: "signed 2003-05-09, numbered after 13299 (signed 2003-05-12): numbered at publication",
  13517: "signed 2009-10-30, numbered after 13516 (signed 2009-11-02): numbered at publication",
  13947: "signed 2020-07-24, numbered after 13946 (signed 2020-08-24): numbered at publication",
};

/**
 * Count anchors. Each was checked against the Federal Register itself (the
 * per-president `executive_order_number` ranges and signing dates).
 *
 * The session prompt's anchor "2025 totals 225 across both presidents" was
 * wrong: Trump signed 225 EOs in 2025 (14147-14371), and Biden signed a further
 * 13 in January 2025 (14134-14146), so the calendar-year total is 238. The anchor is fixed, not loosened.
 */
export const ANCHORS = {
  bidenCount: 162,
  bidenFirst: 13985,
  bidenLast: 14146,
  trump2025Count: 225,
  total2025: 238,
} as const;

export interface EoValidationSummary {
  count: number;
  firstSigning: string;
  lastSigning: string;
  explainedOutOfOrder: { eo_number: number; reason: string }[];
  bidenCount: number;
  trump2025Count: number;
  total2025: number;
}

export function validateExecutiveOrders(
  rows: readonly ExecutiveOrder[],
  administrations: readonly Administration[],
): EoValidationSummary {
  const seen = new Set<number>();
  const explained: EoValidationSummary["explainedOutOfOrder"] = [];
  const termIds = new Set(administrations.map((a) => a.term_id));
  const topics = new Set<string>(EO_TOPICS);
  let prev: ExecutiveOrder | undefined;
  for (const r of rows) {
    if (seen.has(r.eo_number)) throw new ExecutiveOrderDataError(`duplicate eo_number ${r.eo_number}`);
    seen.add(r.eo_number);
    if (!termIds.has(r.term_id)) throw new ExecutiveOrderDataError(`EO ${r.eo_number}: term_id ${r.term_id} does not resolve`);
    if (!topics.has(r.topic)) throw new ExecutiveOrderDataError(`EO ${r.eo_number}: topic ${r.topic} is not in the taxonomy`);
    if (prev) {
      if (r.eo_number <= prev.eo_number) throw new ExecutiveOrderDataError(`rows are not in ascending eo_number order at ${r.eo_number}`);
      if (r.signing_date < prev.signing_date) {
        const reason = KNOWN_OUT_OF_ORDER[r.eo_number];
        if (!reason) {
          throw new ExecutiveOrderDataError(
            `EO ${r.eo_number} (signed ${r.signing_date}) is numbered after EO ${prev.eo_number} (signed ${prev.signing_date}): eo_number is not monotonic with signing_date`,
          );
        }
        explained.push({ eo_number: r.eo_number, reason });
      }
    }
    prev = r;
  }

  const bidenTerm = administrations.find((a) => a.president_slug === "joe-biden")!.term_id;
  const trump2025Term = administrations.find((a) => a.president_slug === "donald-trump" && a.start === "2025-01-20")!.term_id;
  const biden = rows.filter((r) => r.term_id === bidenTerm);
  const trump2025 = rows.filter((r) => r.term_id === trump2025Term && r.signing_date.startsWith("2025"));
  const total2025 = rows.filter((r) => r.signing_date.startsWith("2025")).length;
  const fail = (what: string, got: unknown, want: unknown) => {
    throw new ExecutiveOrderDataError(
      `count anchor failed: ${what} is ${String(got)}, expected ${String(want)}. If the Federal Register itself changed, verify against federalregister.gov and fix ANCHORS in pipeline/transform/executive-orders.ts with a note — do not loosen the check.`,
    );
  };
  if (biden.length !== ANCHORS.bidenCount) fail("Biden EO count", biden.length, ANCHORS.bidenCount);
  if (biden[0]?.eo_number !== ANCHORS.bidenFirst) fail("Biden's first EO", biden[0]?.eo_number, ANCHORS.bidenFirst);
  if (biden[biden.length - 1]?.eo_number !== ANCHORS.bidenLast) fail("Biden's last EO", biden[biden.length - 1]?.eo_number, ANCHORS.bidenLast);
  if (trump2025.length !== ANCHORS.trump2025Count) fail("Trump 2025 EO count", trump2025.length, ANCHORS.trump2025Count);
  if (total2025 !== ANCHORS.total2025) fail("2025 EO count (both presidents)", total2025, ANCHORS.total2025);

  return {
    count: rows.length,
    firstSigning: rows[0]?.signing_date ?? "",
    lastSigning: rows[rows.length - 1]?.signing_date ?? "",
    explainedOutOfOrder: explained,
    bidenCount: biden.length,
    trump2025Count: trump2025.length,
    total2025,
  };
}
