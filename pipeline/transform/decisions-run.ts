import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { z } from "zod";
import {
  DISSENT_BUCKET_LABELS,
  DecisionsDataError,
  chiefReference,
  decisionCaseRow,
  decisionCountRow,
  landmarkRow,
  landmarksManifest,
  decisionsMeta,
  issueAreaCatalog,
  scdbManifest,
} from "../../lib/decisions-entities";
import { ADMINISTRATIONS } from "./administrations";
import { HISTORICAL_ADMINISTRATIONS } from "../../lib/troops-presidents";
import { RAW_DIR } from "../fetch/lib";
import { checkLandmarks, matchLandmarks, parseLandmarkList } from "./landmarks";
import { buildCaseRows, buildChiefSpans, buildCounts, buildMeta, checkChiefReference, parseScdb, recountFromCsv, runGates, selectCases } from "./decisions";

/**
 * Decisions track transform: raw/scdb (the pinned release in manifest.json) ->
 *   decisions_counts.json, decisions_meta.json, decisions_report.json
 * Deterministic (no run timestamp). Fails the build on any gate failure. See docs/DECISIONS_METHODOLOGY.md.
 */
const DIR = `${RAW_DIR}/scdb`;
const OUT = "pipeline/output";
const REF = "pipeline/reference";

const oneRowPerLine = (rows: readonly unknown[]) => (rows.length === 0 ? "[]\n" : `[\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`);
const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8")) as unknown;
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

async function main() {
  console.log("transform:decisions");
  const manifest = scdbManifest.parse(await readJson(`${DIR}/manifest.json`).catch(() => {
    throw new DecisionsDataError(`${DIR}/manifest.json is missing; run pnpm fetch:scdb -- 2026_01`);
  }));
  const csvBuf = await readFile(`${DIR}/${manifest.csv_file}`);
  if (sha256(csvBuf) !== manifest.csv_sha256) throw new DecisionsDataError(`${manifest.csv_file} does not match the sha256 in manifest.json; re-run pnpm fetch:scdb`);
  const text = csvBuf.toString("latin1");

  const catalog = issueAreaCatalog.parse(await readJson(`${REF}/decision-issue-areas.json`)).areas;
  const chiefs = chiefReference.parse(await readJson(`${REF}/chief-justices.json`)).chiefs;
  const justices = z.array(z.object({ justice_id: z.number(), chief_justice_appointment: z.object({ president: z.string(), party: z.string() }).nullable() }).loose()).parse(await readJson(`${OUT}/court/justices.json`));
  checkChiefReference(chiefs, justices, [...HISTORICAL_ADMINISTRATIONS, ...ADMINISTRATIONS]);

  const rows = parseScdb(text);
  if (rows.length !== manifest.rows) throw new DecisionsDataError(`manifest says ${manifest.rows} rows, parsed ${rows.length}`);
  const selection = selectCases(rows);
  const counts = z.array(decisionCountRow).parse(buildCounts(selection.cases, catalog));
  const spans = buildChiefSpans(selection.cases, chiefs);
  // Wikipedia's list of landmark decisions -> the cases it names.
  const lmManifest = landmarksManifest.parse(await readJson(`${RAW_DIR}/wikipedia-landmarks/manifest.json`).catch(() => {
    throw new DecisionsDataError("pipeline/raw/wikipedia-landmarks/manifest.json is missing; run pnpm fetch:landmarks");
  }));
  const lmText = await readFile(`${RAW_DIR}/wikipedia-landmarks/list.wikitext`, "utf8");
  if (sha256(Buffer.from(lmText)) !== lmManifest.sha256) throw new DecisionsDataError("list.wikitext does not match the sha256 in its manifest; re-run pnpm fetch:landmarks");
  const lmEntries = parseLandmarkList(lmText);
  const lm = matchLandmarks(lmEntries, rows, selection.cases);
  const landmarks = z.array(landmarkRow).parse(lm.rows);
  checkLandmarks(lmEntries, landmarks, lm.report, new Set(selection.cases.map((c) => c.caseId)));

  const meta = decisionsMeta.parse({
    ...buildMeta({ version: manifest.version, sourceFile: manifest.csv_file, cases: selection.cases, selection, catalog, spans }),
    landmarks: { count: landmarks.length, page: lmManifest.page, url: lmManifest.url, revision_id: lmManifest.revid, revision_date: lmManifest.revision_timestamp.slice(0, 10), license: lmManifest.license },
  });
  const caseRows = z.array(decisionCaseRow).parse(buildCaseRows(selection.cases, catalog));
  const gates = runGates({ version: manifest.version, counts, caseRows, meta, recount: recountFromCsv(text) });

  // Human report: totals by bucket, by decade, by issue area.
  const bucketTotals = [0, 0, 0, 0, 0];
  const byDecade: Record<string, number> = {};
  const byArea: Record<string, number> = {};
  for (const r of counts) {
    [r.d0, r.d1, r.d2, r.d3, r.d4].forEach((v, i) => (bucketTotals[i]! += v));
    const decade = `${Math.floor(r.term / 10) * 10}s`;
    byDecade[decade] = (byDecade[decade] ?? 0) + r.n;
    const k = r.issue_area_id ?? "(unclassified)";
    byArea[k] = (byArea[k] ?? 0) + r.n;
  }
  const report = {
    scdb_version: meta.scdb_version,
    csv_sha256: manifest.csv_sha256,
    raw_rows: rows.length,
    cases: meta.case_count,
    terms: `${meta.first_term}-${meta.data_through_term}`,
    exclusions: meta.exclusions,
    unclassified: meta.unclassified_count,
    bucket_totals: Object.fromEntries(DISSENT_BUCKET_LABELS.map((l, i) => [l, bucketTotals[i]])),
    unanimous_share: Number((bucketTotals[0]! / meta.case_count).toFixed(3)),
    five_four_share: Number((bucketTotals[4]! / meta.case_count).toFixed(3)),
    cases_by_decade: byDecade,
    cases_by_issue_area: byArea,
    chief_spans: spans.map((s) => `${s.name} ${s.start_term}-${s.end_term} (${s.appointing_president}, ${s.appointing_party})`),
    landmarks: {
      source: `${lmManifest.page}, revision ${lmManifest.revid} (${lmManifest.revision_timestamp})`,
      entries: lm.report.entries,
      pre_scdb: lm.report.pre_1946,
      matched: lm.report.matched,
      by_via: lm.report.by_via,
      out_of_scope: lm.report.out_of_scope,
      unmatched: lm.report.unmatched,
      name_matches: lm.report.name_matches,
    },
    gates,
    count_rows: counts.length,
  };

  await mkdir(OUT, { recursive: true });
  await writeFile(`${OUT}/decisions_counts.json`, oneRowPerLine(counts));
  await writeFile(`${OUT}/decisions_cases.json`, oneRowPerLine(caseRows));
  await writeFile(`${OUT}/decisions_landmarks.json`, oneRowPerLine(landmarks));
  await writeFile(`${OUT}/decisions_meta.json`, JSON.stringify(meta, null, 2) + "\n");
  await writeFile(`${OUT}/decisions_report.json`, JSON.stringify(report, null, 2) + "\n");
  const size = (await stat(`${OUT}/decisions_counts.json`)).size;
  console.log(`  ${meta.case_count} cases, terms ${report.terms}, ${counts.length} count rows (${(size / 1024).toFixed(0)} KB), gates ok; ${caseRows.length} case rows`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
