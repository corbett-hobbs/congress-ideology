import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { run } from "./lib";
import {
  DMDC_MANIFEST_PATH,
  DMDC_PAGE_URL,
  DMDC_RAW_DIR,
  dmdcDownloadUrl,
  dmdcRawPath,
  parseManifest,
  selectLocationFiles,
  type ManifestFile,
} from "./dmdc-location-lib";

/**
 * DMDC "Military and Civilian Personnel by Service/Agency by State/Country" location tables (xlsx, Sep 2008
 * onward), snapshotted unchanged into `pipeline/raw/dmdc-location/<YYYY-MM>.xlsx` with a `manifest.json`.
 *
 * Keyless and public: the report page is a JavaScript shell over one JSON endpoint (`/dwp/api/page?pageId=27`);
 * files download from `/dwp/api/downloadZ?fileId=…&groupName=milRegionCountry`. No cookies or tokens are sent.
 * `fileId`s change every quarter, so files are always discovered from the page JSON.
 *
 * A file already on disk with the manifest's sha256 is not rewritten. `--check` fetches only the page JSON and
 * reports whether a period is new (for the weekly freshness workflow). See docs/TROOPS_METHODOLOGY.md.
 */
const HEADERS = { "User-Agent": "congress-ideology-pipeline (public-data research; github.com/corbetthobbs)" };

async function get(url: string): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (attempt >= 4 || (res.status < 500 && res.status !== 429)) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
}

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

await run("dmdc-location", async () => {
  await mkdir(DMDC_RAW_DIR, { recursive: true });
  const files = selectLocationFiles(JSON.parse((await get(DMDC_PAGE_URL)).toString("utf8")));
  if (!files.length) throw new Error("DMDC page lists no milRegionCountry xlsx files; the page JSON changed shape");
  const prev = existsSync(DMDC_MANIFEST_PATH) ? parseManifest(JSON.parse(await readFile(DMDC_MANIFEST_PATH, "utf8"))).files : [];
  const have = new Map(prev.map((f) => [f.period, f]));

  if (process.argv.includes("--check")) {
    const fresh = files.filter((f) => !have.has(f.period)).map((f) => f.period);
    const latest = files[files.length - 1].period;
    console.log(`  page lists ${files.length} files through ${latest}; ${fresh.length ? `new: ${fresh.join(", ")}` : "nothing new"}`);
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `stale=${fresh.length > 0}\nnew_periods=${fresh.join(",")}\nlatest=${latest}\n`);
    return;
  }

  const out: ManifestFile[] = [];
  for (const f of files) {
    const dest = dmdcRawPath(f.period);
    const old = have.get(f.period);
    let entry: ManifestFile;
    if (old && existsSync(dest) && sha256(await readFile(dest)) === old.sha256 && old.fileId === f.fileId && old.uploadDate === f.uploadDate) {
      entry = old;
    } else {
      const body = await get(dmdcDownloadUrl(f.fileId));
      if (body.readUInt32LE(0) !== 0x04034b50) throw new Error(`${f.fileName}: download is not an xlsx (zip) file`);
      const hash = sha256(body);
      if (old && old.sha256 === hash && existsSync(dest)) {
        entry = { ...old, fileId: f.fileId, uploadDate: f.uploadDate };
      } else {
        const tmp = `${dest}.download`;
        await writeFile(tmp, body);
        await rename(tmp, dest);
        entry = { period: f.period, fileName: f.fileName, fileId: f.fileId, groupName: "milRegionCountry", uploadDate: f.uploadDate, size: body.byteLength, sha256: hash, fetched_at: new Date().toISOString() };
        console.log(`  ${f.period}: ${body.byteLength} bytes`);
      }
    }
    out.push(entry);
  }
  await writeFile(DMDC_MANIFEST_PATH, JSON.stringify(parseManifest({ files: out }), null, 2) + "\n");
  console.log(`  ${out.length} periods, ${out[0].period}..${out[out.length - 1].period}`);
});
