import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { parse as parseCsv } from "csv-parse/sync";
import { z } from "zod";
import {
  courtMedianProbability,
  courtTermRow,
  justice as justiceSchema,
  justiceCrosswalkEntry,
  mqScore,
} from "../../lib/court-entities";
import { latestReleaseYear } from "../fetch/mq-check";
import { RAW_DIR } from "../fetch/lib";
import {
  CourtDataError,
  buildFjcJustices,
  buildIdentityMap,
  buildJustices,
  buildMqScores,
  mqSpans,
  parseMqCourt,
  parseMqJustices,
  resolveCrosswalk,
  validateCourtData,
} from "./court";

/**
 * Supreme Court track transform: raw/mq (latest release) + raw/fjc ->
 * pipeline/output/court/{justices,mq_scores,court_terms,
 * court_median_probabilities}.json + _report.json.
 *
 * Works identically from a fetched or a hand-placed MQ snapshot. Fatal (exit 1)
 * on any validation failure, crosswalk miss/ambiguity, or a snapshot whose
 * files no longer match the hashes in its SOURCE.json.
 */
const MQ_DIR = `${RAW_DIR}/mq`;
const FJC_DIR = `${RAW_DIR}/fjc`;
const CROSSWALK = "pipeline/transform/court-crosswalk.json";
const OUT = "pipeline/output/court";

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

async function readCsv(path: string): Promise<Record<string, string>[]> {
  return parseCsv(await readFile(path, "utf8"), { columns: true, skip_empty_lines: true, bom: true });
}

function checked<T>(name: string, schema: z.ZodType<T>, rows: readonly unknown[]): T[] {
  return rows.map((row, i) => {
    const r = schema.safeParse(row);
    if (!r.success) {
      throw new CourtDataError(`court/${name}.json: row ${i} fails the entity schema\n${z.prettifyError(r.error)}\n${JSON.stringify(row)}`);
    }
    return r.data;
  });
}

async function writeRows(name: string, rows: readonly unknown[]) {
  const body = rows.length === 0 ? "[]\n" : `[\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`;
  await writeFile(`${OUT}/${name}.json`, body);
}

async function main() {
  console.log("transform:court");
  const year = latestReleaseYear(existsSync(MQ_DIR) ? await readdir(MQ_DIR) : []);
  if (year === null) {
    throw new CourtDataError(
      `no release folder under ${MQ_DIR}/. Download justices.csv and court.csv from https://mqscores.wustl.edu/measures.php, place them in ${MQ_DIR}/<year>/, then run \`pnpm fetch:mq -- --adopt <year>\`.`,
    );
  }
  const dir = `${MQ_DIR}/${year}`;

  // Integrity: the snapshot on disk must be the one SOURCE.json describes.
  const source = JSON.parse(await readFile(`${dir}/SOURCE.json`, "utf8")) as {
    release_label: string | null;
    retrieved_via: string;
    retrieved_on: string;
    sha256: Record<string, string>;
  };
  for (const file of ["justices.csv", "court.csv"]) {
    const actual = sha256(await readFile(`${dir}/${file}`));
    if (actual !== source.sha256[file]) {
      throw new CourtDataError(`${dir}/${file} does not match the sha256 in SOURCE.json — re-run \`pnpm fetch:mq -- --adopt ${year}\` if the change is intentional.`);
    }
  }

  const mqRows = parseMqJustices(await readCsv(`${dir}/justices.csv`));
  const nameToId = buildIdentityMap(mqRows);
  const scores = checked("mq_scores", mqScore, buildMqScores(mqRows));
  const { courtTerms, probabilities } = parseMqCourt(await readCsv(`${dir}/court.csv`), nameToId);

  const fjc = buildFjcJustices(
    await readCsv(`${FJC_DIR}/federal-judicial-service.csv`),
    await readCsv(`${FJC_DIR}/demographics.csv`),
  );
  const crosswalk = checked(
    "crosswalk",
    justiceCrosswalkEntry,
    JSON.parse(await readFile(CROSSWALK, "utf8")) as unknown[],
  );
  const spans = mqSpans(mqRows);
  const matched = resolveCrosswalk(crosswalk, spans, fjc);
  const justices = checked("justices", justiceSchema, buildJustices(spans, matched));

  const summary = validateCourtData({
    justices,
    scores,
    courtTerms: checked("court_terms", courtTermRow, courtTerms),
    probabilities: checked("court_median_probabilities", courtMedianProbability, probabilities),
  });

  await mkdir(OUT, { recursive: true });
  await writeRows("justices", justices);
  await writeRows("mq_scores", scores);
  await writeRows("court_terms", courtTerms);
  await writeRows("court_median_probabilities", probabilities);
  await writeFile(
    `${OUT}/_report.json`,
    JSON.stringify(
      {
        source: {
          release_year: year,
          release_label: source.release_label,
          retrieved_via: source.retrieved_via,
          sha256: source.sha256,
        },
        bios: JSON.parse(await readFile(`${FJC_DIR}/SOURCE.json`, "utf8")).sha256,
        counts: {
          justices: justices.length,
          mq_scores: scores.length,
          court_terms: courtTerms.length,
          court_median_probabilities: probabilities.length,
        },
        term_range: [summary.firstTerm, summary.lastTerm],
        justices_per_term: summary.justicesPerTerm,
        anomalies: summary.explainedExceptions,
        crosswalk: crosswalk.map((e) => ({
          justice_id: e.justice_id,
          mq: e.scdb_name,
          fjc_name: justices.find((j) => j.justice_id === e.justice_id)!.name.full,
        })),
      },
      null,
      2,
    ) + "\n",
  );

  console.log(
    `  release ${source.release_label ?? year} (${source.retrieved_via}): ${justices.length} justices, ${scores.length} scores, terms ${summary.firstTerm}-${summary.lastTerm}, ${courtTerms.length} court records`,
  );
  for (const e of summary.explainedExceptions) console.log(`  note: term ${e.term} has ${e.count} justices — ${e.reason}`);
}

main().catch((err: unknown) => {
  console.error("\ntransform:court FAILED");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
