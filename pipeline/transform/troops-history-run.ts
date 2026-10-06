import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { parse as parseCsv } from "csv-parse/sync";
import { z } from "zod";
import { TROOPDATA_MANIFEST_PATH, parseTroopdataManifest, troopdataRawPath } from "../fetch/troopdata-lib";
import { TroopsDataError } from "../../lib/troops-entities";
import { buildHistory, type ContingencyRow, type ReferenceRow, type TroopdataRow } from "./troops-history";

/**
 * Troops-abroad history transform (1950-2007): raw/troopdata/* + reference/dmdc-309a-sep.csv ->
 *   troops_history.json, troops_history_meta.json, troops_history_report.json
 * Deterministic (no run timestamp). Fails the build on any gate failure. See docs/TROOPS_METHODOLOGY.md "History".
 */
const OUT = "pipeline/output";
const REFERENCE = "pipeline/reference/dmdc-309a-sep.csv";
const CONTINGENCY = "pipeline/reference/dmdc-309a-contingency.csv";

const oneRowPerLine = (rows: readonly unknown[]) => (rows.length === 0 ? "[]\n" : `[\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`);
const num = (v: string): number | null => (v === "" || v === "NA" ? null : Number(v));

export async function readTroopdata(): Promise<{ rows: TroopdataRow[]; commit: string }> {
  let manifest;
  try {
    manifest = parseTroopdataManifest(JSON.parse(await readFile(TROOPDATA_MANIFEST_PATH, "utf8")));
  } catch {
    throw new TroopsDataError("pipeline/raw/troopdata/manifest.json is missing or invalid; run pnpm fetch:troopdata");
  }
  const raw = parseCsv(await readFile(troopdataRawPath("country-year-quarter-format.csv"), "utf8"), { columns: true, skip_empty_lines: true, bom: true }) as Record<string, string>[];
  const rows = raw.map((r) => ({
    year: Number(r.year),
    month: r.month,
    countryname: r.countryname,
    source: r.source,
    troops_ad: num(r.troops_ad),
    army_ad: num(r.army_ad),
    navy_ad: num(r.navy_ad),
    air_force_ad: num(r.air_force_ad),
    marine_corps_ad: num(r.marine_corps_ad),
  }));
  return { rows, commit: manifest.commit };
}

export async function readReference(): Promise<ReferenceRow[]> {
  const raw = parseCsv(await readFile(REFERENCE, "utf8"), { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  return raw.map((r) => ({ year: Number(r.year), seq: Number(r.seq), name: r.name, total: Number(r.total), army: Number(r.army), navy: Number(r.navy), marine_corps: Number(r.marine_corps), air_force: Number(r.air_force) }));
}

export async function readContingency(): Promise<ContingencyRow[]> {
  const raw = parseCsv(await readFile(CONTINGENCY, "utf8"), { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  return raw.map((r) => ({ year: Number(r.year), operation: r.operation, place: r.place, iso3: r.iso3, total: Number(r.total), army: Number(r.army), navy: Number(r.navy), marine_corps: Number(r.marine_corps), air_force: Number(r.air_force), basis: r.basis, rounded: r.rounded === "true", dmdc_label: r.dmdc_label }));
}

async function main() {
  console.log("transform:troops-history");
  const td = await readTroopdata();
  const built = buildHistory(td.rows, await readReference(), await readContingency(), td.commit);

  await mkdir(OUT, { recursive: true });
  await writeFile(`${OUT}/troops_history.json`, oneRowPerLine(built.rows));
  await writeFile(`${OUT}/troops_history_meta.json`, JSON.stringify(built.meta, null, 2) + "\n");

  const ym = built.meta.years;
  const report = {
    coverage: { first_year: built.meta.first_year, last_year: built.meta.last_year, years: ym.length, dmdc_years: built.meta.dmdc_years, troopdata_years: ym.filter((y) => y.source === "troopdata").length },
    rows: {
      total: built.rows.length,
      by_class: Object.fromEntries(["host", "territory", "afloat_unassigned"].map((c) => [c, built.rows.filter((r) => r.class === c).length])),
      by_source: Object.fromEntries(["troopdata", "dmdc_309a"].map((s) => [s, built.rows.filter((r) => r.source === s).length])),
      by_quality: Object.fromEntries(["reported", "estimate"].map((q) => [q, built.rows.filter((r) => r.quality === q).length])),
      suppressed: built.rows.filter((r) => r.state === "suppressed").length,
    },
    gates: {
      dmdc_foreign_total_exact: ym.filter((y) => y.dmdc_foreign_total !== null).length,
      troopdata_reconciliation: built.notes.reconcile,
    },
    contingency: built.meta.contingency.map((c) => `${c.year} ${c.name} ${c.total} (${c.basis})`),
    notes: built.notes,
    file_sizes_bytes: { "troops_history.json": (await stat(`${OUT}/troops_history.json`)).size },
  };
  await writeFile(`${OUT}/troops_history_report.json`, JSON.stringify(report, null, 2) + "\n");

  console.log(`  ${built.rows.length} rows, ${ym.length} years ${built.meta.first_year}..${built.meta.last_year} (${built.meta.dmdc_years.length} from DMDC 309A, ${report.coverage.troopdata_years} from troopdata)`);
  for (const r of built.notes.reconcile) console.log(`  ${r.year} troopdata vs DMDC: ${r.exact}/${r.checked} hosts ≥1,000 exact${r.documented_exceptions ? ` + ${r.documented_exceptions} documented exception` : ""}${r.checked === 0 ? " (troopdata empty this year)" : ""}`);
}

if (process.argv[1]?.endsWith("troops-history-run.ts")) {
  main().catch((err: unknown) => {
    console.error("\ntransform:troops-history FAILED");
    console.error(err instanceof z.ZodError ? z.prettifyError(err) : err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
