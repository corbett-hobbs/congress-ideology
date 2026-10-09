import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { RAW_DIR, run } from "./lib";
import { ROLLCALLS_URL, reduceRollcalls, rollcallManifest } from "./voteview-rollcalls-lib";

/**
 * Voteview roll calls, 93rd Congress on -> `pipeline/raw/voteview/rollcalls_93on.json` (+ `rollcalls_manifest.json`).
 * Keyless. The source file is ~30 MB for every Congress back to 1789; only the rows the Laws track checks tallies against are kept,
 * one roll call per line. Voteview is a hand-maintained academic file and trails the live feed: the manifest records its last date per
 * chamber so the Laws transform knows which newer laws it cannot check. Not part of `fetch:all`.
 */
const DIR = `${RAW_DIR}/voteview`;

await run("voteview-rollcalls", async () => {
  const res = await fetch(ROLLCALLS_URL, { headers: { "user-agent": "InsideGov-pipeline/0.1 (+https://github.com/corbett-hobbs/insidegov)" } });
  if (!res.ok) throw new Error(`GET ${ROLLCALLS_URL} -> ${res.status} ${res.statusText}`);
  const body = Buffer.from(await res.arrayBuffer());
  const rows = reduceRollcalls(body.toString("utf8"));
  const last = { H: "", S: "" };
  for (const r of rows) if (r[3] > last[r[1]]) last[r[1]] = r[3];
  rows.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) || a[2] - b[2]);
  await mkdir(DIR, { recursive: true });
  await writeFile(`${DIR}/rollcalls_93on.json`, `[\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`);
  const manifest = rollcallManifest.parse({ url: ROLLCALLS_URL, source_bytes: body.length, source_sha256: createHash("sha256").update(body).digest("hex"), rows: rows.length, first_congress: 93, last_date: last, fetched: new Date().toISOString().slice(0, 10) });
  await writeFile(`${DIR}/rollcalls_manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`  ${rows.length} roll calls (93rd on); last House ${last.H}, last Senate ${last.S}`);
});
