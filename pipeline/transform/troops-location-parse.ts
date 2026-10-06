import { readXlsx, type XlsxRow } from "./xlsx";
import { BRANCH_FIELDS, TroopsDataError, type BranchField } from "../../lib/troops-entities";

/** One printed cell: a number, `*` (suppressed), or `N/A`. */
export type Cell = { kind: "value"; n: number } | { kind: "suppressed" } | { kind: "na" };
export type Cells = Partial<Record<BranchField, Cell>>;

export interface ParsedRow {
  /** Label as printed, uppercase, trailing `*` removed. */
  name: string;
  starred: boolean;
  section: "us" | "overseas";
  cells: Cells;
}

export interface ParsedFile {
  /** `YYYY-MM-DD` from the file's own "As of" line. */
  asOf: string;
  rows: ParsedRow[];
  printed: { us: Cells; overseas: Cells; grand: Cells };
  /** Active-duty columns present, in file order. */
  fields: BranchField[];
  spaceForce: "none" | "merged_into_air_force" | "separate";
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** `As of June 30, 2022` anywhere in column A -> `2022-06-30`. */
function readAsOf(rows: XlsxRow[]): string {
  for (const r of rows) {
    const m = /^\s*as of\s+([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s*$/i.exec(r.cells.A ?? "");
    if (!m) continue;
    const mi = MONTHS.indexOf(m[1].toLowerCase());
    if (mi < 0) throw new TroopsDataError(`unrecognised month in "As of" line: ${r.cells.A}`);
    return `${m[3]}-${String(mi + 1).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
  }
  throw new TroopsDataError('no "As of <date>" line found');
}

const norm = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim().toUpperCase();

const HEADER_TO_FIELD: Record<string, BranchField> = {
  ARMY: "army",
  NAVY: "navy",
  "MARINE CORPS": "marine_corps",
  "AIR FORCE": "air_force",
  "AIR FORCE/SPACE FORCE": "air_force",
  "SPACE FORCE": "space_force",
  "COAST GUARD": "coast_guard",
  TOTAL: "total",
};

const colIndex = (c: string) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

function cell(raw: string | undefined, label: string): Cell | undefined {
  if (raw === undefined) return undefined;
  const t = raw.trim();
  if (t === "") return undefined;
  if (t === "*") return { kind: "suppressed" };
  if (/^n\/?a$/i.test(t)) return { kind: "na" };
  if (!/^-?\d+(\.0+)?$/.test(t)) throw new TroopsDataError(`${label}: unreadable cell ${JSON.stringify(raw)}`);
  return { kind: "value", n: Math.round(Number(t)) };
}

/**
 * Parse one DMDC location report. Headers are found by text, never by row number: the "ACTIVE DUTY" group cell
 * locates the active-duty columns (up to the next group header), and the row under it names the branches. Rows are
 * classified by position: after `UNITED STATES` until `UNITED STATES TOTAL` is the U.S. section; after that until
 * `OVERSEAS TOTAL` is overseas (Dec 2017 on, the `OVERSEAS` label is a footnote, so position alone decides);
 * `GRAND TOTAL` ends the table.
 */
export function parseLocationFile(buf: Buffer): ParsedFile {
  const xrows = readXlsx(buf);
  const asOf = readAsOf(xrows);

  const groupIdx = xrows.findIndex((r) => Object.values(r.cells).some((v) => norm(v) === "ACTIVE DUTY"));
  if (groupIdx < 0) throw new TroopsDataError('header text "ACTIVE DUTY" not found');
  const group = xrows[groupIdx];
  const startCol = Object.entries(group.cells).find(([, v]) => norm(v) === "ACTIVE DUTY")![0];
  const nextGroup = Object.keys(group.cells)
    .filter((c) => colIndex(c) > colIndex(startCol))
    .sort((a, b) => colIndex(a) - colIndex(b))[0];
  const branchHdr = xrows[groupIdx + 1];
  if (!branchHdr || !/^ARMY\*{0,3}$/.test(norm(branchHdr.cells[startCol]))) throw new TroopsDataError(`branch header row (ARMY…) not found under "ACTIVE DUTY"`);

  const colField = new Map<string, BranchField>();
  let spaceForce: ParsedFile["spaceForce"] = "none";
  for (const [col, text] of Object.entries(branchHdr.cells)) {
    const i = colIndex(col);
    if (i < colIndex(startCol) || (nextGroup && i >= colIndex(nextGroup))) continue;
    const h = norm(text).replace(/\*+$/, "").trim(); // Dec 2022-Jun 2023 print "ARMY***" (the footnote marks Army as not provided)
    const f = HEADER_TO_FIELD[h];
    if (!f) throw new TroopsDataError(`unrecognised active-duty column header ${JSON.stringify(text)}`);
    if ([...colField.values()].includes(f)) throw new TroopsDataError(`duplicate active-duty column ${h}`);
    colField.set(col, f);
    if (h === "AIR FORCE/SPACE FORCE") spaceForce = "merged_into_air_force";
    if (h === "SPACE FORCE") spaceForce = "separate";
  }
  for (const need of ["army", "navy", "marine_corps", "air_force", "total"] as const) {
    if (![...colField.values()].includes(need)) throw new TroopsDataError(`active-duty column ${need} missing`);
  }
  const fields = BRANCH_FIELDS.filter((f) => [...colField.values()].includes(f));

  const rows: ParsedRow[] = [];
  const printed: ParsedFile["printed"] = { us: {}, overseas: {}, grand: {} };
  let state: "before" | "us" | "overseas" | "done" = "before";
  const seen = { us: false, usTotal: false, overseasTotal: false, grand: false };

  const readCells = (r: XlsxRow, label: string, starred: boolean): Cells => {
    const out: Cells = {};
    for (const [col, f] of colField) {
      const c = cell(r.cells[col], `${label} ${f}`);
      if (c) out[f] = c;
      else if (starred) out[f] = { kind: "suppressed" };
      else throw new TroopsDataError(`${label}: blank ${f} cell on a row not marked *`);
    }
    return out;
  };

  for (const r of xrows.slice(groupIdx + 2)) {
    const a = norm(r.cells.A);
    const b = (r.cells.B ?? "").replace(/\s+/g, " ").trim();
    if (state === "done") break;
    if (a === "GRAND TOTAL") {
      if (state !== "overseas" || !seen.overseasTotal) throw new TroopsDataError("GRAND TOTAL reached before OVERSEAS TOTAL");
      printed.grand = readCells(r, "GRAND TOTAL", false);
      seen.grand = true;
      state = "done";
      continue;
    }
    if (a === "UNITED STATES TOTAL") {
      if (state !== "us") throw new TroopsDataError("UNITED STATES TOTAL outside the U.S. section");
      printed.us = readCells(r, "UNITED STATES TOTAL", false);
      seen.usTotal = true;
      state = "overseas";
      continue;
    }
    if (a === "OVERSEAS TOTAL") {
      if (state !== "overseas") throw new TroopsDataError("OVERSEAS TOTAL outside the overseas section");
      printed.overseas = readCells(r, "OVERSEAS TOTAL", false);
      seen.overseasTotal = true;
      continue;
    }
    if (a === "UNITED STATES") {
      if (state !== "before") throw new TroopsDataError("second UNITED STATES section start");
      state = "us";
      seen.us = true;
    }
    if (!b || (state !== "us" && state !== "overseas") || seen.overseasTotal) continue;
    const starred = b.endsWith("*");
    const name = (starred ? b.slice(0, -1) : b).trim().toUpperCase();
    rows.push({ name, starred, section: state, cells: readCells(r, name, starred) });
  }
  if (!seen.us || !seen.usTotal || !seen.overseasTotal || !seen.grand) throw new TroopsDataError("table structure incomplete (UNITED STATES / TOTAL / OVERSEAS TOTAL / GRAND TOTAL)");
  return { asOf, rows, printed, fields, spaceForce };
}
