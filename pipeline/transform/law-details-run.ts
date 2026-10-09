import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { z } from "zod";
import { lawDetailsShard, type LawDetailsShard } from "../../lib/law-details-entities";
import { LawsDataError, lawRow, rawCongressFile, RAW_SOURCES, type RawLaw } from "../../lib/laws-entities";
import { RAW_DIR } from "../fetch/lib";
import { buildLawDetail, lawIdDifferences } from "./law-details";
import { chooseSources, splitPending } from "./laws";

/**
 * Law pages transform: the same raw files as the Laws track (raw/govinfo-billstatus 108th-, raw/congress-gov 93rd-107th) ->
 * `pipeline/output/law_details/<congress>.json`, one shard per Congress. Run after `laws-run.ts`: the gate compares the
 * shards' law ids with `laws.json`. Deterministic; fails on any gate failure.
 */
const OUT = "pipeline/output";
const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8")) as unknown;

/** One law per line, so a weekly refresh diffs law by law. */
function formatShard(s: LawDetailsShard): string {
  const lines = Object.entries(s.laws).map(([id, d]) => `${JSON.stringify(id)}:${JSON.stringify(d)}`);
  return `{\n"congress":${s.congress},\n"laws":{\n${lines.join(",\n")}\n}\n}\n`;
}

async function main() {
  const files = [];
  for (const source of RAW_SOURCES) {
    const dir = `${RAW_DIR}/${source}`;
    if (!existsSync(dir)) continue;
    for (const name of (await readdir(dir)).filter((n) => /^\d+\.json$/.test(n))) {
      const f = rawCongressFile.safeParse(await readJson(`${dir}/${name}`));
      if (!f.success) throw new LawsDataError(`${dir}/${name} fails the schema: ${f.error.message.slice(0, 600)}`);
      files.push(f.data);
    }
  }
  const independent = z.object({ counts: z.record(z.string(), z.number().int()) }).parse(await readJson("pipeline/reference/law-counts-independent.json")).counts;
  const laws = z.array(lawRow).parse(await readJson(`${OUT}/laws.json`));

  await rm(`${OUT}/law_details`, { recursive: true, force: true });
  await mkdir(`${OUT}/law_details`, { recursive: true });
  const shardIds: string[] = [];
  let withSummary = 0;
  let cut = 0;
  let actions = 0;
  for (const [congress, { primary }] of [...chooseSources(files)].sort((a, b) => a[0] - b[0])) {
    // The same laws `laws-run.ts` keeps: a law with no signing date yet in a Congress still in progress is not a law row.
    const kept: RawLaw[] = splitPending(primary, independent[String(congress)] === undefined).file.laws;
    const shard = lawDetailsShard.parse({ congress, laws: Object.fromEntries(kept.map((l) => [l.law_id, buildLawDetail(l)])) });
    for (const d of Object.values(shard.laws)) {
      if (d.summary) withSummary++;
      if (d.cut) cut++;
      actions += d.actions.length;
    }
    shardIds.push(...Object.keys(shard.laws));
    await writeFile(`${OUT}/law_details/${congress}.json`, formatShard(shard));
  }
  const diff = lawIdDifferences(shardIds, laws.map((l) => l.law_id));
  if (diff.missing.length > 0 || diff.extra.length > 0) {
    throw new LawsDataError(`law_details shards and laws.json disagree: ${diff.missing.length} missing (${diff.missing.slice(0, 5).join(", ")}), ${diff.extra.length} extra (${diff.extra.slice(0, 5).join(", ")})`);
  }
  console.log(`transform:law-details ok — ${shardIds.length} laws, ${withSummary} with a summary (${cut} cut at the fetch cap), ${actions} actions`);
}

main().catch((err) => {
  console.error("transform:law-details failed");
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
