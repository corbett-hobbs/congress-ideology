import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { z } from "zod";
import { committeeBillsMeta, committeeBillsShard, CommitteeBillsDataError, rawBillsFile } from "../../lib/committee-bills-entities";
import { lawRow } from "../../lib/laws-entities";
import { RAW_DIR } from "../fetch/lib";
import { buildShards, checkLaws, dataThrough, type EnactingBill, type KnownCommittee, type KnownSubcommittee } from "./committee-bills";

/**
 * Committee-legislation transform: raw/govinfo-bills/<current Congress>.json + committees.json + subcommittees.json ->
 *   committee_bills/<COMMITTEE_ID>.json (one shard per committee with bills), committee_bills_meta.json, committee_bills_report.json
 * Deterministic (no run timestamp). Fails the build when the bills' public laws differ from laws.json. See docs/COMMITTEE_BILLS_METHODOLOGY.md.
 */
const OUT = "pipeline/output";
const DIR = `${RAW_DIR}/govinfo-bills`;

const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8")) as unknown;
const oneRowPerLine = (rows: readonly unknown[]) => (rows.length === 0 ? "[]\n" : `[\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`);

/** One shard: a short head, then one bill per line so a weekly refresh diffs bill by bill. */
function formatShard(s: z.infer<typeof committeeBillsShard>): string {
  const { rows, ...head } = s;
  return `{\n${Object.entries(head)
    .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join("\n")}\n"rows": ${oneRowPerLine(rows).trimEnd()}\n}\n`;
}

async function main() {
  const names = existsSync(DIR) ? (await readdir(DIR)).filter((n) => /^\d+\.json$/.test(n)) : [];
  if (names.length === 0) {
    console.log("transform:committee-bills — no raw bills file yet (pnpm fetch:billstatus); nothing written");
    return;
  }
  const congress = Math.max(...names.map((n) => Number(n.replace(".json", ""))));
  const parsed = rawBillsFile.safeParse(await readJson(`${DIR}/${congress}.json`));
  if (!parsed.success) throw new CommitteeBillsDataError(`${DIR}/${congress}.json fails the schema: ${parsed.error.message.slice(0, 600)}`);
  const raw = parsed.data;
  if (raw.congress !== congress) throw new CommitteeBillsDataError(`${DIR}/${congress}.json says it is the ${raw.congress}th Congress`);

  const committees = z.array(z.object({ committee_id: z.string(), chamber: z.enum(["house", "senate", "joint"]) })).parse(await readJson(`${OUT}/committees.json`)) as KnownCommittee[];
  const subs = z.array(z.object({ subcommittee_id: z.string(), parent_committee_id: z.string(), name: z.string() })).parse(await readJson(`${OUT}/subcommittees.json`)) as KnownSubcommittee[];
  const laws = z.array(lawRow).parse(await readJson(`${OUT}/laws.json`));

  const vehicles = new Map<string, EnactingBill>(laws.filter((l) => l.congress === congress).map((l) => [`${l.congress}-${l.law_id.split("-pub-")[1]}`, { b: l.bill_type, n: String(l.bill_number) }]));
  const { shards, report } = buildShards(raw.bills, congress, committees, subs, vehicles);
  checkLaws(report.law_numbers, laws.filter((l) => l.congress === congress).map((l) => `${l.congress}-${l.law_id.split("-pub-")[1]}`), congress);

  const through = dataThrough(raw.bills);
  if (through > raw.fetched) throw new CommitteeBillsDataError(`an event is dated ${through}, after the file was fetched (${raw.fetched})`);

  await rm(`${OUT}/committee_bills`, { recursive: true, force: true });
  await mkdir(`${OUT}/committee_bills`, { recursive: true });
  for (const [id, shard] of shards) await writeFile(`${OUT}/committee_bills/${id}.json`, formatShard(committeeBillsShard.parse(shard)));
  const meta = committeeBillsMeta.parse({
    congress,
    data_through: through,
    bills: raw.bills.length,
    rows: report.rows,
    committees: Object.fromEntries([...shards].map(([id, s]) => [id, s.rows.length])),
  });
  await writeFile(`${OUT}/committee_bills_meta.json`, JSON.stringify(meta, null, 2) + "\n");
  const { law_numbers, ...rest } = report;
  await writeFile(`${OUT}/committee_bills_report.json`, JSON.stringify({ ...rest, public_laws: law_numbers.length, shards: shards.size }, null, 2) + "\n");
  const unmapped = Object.keys(report.unmapped_committees).length;
  console.log(`transform:committee-bills ok — ${raw.bills.length} bills, ${report.rows} rows in ${shards.size} committees (${unmapped} unmapped committee codes), through ${through}`);
}

main().catch((err) => {
  console.error("transform:committee-bills failed");
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
