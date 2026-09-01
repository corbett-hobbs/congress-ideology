import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { RAW_DIR } from "../fetch/lib";
import { legislator, voteviewMemberRow } from "../validate/schemas";
import { readCsvRows, readYamlList, validateAll } from "../validate/lib";
import { buildCrosswalk, resolveBioguide, type Resolution } from "./crosswalk";

/**
 * Transform stage — STUB.
 *
 * Session 2 builds the real transforms that emit the normalized Legislator /
 * Term / IssueScore JSON described in docs/DATA_CONVENTIONS.md §2. For now this
 * just proves the pipeline runs end to end: read validated raw data, build the
 * icpsr -> bioguide_id crosswalk, apply it to every Voteview member row, and
 * write a manifest of what happened to pipeline/output/.
 *
 * It does not fail on mismatches / unmapped rows yet — it counts them, so
 * Session 2 starts with a clear picture of the crosswalk's real coverage.
 */

const OUTPUT_DIR = "pipeline/output";
const MANIFEST = `${OUTPUT_DIR}/_manifest.json`;

async function sourceDigest(path: string) {
  const buf = await readFile(path);
  return {
    path,
    bytes: buf.byteLength,
    sha256: createHash("sha256").update(buf).digest("hex"),
  };
}

console.log("transform (stub)");

const legislatorFiles = [
  `${RAW_DIR}/congress-legislators/legislators-current.yaml`,
  `${RAW_DIR}/congress-legislators/legislators-historical.yaml`,
];
const membersFile = `${RAW_DIR}/voteview/HSall_members.csv`;

const legislators = (
  await Promise.all(
    legislatorFiles.map(async (file) =>
      validateAll(file, await readYamlList(file), legislator, (_r, i) => `entry ${i}`),
    ),
  )
).flat();

const crosswalk = buildCrosswalk(legislators);

const memberRows = validateAll(
  membersFile,
  await readCsvRows(membersFile),
  voteviewMemberRow,
  (_r, i) => `row ${i + 2}`,
).filter((row) => row.chamber !== "President");

type TallyKey = "agree" | "crosswalk" | "voteview" | "unmapped" | "mismatch";
const tally: Record<TallyKey, number> = {
  agree: 0,
  crosswalk: 0,
  voteview: 0,
  unmapped: 0,
  mismatch: 0,
};
const mismatchSamples: Resolution[] = [];

for (const row of memberRows) {
  const res = resolveBioguide(row.icpsr, row.bioguide_id || undefined, crosswalk);
  if (res.ok) {
    tally[res.source] += 1;
  } else {
    tally[res.reason] += 1;
    if (res.reason === "mismatch" && mismatchSamples.length < 10) {
      mismatchSamples.push(res);
    }
  }
}

const sources = await Promise.all(
  [membersFile, ...legislatorFiles].map(sourceDigest),
);

const manifest = {
  note: "Stub output. Real entity JSON lands in Session 2 — see docs/DATA_CONVENTIONS.md.",
  // Deterministic: a function of the inputs only, so re-running without a data
  // change produces no git diff.
  sourcesHash: createHash("sha256")
    .update(sources.map((s) => s.sha256).join("\n"))
    .digest("hex"),
  sources,
  legislators: {
    entries: legislators.length,
    crosswalkEntries: crosswalk.byIcpsr.size,
    crosswalkConflicts: crosswalk.conflicts,
  },
  voteviewMembers: {
    rowsExcludingPresidents: memberRows.length,
    bioguideResolution: tally,
    mismatchSamples,
  },
};

await mkdir(OUTPUT_DIR, { recursive: true });
await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

console.log(`  legislators: ${legislators.length} (${crosswalk.byIcpsr.size} icpsr mapped, ${crosswalk.conflicts.length} conflicts)`);
console.log(`  voteview member rows: ${memberRows.length}`);
console.log(`  bioguide resolution: ${JSON.stringify(tally)}`);
console.log(`  wrote ${MANIFEST}`);
