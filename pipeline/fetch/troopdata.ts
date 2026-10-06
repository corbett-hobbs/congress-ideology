import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { run } from "./lib";
import { TROOPDATA_COMMIT, TROOPDATA_FILES, TROOPDATA_MANIFEST_PATH, TROOPDATA_RAW_DIR, TROOPDATA_REPO, parseTroopdataManifest, troopdataRawPath, troopdataUrl, type TroopdataManifest } from "./troopdata-lib";

/**
 * The `troopdata` quarter-format country file (Allen, Flynn and Martinez Machain 2022; Kane 2005), the backfill for
 * 1950-2007 in the troops-abroad track, snapshotted unchanged into `pipeline/raw/troopdata/` at a pinned commit. The
 * package is GPL-3.0: its LICENSE.md travels with the data and the credit is in docs/CREDITS.md. Keyless, public.
 * A file already on disk with the manifest's hash is not rewritten. See docs/TROOPS_METHODOLOGY.md.
 */
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

await run("troopdata", async () => {
  await mkdir(TROOPDATA_RAW_DIR, { recursive: true });
  const prev = existsSync(TROOPDATA_MANIFEST_PATH) ? parseTroopdataManifest(JSON.parse(await readFile(TROOPDATA_MANIFEST_PATH, "utf8"))) : null;
  const same = prev?.commit === TROOPDATA_COMMIT;
  const files: TroopdataManifest["files"] = [];
  for (const f of TROOPDATA_FILES) {
    const dest = troopdataRawPath(f.file);
    const old = same ? prev!.files.find((x) => x.file === f.file) : undefined;
    if (old && existsSync(dest) && sha256(await readFile(dest)) === old.sha256) {
      files.push(old);
      continue;
    }
    const url = troopdataUrl(f.path);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
    const body = Buffer.from(await res.arrayBuffer());
    const tmp = `${dest}.download`;
    await writeFile(tmp, body);
    await rename(tmp, dest);
    files.push({ path: f.path, file: f.file, url, size: body.byteLength, sha256: sha256(body), fetched_at: new Date().toISOString() });
    console.log(`  ${f.file}: ${body.byteLength} bytes`);
  }
  await writeFile(TROOPDATA_MANIFEST_PATH, JSON.stringify(parseTroopdataManifest({ repo: TROOPDATA_REPO, commit: TROOPDATA_COMMIT, files }), null, 2) + "\n");
  console.log(`  ${files.length} files at ${TROOPDATA_COMMIT.slice(0, 10)}`);
});
