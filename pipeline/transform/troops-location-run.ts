import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { z } from "zod";
import { DMDC_MANIFEST_PATH, DMDC_RAW_DIR, dmdcRawPath, parseManifest } from "../fetch/dmdc-location-lib";
import { TroopsDataError } from "../../lib/troops-entities";
import { buildTroops, type PeriodInput } from "./troops-location";
import { parseLocationFile } from "./troops-location-parse";

/**
 * DMDC troop-location transform: raw/dmdc-location/*.xlsx ->
 *   troops_location.json, troops_location_meta.json, troops_location_report.json
 * Deterministic (no run timestamp). Fails the build on any gate failure. See docs/TROOPS_METHODOLOGY.md.
 */
const OUT = "pipeline/output";

const oneRowPerLine = (rows: readonly unknown[]) => (rows.length === 0 ? "[]\n" : `[\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`);

export async function readRawLocation(): Promise<PeriodInput[]> {
  let manifest;
  try {
    manifest = parseManifest(JSON.parse(await readFile(DMDC_MANIFEST_PATH, "utf8")));
  } catch {
    throw new TroopsDataError(`${DMDC_RAW_DIR}/manifest.json is missing or invalid; run pnpm fetch:dmdc-location`);
  }
  const out: PeriodInput[] = [];
  for (const f of manifest.files) {
    const buf = await readFile(dmdcRawPath(f.period));
    try {
      out.push({ period: f.period, file: `${f.period}.xlsx`, parsed: parseLocationFile(buf) });
    } catch (e) {
      throw new TroopsDataError(`${f.period}.xlsx: ${e instanceof Error ? e.message : e}`);
    }
  }
  return out;
}

async function main() {
  console.log("transform:troops-location");
  const built = buildTroops(await readRawLocation());

  await mkdir(OUT, { recursive: true });
  await writeFile(`${OUT}/troops_location.json`, oneRowPerLine(built.rows));
  await writeFile(`${OUT}/troops_location_meta.json`, JSON.stringify(built.meta, null, 2) + "\n");

  const pm = built.meta.periods;
  const count = (g: string) => pm.filter((p) => p.overseas_gate === g).length;
  const latest = pm[pm.length - 1];
  const report = {
    source: { data_through: built.meta.data_through, periods: pm.length, first_period: built.meta.first_period, latest_period: built.meta.latest_period },
    rows: {
      total: built.rows.length,
      by_class: Object.fromEntries(["host", "territory", "afloat_unassigned"].map((c) => [c, built.rows.filter((r) => r.class === c).length])),
      by_state: Object.fromEntries(["value", "suppressed", "null"].map((s) => [s, built.rows.filter((r) => r.state === s).length])),
    },
    gates: {
      overseas_total: { exact: count("exact"), documented_exception: count("documented_exception"), untestable: count("untestable") },
      per_period: pm.map((p) => ({ period: p.period, gate: p.overseas_gate, gap: p.overseas_gap, us_gap: p.us_gap, grand_gap: p.grand_gap })),
    },
    latest_period: { period: latest.period, abroad_total: latest.abroad_total, territory_total: latest.territory_total, overseas_total: latest.printed.overseas_total.total ?? null },
    notes: built.notes,
    file_sizes_bytes: { "troops_location.json": (await stat(`${OUT}/troops_location.json`)).size },
  };
  await writeFile(`${OUT}/troops_location_report.json`, JSON.stringify(report, null, 2) + "\n");

  console.log(`  ${built.rows.length} rows, ${pm.length} periods ${built.meta.first_period}..${built.meta.latest_period}, data through ${built.meta.data_through}`);
  console.log(`  overseas gate: ${count("exact")} exact, ${count("documented_exception")} documented exception, ${count("untestable")} untestable`);
  for (const p of pm) console.log(`  ${p.period} ${p.overseas_gate.padEnd(20)} gap ${String(p.overseas_gap ?? "n/a").padStart(5)}  us ${String(p.us_gap ?? "n/a").padStart(3)}  abroad ${p.abroad_total ?? "n/a"}`);
}

if (process.argv[1]?.endsWith("troops-location-run.ts")) {
  main().catch((err: unknown) => {
    console.error("\ntransform:troops-location FAILED");
    console.error(err instanceof z.ZodError ? z.prettifyError(err) : err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
