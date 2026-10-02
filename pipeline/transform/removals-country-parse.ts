/**
 * Table readers for ICE's "Removals by country of citizenship" appendices (pure; no I/O).
 * The text extracts come from `pdftotext -layout` / the HTML text dump in `pipeline/raw/ice/`,
 * so each document needs its own reader: most print `Name  n  n  n` on one line, the FY2017
 * web page prints one cell per line. Every table is bounded by its heading and, where the
 * document keeps its own printed total, reconciled against it by the caller.
 */

export class RemovalsCountryError extends Error {}

export interface CountrySourceSpec {
  /** Catalog source id (`pipeline/reference/ice-removals-catalog.json`). */
  source: string;
  /** Heading that opens the table (first match wins). */
  start: RegExp;
  /** First line after the table, if the document keeps printing text that could look like rows. */
  end?: RegExp;
  /** The fiscal years printed, left to right. */
  years: readonly number[];
  layout: "columns" | "stacked";
  /** Data run date ICE prints per fiscal year (ISO). */
  as_of: Readonly<Record<number, string>>;
}

export interface RawCountryRow {
  name: string;
  values: number[];
  /** The name was joined from two printed lines (ICE wraps long names); the likeliest place for a misread. */
  wrapped: boolean;
}

export interface ParsedTable {
  rows: RawCountryRow[];
  /** The "Total" row ICE prints, one value per year. */
  total: number[];
  /** Lines inside the table that carry digits but were not read as a row (footnotes, page numbers, headers). */
  skipped: string[];
}

const NUM = String.raw`\d{1,3}(?:,\d{3})*|\d+`;
const num = (s: string) => Number(s.replace(/,/g, ""));

/** Footnote markers pdftotext glues to a name ("Estonia 8" is not a name with a value). */
const cleanName = (s: string) => s.replace(/\s+/g, " ").replace(/[​]/g, "").trim();

export function parseCountryTable(text: string, spec: CountrySourceSpec): ParsedTable {
  const all = text.split("\n");
  const from = all.findIndex((l) => spec.start.test(l));
  if (from < 0) throw new RemovalsCountryError(`${spec.source}: table heading ${spec.start} not found`);
  let to = all.length;
  if (spec.end) {
    const e = all.findIndex((l, i) => i > from && spec.end!.test(l));
    if (e < 0) throw new RemovalsCountryError(`${spec.source}: table end marker ${spec.end} not found`);
    to = e;
  }
  const lines = all.slice(from + 1, to);
  return spec.layout === "columns" ? readColumns(lines, spec) : readStacked(lines, spec);
}

function readColumns(lines: string[], spec: CountrySourceSpec): ParsedTable {
  const n = spec.years.length;
  const row = new RegExp(String.raw`^\s*([^\d\s].*?)\s+((?:(?:${NUM})\s+){${n - 1}}(?:${NUM}))\s*$`);
  const rows: RawCountryRow[] = [];
  const skipped: string[] = [];
  let total: number[] | null = null;
  let prev = "";
  for (const raw of lines) {
    const line = raw.replace(/\f/g, "");
    const m = row.exec(line);
    // A long name wraps onto the line above ("SERBIA AND" / "MONTENEGRO  2  2  1"): the text-only line
    // directly above a row belongs to its name.
    const wrapped = prev && !/\d/.test(prev) && !/citizenship|^total$/i.test(prev) ? prev : "";
    prev = line.trim();
    if (!m) {
      if (/\d/.test(line)) skipped.push(line.trim());
      continue;
    }
    const name = cleanName(`${wrapped} ${m[1]}`);
    const values = m[2].split(/\s+/).map(num);
    if (/^total$/i.test(name)) {
      if (total) throw new RemovalsCountryError(`${spec.source}: two Total rows`);
      total = values;
    } else rows.push({ name, values, wrapped: wrapped !== "" });
  }
  if (!total) throw new RemovalsCountryError(`${spec.source}: no Total row inside the table`);
  return { rows, total, skipped };
}

/** One cell per line: `Name`, then one number per year. The web page's own "Total" is the last row. */
function readStacked(lines: string[], spec: CountrySourceSpec): ParsedTable {
  const n = spec.years.length;
  const cells = lines.map((l) => l.trim()).filter(Boolean);
  const isNum = (s: string) => new RegExp(`^(?:${NUM})$`).test(s);
  const rows: RawCountryRow[] = [];
  const skipped: string[] = [];
  let total: number[] | null = null;
  for (let i = 0; i < cells.length; ) {
    const name = cells[i];
    const vals = cells.slice(i + 1, i + 1 + n);
    if (!isNum(name) && vals.length === n && vals.every(isNum)) {
      const values = vals.map(num);
      if (/^total$/i.test(name)) total = values;
      else rows.push({ name: cleanName(name), values, wrapped: false });
      i += n + 1;
    } else {
      if (/\d/.test(name)) skipped.push(name);
      i += 1;
    }
  }
  if (!total) throw new RemovalsCountryError(`${spec.source}: no Total row inside the table`);
  return { rows, total, skipped };
}
