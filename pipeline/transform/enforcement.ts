import {
  enforcementRow,
  type EnforcementNote,
  type EnforcementRow,
  type IceCatalog,
  type IceYear,
} from "../../lib/enforcement-entities";
import type { Administration } from "../../lib/executive-orders-entities";
import { termIdForDate } from "../../lib/indicator-derive";

/**
 * Pure logic for the immigration-enforcement track (no I/O; the runner in
 * `enforcement-run.ts` reads the files). Turns the curated catalog + the text
 * extracts of the ICE snapshots into `enforcement_series.json` rows and
 * attributes each fiscal year to a presidential tenure.
 *
 * Every figure in the catalog is CHECKED against the text of the ICE document
 * it cites: the quoted evidence must appear verbatim in the extract and must
 * contain the number. Missing is missing — a year with no ICE-sourced figure
 * is simply absent, never estimated.
 */

export class EnforcementDataError extends Error {}

/**
 * Independent regression anchors: figures ICE published in several documents
 * (the FY2013 report; the FY2023 annual report). If the catalog ever
 * disagrees, either the catalog or a snapshot is wrong.
 */
export const ANCHORS: Readonly<Record<number, number>> = { 2013: 368_644, 2023: 142_580 };

/** Collapse whitespace and typographic punctuation so a quote matches across PDF line breaks. */
export function normalizeText(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The number as it may appear in a source: with thousands separators or plain. */
function numberForms(n: number): string[] {
  return [n.toLocaleString("en-US"), String(n)];
}

function containsNumber(text: string, n: number): boolean {
  return numberForms(n).some((f) => new RegExp(`(?<![\\d,])${f}(?![\\d,])`).test(text));
}

/** First/last day of a fiscal year (Oct 1 of the prior calendar year – Sep 30). */
export function fiscalYearBounds(fy: number): { start: string; end: string } {
  return { start: `${fy - 1}-10-01`, end: `${fy}-09-30` };
}

function* daysBetween(start: string, end: string): Generator<string> {
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`).getTime();
  for (; d.getTime() <= last; d.setUTCDate(d.getUTCDate() + 1)) yield d.toISOString().slice(0, 10);
}

export interface Attribution {
  administration_term_id: string;
  blended: boolean;
  administration_days: { term_id: string; days: number }[];
}

/**
 * A fiscal year belongs to the administration in office on its last day
 * (Sept 30). Also returns the calendar-day share per administration and
 * `blended` (the administration changed within the year). Tenure boundaries
 * come from `administrations.json` via `termIdForDate` — a Jan 20 day belongs
 * to the incoming president, the same rule the executive-orders and economy
 * pages use.
 */
export function attributeFiscalYear(fy: number, administrations: readonly Administration[]): Attribution {
  const { start, end } = fiscalYearBounds(fy);
  const counts = new Map<string, number>();
  for (const day of daysBetween(start, end)) {
    const id = termIdForDate(day, administrations);
    if (id === null) throw new EnforcementDataError(`FY${fy}: ${day} is outside every tenure in administrations.json`);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const lastDay = termIdForDate(end, administrations)!;
  return {
    administration_term_id: lastDay,
    blended: counts.size > 1,
    administration_days: [...counts].map(([term_id, days]) => ({ term_id, days })),
  };
}

/** Value for `fy` in a row of an xlsx text extract (`Total | n | n ...`), keyed by the `FYxxxx | ...` header row. */
export function tableValue(text: string, rowLabel: string, fy: number): number | null {
  const lines = text.split("\n");
  const header = lines.find((l) => l.includes(`FY${fy}`) && /^FY\d{4} \|/.test(l));
  const row = lines.find((l) => l.startsWith(`${rowLabel} |`));
  if (!header || !row) return null;
  const col = header.split(" | ").indexOf(`FY${fy}`);
  const cell = row.split(" | ")[col + 1]; // the row label occupies the first cell
  return col < 0 || cell === undefined ? null : Number(cell);
}

export interface EnforcementBuild {
  series: EnforcementRow[];
  notes: EnforcementNote[];
  report: {
    first_period: number;
    last_period: number;
    rows: number;
    missing_periods: number[];
    by_status: Record<string, number>;
    blended_periods: number[];
    attribution: { period: number; administration_term_id: string; blended: boolean }[];
    corroborated_periods: number[];
    single_source_periods: number[];
    figure_read_periods: number[];
    anchors: { period: number; value: number; ok: boolean }[];
    breakdowns: { period: number; interior: number; border: number; total: number; ok: boolean }[];
  };
}

export interface BuildInput {
  catalog: IceCatalog;
  /** Text extract per source id. */
  texts: ReadonlyMap<string, string>;
  /** Figure snapshot files that exist in pipeline/raw/ice. */
  figureFiles: ReadonlySet<string>;
  administrations: readonly Administration[];
}

function checkQuote(where: string, sourceId: string, evidence: string, value: number, texts: ReadonlyMap<string, string>) {
  const text = texts.get(sourceId);
  if (text === undefined) throw new EnforcementDataError(`${where}: no text extract for source "${sourceId}" (run pnpm fetch:ice)`);
  if (!normalizeText(text).includes(normalizeText(evidence))) {
    throw new EnforcementDataError(`${where}: quoted evidence not found in ${sourceId}: "${evidence.slice(0, 80)}"`);
  }
  if (!containsNumber(normalizeText(evidence), value)) {
    throw new EnforcementDataError(`${where}: evidence from ${sourceId} does not contain ${value.toLocaleString("en-US")}`);
  }
}

function checkYear(y: IceYear, input: BuildInput) {
  const where = `FY${y.fy} (${y.source})`;
  const src = input.catalog.sources.find((s) => s.id === y.source);
  if (!src) throw new EnforcementDataError(`${where}: source is not in the catalog`);
  if (y.evidence_kind === "figure") {
    const text = input.texts.get(y.source);
    if (text === undefined || !normalizeText(text).includes(normalizeText(y.evidence))) {
      throw new EnforcementDataError(`${where}: figure caption not found in the source text: "${y.evidence}"`);
    }
    if (!y.figure_file || !input.figureFiles.has(y.figure_file)) {
      throw new EnforcementDataError(`${where}: figure snapshot "${y.figure_file ?? "(none)"}" is missing from pipeline/raw/ice`);
    }
  } else if (src.kind === "xlsx") {
    checkQuote(where, y.source, y.evidence, y.value, input.texts);
    const cell = tableValue(input.texts.get(y.source)!, "Total", y.fy);
    if (cell !== y.value) throw new EnforcementDataError(`${where}: the table's Total for FY${y.fy} is ${cell}, catalog says ${y.value}`);
  } else {
    checkQuote(where, y.source, y.evidence, y.value, input.texts);
  }
  for (const c of y.corroboration) checkQuote(`${where} corroboration`, c.source, c.evidence, y.value, input.texts);
}

export function buildEnforcement(input: BuildInput): EnforcementBuild {
  const { catalog } = input;
  const sourceIds = new Set<string>();
  for (const s of catalog.sources) {
    if (sourceIds.has(s.id)) throw new EnforcementDataError(`duplicate source id "${s.id}"`);
    sourceIds.add(s.id);
  }
  const noteIds = new Set(catalog.notes.map((n) => n.id));
  if (noteIds.size !== catalog.notes.length) throw new EnforcementDataError("duplicate note id in the catalog");
  for (const n of catalog.notes) {
    if (n.fy_end !== null && n.fy_end < n.fy_start) throw new EnforcementDataError(`note ${n.id}: fy_end before fy_start`);
    if (n.source !== null && !sourceIds.has(n.source)) throw new EnforcementDataError(`note ${n.id}: unknown source "${n.source}"`);
  }

  const series: EnforcementRow[] = [];
  for (const y of catalog.years) {
    checkYear(y, input);
    for (const id of y.note_ids) {
      if (!noteIds.has(id)) throw new EnforcementDataError(`FY${y.fy}: unknown note id "${id}"`);
    }
    const src = catalog.sources.find((s) => s.id === y.source)!;
    series.push(
      enforcementRow.parse({
        period: y.fy,
        period_type: "fiscal_year",
        metric: "removals",
        scope: "ice",
        value: y.value,
        source: src.title,
        source_url: src.url,
        as_of: catalog.retrieved_at,
        status: y.status,
        note_ids: y.note_ids,
        ...attributeFiscalYear(y.fy, input.administrations),
      }),
    );
  }
  series.sort((a, b) => a.period - b.period);

  // --- validation ---
  const seen = new Set<number>();
  for (const [i, r] of series.entries()) {
    if (seen.has(r.period)) throw new EnforcementDataError(`duplicate (period, metric, scope): FY${r.period} removals ice`);
    seen.add(r.period);
    if (i > 0 && r.period <= series[i - 1].period) throw new EnforcementDataError(`periods are not strictly increasing at FY${r.period}`);
    if (r.value < 0) throw new EnforcementDataError(`FY${r.period}: negative value`);
    // The fiscal year still in progress at retrieval (or later) can only be preliminary.
    if (fiscalYearBounds(r.period).end >= r.as_of && r.status !== "preliminary") {
      throw new EnforcementDataError(`FY${r.period}: ends on or after ${r.as_of} (in progress) but status is "${r.status}"`);
    }
  }
  const anchors = Object.entries(ANCHORS).map(([p, value]) => {
    const row = series.find((r) => r.period === Number(p));
    return { period: Number(p), value, ok: row?.value === value };
  });
  const bad = anchors.find((a) => !a.ok);
  if (bad) throw new EnforcementDataError(`FY${bad.period}: expected ICE's published ${bad.value.toLocaleString("en-US")}, got ${series.find((r) => r.period === bad.period)?.value ?? "no row"}`);

  const breakdowns = catalog.breakdowns.map((b) => {
    const row = series.find((r) => r.period === b.fy);
    if (!row) throw new EnforcementDataError(`breakdown FY${b.fy}: no series row`);
    checkQuote(`breakdown FY${b.fy} interior`, b.source, b.evidence_interior, b.interior, input.texts);
    checkQuote(`breakdown FY${b.fy} border`, b.source, b.evidence_border, b.border, input.texts);
    const total = b.interior + b.border;
    if (total !== row.value) throw new EnforcementDataError(`breakdown FY${b.fy}: interior ${b.interior} + border ${b.border} = ${total}, series says ${row.value}`);
    return { period: b.fy, interior: b.interior, border: b.border, total, ok: true };
  });

  const periods = series.map((r) => r.period);
  const first = periods[0];
  const last = periods[periods.length - 1];
  const missing: number[] = [];
  for (let p = first; p <= last; p++) if (!seen.has(p)) missing.push(p);

  const byStatus: Record<string, number> = {};
  for (const r of series) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const yearOf = new Map(catalog.years.map((y) => [y.fy, y]));

  return {
    series,
    notes: [...catalog.notes].sort((a, b) => a.fy_start - b.fy_start || a.id.localeCompare(b.id)),
    report: {
      first_period: first,
      last_period: last,
      rows: series.length,
      missing_periods: missing,
      by_status: byStatus,
      blended_periods: series.filter((r) => r.blended).map((r) => r.period),
      attribution: series.map((r) => ({ period: r.period, administration_term_id: r.administration_term_id, blended: r.blended })),
      corroborated_periods: periods.filter((p) => yearOf.get(p)!.corroboration.length > 0),
      single_source_periods: periods.filter((p) => yearOf.get(p)!.corroboration.length === 0),
      figure_read_periods: periods.filter((p) => yearOf.get(p)!.evidence_kind === "figure"),
      anchors,
      breakdowns,
    },
  };
}
