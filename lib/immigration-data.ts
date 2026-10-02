import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { enforcementNote, enforcementReport, enforcementRow } from "./enforcement-entities";
import { administration } from "./executive-orders-entities";
import { buildImmigrationData, type ImmigrationPageData } from "./immigration-derive";

/**
 * Build-time reader for /presidency/immigration: parses the three enforcement
 * files and the administrations table, runs the invariant checks (a failure
 * fails the build) and hands the page its shaped data. Shaping is in the pure,
 * unit-tested `lib/immigration-derive.ts`.
 */

const OUT = join(process.cwd(), "pipeline", "output");
const read = (file: string): unknown[] | unknown => JSON.parse(readFileSync(join(OUT, file), "utf8"));

let cache: ImmigrationPageData | null = null;

export function getImmigrationPageData(): ImmigrationPageData {
  if (cache) return cache;
  cache = buildImmigrationData(
    (read("enforcement_series.json") as unknown[]).map((r) => enforcementRow.parse(r)),
    (read("enforcement_notes.json") as unknown[]).map((r) => enforcementNote.parse(r)),
    enforcementReport.parse(read("enforcement_report.json")),
    (read("administrations.json") as unknown[]).map((r) => administration.parse(r)),
  );
  return cache;
}
