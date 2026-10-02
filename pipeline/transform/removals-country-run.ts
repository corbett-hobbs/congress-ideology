import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { enforcementRow } from "../../lib/enforcement-entities";
import { removalsCountryReport, removalsCountryRow } from "../../lib/removals-country-entities";
import { RAW_DIR } from "../fetch/lib";
import { buildRemovalsByCountry, COUNTRY_TABLES } from "./removals-country";
import { indexCountries } from "./removals-country-names";

/**
 * ICE removals by country of citizenship: the text extracts in raw/ice (made by `pnpm fetch:ice`)
 * + output/enforcement_series.json (the national ICE series) + output/countries.json (the trade
 * crosswalk that defines `country_key`) -> output/{removals_by_country,removals_by_country_report}.json.
 * Run after enforcement-run and trade-run. Deterministic. Fails on any unreconciled year.
 */
const OUT = "pipeline/output";
const RAW = `${RAW_DIR}/ice`;

const oneRowPerLine = (rows: readonly unknown[]) =>
  rows.length === 0 ? "[]\n" : `[\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`;

async function main() {
  console.log("transform:removals-country");
  const catalog = JSON.parse(await readFile("pipeline/reference/ice-removals-catalog.json", "utf8")) as { sources: { id: string; text_file: string }[] };
  const textFile = new Map(catalog.sources.map((s) => [s.id, s.text_file]));
  const texts = new Map<string, string>();
  for (const spec of COUNTRY_TABLES) {
    const f = textFile.get(spec.source);
    if (!f) throw new Error(`${spec.source} is not in the ICE catalog`);
    texts.set(spec.source, await readFile(`${RAW}/${f}`, "utf8"));
  }
  const series = (JSON.parse(await readFile(`${OUT}/enforcement_series.json`, "utf8")) as unknown[]).map((r) => enforcementRow.parse(r));
  const national = new Map(series.map((r) => [r.period, r.value]));
  const countries = (JSON.parse(await readFile(`${OUT}/countries.json`, "utf8")) as { country_code: string; name: string; kind: string }[]).filter((c) => c.kind === "country" || c.kind === "former");
  const built = buildRemovalsByCountry({ texts, index: indexCountries(countries), national });

  const rows = built.rows.map((r) => removalsCountryRow.parse(r));
  const report = removalsCountryReport.parse(built.report);
  await mkdir(OUT, { recursive: true });
  await writeFile(`${OUT}/removals_by_country.json`, oneRowPerLine(rows));
  await writeFile(`${OUT}/removals_by_country_report.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(`  ${rows.length} rows, FY${report.first_fiscal_year}..FY${report.last_fiscal_year}; every year sums to the national ICE total`);
  console.log(`  review-flagged rows: ${rows.filter((r) => r.needs_review).length}; uncovered: ${report.uncovered_fiscal_years.map((u) => `FY${u.fiscal_year}`).join(", ")}`);
}

main().catch((err: unknown) => {
  console.error("\ntransform:removals-country FAILED");
  console.error(err instanceof z.ZodError ? z.prettifyError(err) : err instanceof Error ? err.message : err);
  process.exit(1);
});
