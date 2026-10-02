import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { z } from "zod";
import { AidDataError, aidMeta } from "../../lib/foreign-aid-entities";
import { countryRow } from "../../lib/trade-entities";
import { FA_RAW_DIR, FA_RAW_META_PATH, parseRawMeta, parseRawYear, type RawMeta, type RawYear } from "../fetch/foreign-assistance-lib";
import { buildAid, reconcile, validateAid } from "./foreign-aid";

/**
 * Foreign-assistance transform: raw/foreign-assistance/* + output/countries.json (trade) ->
 *   foreign_assistance.json, foreign_assistance_meta.json, foreign_assistance_report.json
 * Run after trade-run (the crosswalk target is the trade pipeline's countries.json). Deterministic
 * (no run timestamp). Fails the build on any validation error.
 */
const OUT = "pipeline/output";

const oneRowPerLine = (rows: readonly unknown[]) => (rows.length === 0 ? "[]\n" : `[\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`);

export async function readRawAid(): Promise<{ meta: RawMeta; years: RawYear[] }> {
  let files: string[];
  try {
    files = (await readdir(FA_RAW_DIR)).filter((f) => /^\d{4}\.json$/.test(f)).sort();
  } catch {
    throw new AidDataError(`${FA_RAW_DIR} is missing — run pnpm fetch:foreign-assistance`);
  }
  if (!files.length) throw new AidDataError(`${FA_RAW_DIR} has no fiscal-year files — run pnpm fetch:foreign-assistance`);
  const meta = parseRawMeta(JSON.parse(await readFile(FA_RAW_META_PATH, "utf8")));
  const years = [];
  for (const f of files) {
    const y = parseRawYear(JSON.parse(await readFile(`${FA_RAW_DIR}/${f}`, "utf8")));
    if (`${y.fiscal_year}.json` !== f) throw new AidDataError(`${FA_RAW_DIR}/${f}: fiscal_year ${y.fiscal_year} does not match the file name`);
    years.push(y);
  }
  return { meta, years };
}

export async function readTradeCountries() {
  const rows = JSON.parse(await readFile(`${OUT}/countries.json`, "utf8")) as unknown[];
  return rows.map((r) => countryRow.parse(r));
}

async function main() {
  console.log("transform:foreign-aid");
  const { meta: rawMeta, years } = await readRawAid();
  const built = buildAid(years, rawMeta, await readTradeCountries());
  validateAid(built.rows, built.meta, rawMeta, years);
  aidMeta.parse(built.meta);

  await mkdir(OUT, { recursive: true });
  await rm(`${OUT}/foreign_assistance`, { recursive: true, force: true }); // the old per-year shards
  await writeFile(`${OUT}/foreign_assistance.json`, oneRowPerLine(built.rows));
  await writeFile(`${OUT}/foreign_assistance_meta.json`, JSON.stringify(built.meta, null, 2) + "\n");

  const recon = reconcile(built.rows);
  const unmapped = built.crosswalk.filter((c) => c.how === "unmapped");
  const fy = (n: number) => built.rows.filter((r) => r.fiscal_year === n);
  const top = (n: number) => {
    const m = new Map<string, number>();
    for (const r of fy(n).filter((r) => r.recipient_type === "country")) m.set(r.recipient_name, (m.get(r.recipient_name) ?? 0) + r.disbursements_usd);
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, usd]) => ({ name, disbursements_usd: usd }));
  };
  const report = {
    source: { data_through: rawMeta.data_through, fetched_at: rawMeta.fetched_at, source_sector_rows: built.stats.sourceRows },
    rows: { foreign_assistance: built.rows.length, by_recipient_type: Object.fromEntries(["country", "regional", "global"].map((t) => [t, built.rows.filter((r) => r.recipient_type === t).length])) },
    coverage: { first_fiscal_year: built.meta.first_fiscal_year, latest_fiscal_year: built.meta.latest_fiscal_year, partial_years: built.meta.years.filter((y) => y.is_partial).map((y) => y.fiscal_year) },
    crosswalk: {
      recipients: built.crosswalk.length,
      identity: built.crosswalk.filter((c) => c.how === "identity").length,
      rule: built.crosswalk.filter((c) => c.how === "rule").length,
      unmapped: unmapped.length,
      rules_applied: built.crosswalk.filter((c) => c.how === "rule" && c.country_key !== null).map((c) => ({ recipient_name: c.recipient_name, source_code: c.source_code, country_key: c.country_key, rule: c.rule })),
      country_recipients_without_trade_key: built.crosswalk.filter((c) => c.country_key === null && c.how !== "unmapped" && c.source_code !== null && !/ Region$/.test(c.recipient_name) && c.source_code !== "WLD").map((c) => ({ recipient_name: c.recipient_name, source_code: c.source_code, rule: c.rule })),
      unmapped_entities: unmapped.map((c) => ({ recipient_name: c.recipient_name, source_code: c.source_code })),
    },
    sanity: {
      negative_disbursement_rows: built.stats.negativeDisbursementRows,
      military_exceeds_total_rows: built.stats.militaryExceedsTotalRows,
      note: "Negative disbursements are documented source adjustments; kept as published.",
    },
    reconciliation: { thresholds: "<=0.5% pass; 0.5-5% investigate; >5% stop; FY2026 sanity only", targets: recon },
    top_country_recipients: { 2024: top(2024), 2025: top(2025), 2026: top(2026) },
    file_sizes_bytes: { "foreign_assistance.json": (await stat(`${OUT}/foreign_assistance.json`)).size },
  };
  await writeFile(`${OUT}/foreign_assistance_report.json`, JSON.stringify(report, null, 2) + "\n");

  console.log(`  ${built.rows.length} rows, FY${built.meta.first_fiscal_year}..FY${built.meta.latest_fiscal_year} (partial: ${report.coverage.partial_years.join(",") || "none"}), data through ${rawMeta.data_through}`);
  console.log(`  crosswalk: ${report.crosswalk.identity} identity, ${report.crosswalk.rule} by rule, ${report.crosswalk.unmapped} unmapped`);
  for (const r of recon) console.log(`  ${r.status.padEnd(11)} ${r.label.padEnd(38)} ${r.actual.toLocaleString("en-US")} vs ${r.expected.toLocaleString("en-US")} (${r.diff_pct}%)`);
}

if (process.argv[1]?.endsWith("foreign-aid-run.ts")) {
  main().catch((err: unknown) => {
    console.error("\ntransform:foreign-aid FAILED");
    console.error(err instanceof z.ZodError ? z.prettifyError(err) : err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
