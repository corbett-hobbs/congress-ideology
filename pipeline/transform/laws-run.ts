import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { z } from "zod";
import { LawsDataError, ordinal, lawCommitteesFile, lawCosponsorsFile, lawCountRow, lawPolicyAreas, lawRow, lawsMeta, rawCongressFile, RAW_SOURCES, type RawCongressFile, type RawLaw } from "../../lib/laws-entities";
import { RAW_DIR } from "../fetch/lib";
import { areaIndex, splitPending, buildCommittees, buildCounts, buildLawRow, buildMeta, checkCounts, checkDates, checkNumbering, chooseSources, overlapDifferences, sponsorReport } from "./laws";

/**
 * Laws track transform: raw/govinfo-billstatus + raw/congress-gov (+ reference/law-*.json) ->
 *   laws.json, laws_counts.json, laws_cosponsors.json, laws_meta.json, laws_report.json
 * Deterministic (no run timestamp). Fails the build on any gate failure. See docs/LAWS_METHODOLOGY.md.
 */
const OUT = "pipeline/output";
const REF = "pipeline/reference";

const oneRowPerLine = (rows: readonly unknown[]) => (rows.length === 0 ? "[]\n" : `[\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`);
const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8")) as unknown;

async function readRaw(): Promise<RawCongressFile[]> {
  const files: RawCongressFile[] = [];
  for (const source of RAW_SOURCES) {
    const dir = `${RAW_DIR}/${source}`;
    if (!existsSync(dir)) continue;
    for (const name of (await readdir(dir)).filter((n) => /^\d+\.json$/.test(n))) {
      const f = rawCongressFile.safeParse(await readJson(`${dir}/${name}`));
      if (!f.success) throw new LawsDataError(`${dir}/${name} fails the schema: ${f.error.message.slice(0, 600)}`);
      if (f.data.source !== source || `${f.data.congress}.json` !== name) throw new LawsDataError(`${dir}/${name} says it is ${f.data.source} ${f.data.congress}`);
      files.push(f.data);
    }
  }
  return files;
}

/** Of the committee entries on a decade's laws, the share whose committee has a page. */
function committeeLinkShares(laws: readonly RawLaw[], file: { committees: Record<string, { page: boolean }>; laws: Record<string, [string, string[], string[]][]> }): Record<string, string> {
  const by = new Map<string, { n: number; page: number }>();
  for (const l of laws) {
    const decade = `${Math.floor((1789 + 2 * (l.congress - 1)) / 10) * 10}s`;
    for (const [id] of file.laws[l.law_id] ?? []) {
      const cur = by.get(decade) ?? { n: 0, page: 0 };
      cur.n++;
      if (file.committees[id]?.page) cur.page++;
      by.set(decade, cur);
    }
  }
  return Object.fromEntries([...by].sort().map(([d, v]) => [d, `${((100 * v.page) / v.n).toFixed(0)}% of ${v.n}`]));
}

async function main() {
  console.log("transform:laws");
  const areas = lawPolicyAreas.parse(await readJson(`${REF}/law-policy-areas.json`));
  const idx = areaIndex(areas);
  const independent = z.object({ counts: z.record(z.string(), z.number().int()) }).parse(await readJson(`${REF}/law-counts-independent.json`)).counts;
  const legislators = z.array(z.object({ bioguide_id: z.string() })).parse(await readJson(`${OUT}/legislators.json`));
  const known = new Set(legislators.map((l) => l.bioguide_id));
  const committeeRows = z.array(z.object({ committee_id: z.string() })).parse(await readJson(`${OUT}/committees.json`));
  const subcommitteeRows = z.array(z.object({ subcommittee_id: z.string() })).parse(await readJson(`${OUT}/subcommittees.json`));

  const chosen = chooseSources(await readRaw());
  const perCongress: Record<string, unknown>[] = [];
  const overlaps: Record<string, unknown>[] = [];
  const rawLaws: RawLaw[] = [];
  const unknownNames = new Map<string, number>();
  const pendingByCongress: Record<string, string[]> = {};
  for (const [congress, { primary: fullPrimary, overlap }] of chosen) {
    const partial = independent[String(congress)] === undefined;
    checkNumbering(fullPrimary, independent);
    const { file: primary, pending } = splitPending(fullPrimary, partial);
    if (pending.length > 0) pendingByCongress[congress] = pending;
    checkDates(primary);
    if (overlap) {
      checkNumbering(overlap, independent);
      const diffs = overlapDifferences(primary, overlap);
      if (diffs.length > 0) throw new LawsDataError(`${ordinal(congress)} Congress: ${primary.source} and ${overlap.source} disagree on ${diffs.length} field(s), e.g. ${diffs.slice(0, 3).join("; ")}`);
      overlaps.push({ congress, sources: [primary.source, overlap.source], laws: primary.laws.length, fields_compared: ["bill", "policy area", "sponsor", "introduced", "signing date", "origin chamber", "recorded votes"], disagreements: 0 });
    }
    rawLaws.push(...primary.laws);
    perCongress.push({
      congress,
      source: primary.source,
      laws: primary.laws.length,
      highest_number: primary.max_number,
      list_rows: primary.list_count,
      list_rows_beyond_laws: primary.list_count === null ? null : primary.list_count - primary.laws.length,
      independent_count: independent[String(congress)] ?? null,
      pending_without_signing_date: pending,
      fetched: primary.fetched,
      source_corrections: primary.corrections ?? [],
      multiple_became_law_dates: primary.laws.filter((l) => new Set(l.became_law).size > 1).map((l) => `${l.law_id}: ${l.became_law.join(", ")}`),
    });
  }

  const rows = z.array(lawRow).parse(rawLaws.map((l) => buildLawRow(l, idx)));
  const counts = z.array(lawCountRow).parse(buildCounts(rows));
  checkCounts(counts, rows);
  const cosponsors = lawCosponsorsFile.parse(Object.fromEntries(rawLaws.filter((l) => l.cosponsors.length > 0).map((l) => [l.law_id, l.cosponsors])));
  const committeeBuild = buildCommittees(rawLaws, { committees: new Set(committeeRows.map((c) => c.committee_id)), subcommittees: new Set(subcommitteeRows.map((c) => c.subcommittee_id)) });
  const committees = lawCommitteesFile.parse(committeeBuild.file);
  const meta = lawsMeta.parse(buildMeta({ rows, chosen, areas, independent }));
  const sp = sponsorReport(rawLaws, known);

  // Report: area names by decade, legacy terms, vetoes, sponsors.
  const names = new Map<string, number>();
  for (const l of rawLaws) {
    const k = l.policy_area ?? "(none)";
    names.set(k, (names.get(k) ?? 0) + 1);
    if (l.policy_area && !idx.byName.has(l.policy_area)) unknownNames.set(l.policy_area, (unknownNames.get(l.policy_area) ?? 0) + 1);
  }
  const notClassified = rows.filter((r) => r.area_id === "not-classified");
  const byCongressNC: Record<string, number> = {};
  for (const r of notClassified) byCongressNC[r.congress] = (byCongressNC[r.congress] ?? 0) + 1;
  const report = {
    laws: rows.length,
    congresses: `${meta.first_congress}-${meta.last_congress}`,
    partial_congresses: meta.partial_congresses,
    data_through: meta.data_through,
    sources: meta.sources,
    per_congress: perCongress,
    pending_laws: pendingByCongress,
    overlap_checks: overlaps,
    policy_areas: {
      by_name: Object.fromEntries([...names].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
      legacy_terms_seen: Object.fromEntries([...unknownNames].sort((a, b) => b[1] - a[1])),
      not_classified: notClassified.length,
      not_classified_by_congress: byCongressNC,
    },
    veto_overrides: rows.filter((r) => r.veto_override).map((r) => `${r.law_id} ${r.date}`),
    sponsors: { without_sponsor: sp.none, not_in_legislators: sp.unresolved, resolved: rawLaws.length - sp.none.length - sp.unresolved.length },
    cosponsors: { laws_with_cosponsors: Object.keys(cosponsors).length },
    committees: {
      laws_with_a_committee: Object.keys(committees.laws).length,
      distinct_ids: Object.keys(committees.committees).length,
      ids_with_a_page: Object.values(committees.committees).filter((c) => c.page).length,
      share_of_committee_links_with_a_page_by_decade: committeeLinkShares(rawLaws, committees),
      ids_with_more_than_one_name: [...committeeBuild.names].filter(([, m]) => m.size > 1).map(([id, m]) => `${id}: ${[...m.keys()].join(" / ")}`),
    },
    gates: ["law numbers 1..N with none missing or repeated", "N equals the independent count (Statutes at Large / GovInfo PLAW) where there is one", "every law dated 3 Jan..20 Jan after its Congress", "every policy-area name is a CRS area or a listed legacy term", "counts add back to the list per Congress", "Bill Status and the API agree where both cover a Congress"],
  };

  await mkdir(OUT, { recursive: true });
  await writeFile(`${OUT}/laws.json`, oneRowPerLine(rows));
  await writeFile(`${OUT}/laws_counts.json`, oneRowPerLine(counts));
  const ids = Object.keys(cosponsors);
  await writeFile(`${OUT}/laws_cosponsors.json`, `{\n${ids.map((id) => `${JSON.stringify(id)}: ${JSON.stringify(cosponsors[id])}`).join(",\n")}\n}\n`);
  const cids = Object.keys(committees.laws);
  await writeFile(
    `${OUT}/laws_committees.json`,
    `{\n"committees": {\n${Object.entries(committees.committees).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n")}\n},\n"laws": {\n${cids.map((id) => `${JSON.stringify(id)}: ${JSON.stringify(committees.laws[id])}`).join(",\n")}\n}\n}\n`,
  );
  await writeFile(`${OUT}/laws_meta.json`, JSON.stringify(meta, null, 2) + "\n");
  await writeFile(`${OUT}/laws_report.json`, JSON.stringify(report, null, 2) + "\n");
  const kb = async (f: string) => ((await stat(`${OUT}/${f}`)).size / 1024).toFixed(0);
  console.log(`  ${rows.length} laws, Congresses ${report.congresses}, ${counts.length} count rows; laws.json ${await kb("laws.json")} KB, cosponsors ${await kb("laws_cosponsors.json")} KB; gates ok`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
