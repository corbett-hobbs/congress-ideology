import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { z } from "zod";
import {
  DISSENT_BUCKET_LABELS,
  DecisionsDataError,
  chiefReference,
  caseArticleRow,
  caseLeadsManifest,
  caseSummaryRow,
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
import type { WikiCaseEntry } from "../fetch/wikipedia-cases-lib";
import { checkWikipediaCases, matchWikipediaCases, type WikiVia } from "./wikipedia-cases";
import { CASE_SUMMARIES_AI, aiSummaryCache, buildCaseSummaries, checkCaseSummaries } from "./wikipedia-case-summaries";
import { checkLandmarks, leadLandmarks, matchLandmarks, parseLandmarkList } from "./landmarks";
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
  const listed = z.array(landmarkRow).parse(lm.rows);
  checkLandmarks(lmEntries, listed, lm.report, new Set(selection.cases.map((c) => c.caseId)));

  // Wikipedia's volume and term lists -> the article for each case (landmarks keep the list's own link).
  const wiki = JSON.parse(await readFile(`${RAW_DIR}/wikipedia-cases/articles.json`, "utf8").catch(() => {
    throw new DecisionsDataError("pipeline/raw/wikipedia-cases/articles.json is missing; run pnpm fetch:wikipedia-cases");
  })) as { entries: WikiCaseEntry[]; redirects: Record<string, string> };
  const wc = matchWikipediaCases(wiki.entries, selection.cases, wiki.redirects);
  checkWikipediaCases(wc.rows, wc.report, new Set(selection.cases.map((c) => c.caseId)));
  const articleBy = new Map<string, { title: string | null; via: WikiVia | null }>(wc.rows.map((r) => [r.case_id, { title: r.title, via: r.via }]));
  // A landmark's article is the list's own link; a case a list shows as a red link has no article (title null); a case on no list has no row.
  for (const l of listed) articleBy.set(l.case_id, { title: l.title, via: l.via as WikiVia });
  const redLinked = new Set(wc.report.red_linked);
  for (const id of redLinked) if (!articleBy.has(id)) articleBy.set(id, { title: null, via: null });
  const articles = z.array(caseArticleRow).parse([...articleBy].map(([case_id, a]) => ({ case_id, ...a })).sort((a, b) => a.case_id.localeCompare(b.case_id)));

  // One sentence per linked case from the opening of its article (`pnpm fetch:wikipedia-case-leads`).
  const leadsManifest = caseLeadsManifest.parse(await readJson(`${RAW_DIR}/wikipedia-cases/leads-manifest.json`).catch(() => {
    throw new DecisionsDataError("pipeline/raw/wikipedia-cases/leads-manifest.json is missing; run pnpm fetch:wikipedia-case-leads");
  }));
  const leadsText = await readFile(`${RAW_DIR}/wikipedia-cases/leads.json`, "utf8");
  if (sha256(Buffer.from(leadsText)) !== leadsManifest.sha256) throw new DecisionsDataError("leads.json does not match the sha256 in its manifest; re-run pnpm fetch:wikipedia-case-leads");
  const linked = articles.flatMap((a) => (a.title === null ? [] : [{ case_id: a.case_id, title: a.title }]));
  // Landmarks the list has not caught up with: the article's own first sentence says "landmark".
  const leadRows = leadLandmarks(linked, (JSON.parse(leadsText) as { leads: Record<string, string> }).leads, new Set(listed.map((l) => l.case_id)));
  const landmarks = z.array(landmarkRow).parse([...listed, ...leadRows].sort((a, b) => a.case_id.localeCompare(b.case_id)));
  // Sentences the model wrote for articles the plain picker cannot use (`pnpm summarize:cases`); absent file = none yet.
  const aiCache = aiSummaryCache.parse(await readJson(CASE_SUMMARIES_AI).catch(() => []));
  const cs = buildCaseSummaries(linked, (JSON.parse(leadsText) as { leads: Record<string, string> }).leads, new Map(aiCache.map((e) => [e.title, e.summary])));
  checkCaseSummaries(cs.rows, linked.length, new Set(selection.cases.map((c) => c.caseId)));
  const summaries = z.array(caseSummaryRow).parse(cs.rows.sort((a, b) => a.case_id.localeCompare(b.case_id)));

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
    outcome_direction: {
      liberal: caseRows.filter((r) => r.direction === "liberal").length,
      conservative: caseRows.filter((r) => r.direction === "conservative").length,
      none: caseRows.filter((r) => r.direction === null).length,
    },
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
      from_article_lead: leadRows.map((r) => r.title),
    },
    case_articles: {
      cases: wc.report.cases,
      linked: articles.filter((a) => a.title !== null).length,
      by_via: wc.report.by_via,
      no_article: wc.report.no_article,
      unlisted: wc.report.unlisted,
      conflicts: wc.report.conflicts,
      name_matches: wc.report.name_matches,
    },
    case_summaries: { fetched: leadsManifest.fetched, linked_cases: linked.length, cases_with_summary: summaries.length, ...cs.report },
    gates,
    count_rows: counts.length,
  };

  await mkdir(OUT, { recursive: true });
  await writeFile(`${OUT}/decisions_counts.json`, oneRowPerLine(counts));
  await writeFile(`${OUT}/decisions_cases.json`, oneRowPerLine(caseRows));
  await writeFile(`${OUT}/decisions_landmarks.json`, oneRowPerLine(landmarks));
  await writeFile(`${OUT}/decisions_articles.json`, oneRowPerLine(articles));
  await writeFile(`${OUT}/decisions_summaries.json`, oneRowPerLine(summaries));
  await writeFile(`${OUT}/decisions_meta.json`, JSON.stringify(meta, null, 2) + "\n");
  await writeFile(`${OUT}/decisions_report.json`, JSON.stringify(report, null, 2) + "\n");
  const size = (await stat(`${OUT}/decisions_counts.json`)).size;
  console.log(`  ${meta.case_count} cases, terms ${report.terms}, ${counts.length} count rows (${(size / 1024).toFixed(0)} KB), gates ok; ${caseRows.length} case rows`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
