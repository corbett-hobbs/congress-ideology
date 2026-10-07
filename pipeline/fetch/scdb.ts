import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { parse as parseCsv } from "csv-parse/sync";
import { scdbManifest, type ScdbManifest } from "../../lib/decisions-entities";
import { RAW_DIR } from "./lib";
import { SCDB_BASE, isVersion, nextVersionCandidates, releaseCsvName, releaseUrl, unzipFirstFile } from "./scdb-lib";

/**
 * Supreme Court Database (Washington University in St. Louis), case-centered by citation.
 *
 *   pnpm fetch:scdb                    re-fetch the release already recorded in manifest.json
 *   pnpm fetch:scdb -- 2026_01         fetch (and pin) a specific release
 *   pnpm fetch:scdb -- --next          is a newer release published? If so, fetch and pin it
 *
 * Manual refresh, not part of `fetch:all` (the host is slow and the URL is versioned). The CSV is
 * latin-1; it is stored byte-for-byte and decoded by the transform. Exit codes: 0 ok / nothing new,
 * 2 host unreachable or not serving a zip (the freshness workflow warns, never fails), 1 other.
 */
const DIR = `${RAW_DIR}/scdb`;
const MANIFEST = `${DIR}/manifest.json`;
const USER_AGENT = "InsideGov-pipeline/0.1 (+https://github.com/corbett-hobbs/congress-ideology; annual data check)";

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

class Unreachable extends Error {}

async function head(url: string): Promise<number> {
  try {
    const res = await fetch(url, { method: "HEAD", headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(30_000) });
    return res.status;
  } catch (e) {
    throw new Unreachable(`HEAD ${url}: ${e instanceof Error ? e.message : e}`);
  }
}

async function getZip(url: string): Promise<Buffer> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(180_000) });
  } catch (e) {
    throw new Unreachable(`GET ${url}: ${e instanceof Error ? e.message : e}`);
  }
  if (!res.ok) throw new Unreachable(`GET ${url} -> ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

async function currentManifest(): Promise<ScdbManifest | null> {
  if (!existsSync(MANIFEST)) return null;
  return scdbManifest.parse(JSON.parse(await readFile(MANIFEST, "utf8")));
}

async function fetchRelease(version: string) {
  const url = releaseUrl(version);
  const zip = await getZip(url);
  let csv: Buffer;
  try {
    csv = unzipFirstFile(zip).data;
  } catch (e) {
    throw new Unreachable(`${url} did not return a zip: ${e instanceof Error ? e.message : e}`);
  }
  const text = csv.toString("latin1");
  const header = text.split(/\r?\n/, 1)[0] ?? "";
  if (!header.includes("caseId") || !header.includes("minVotes")) throw new Unreachable(`${url} is not the SCDB case-centered CSV (header: ${header.slice(0, 80)})`);
  const rows = parseCsv(text, { columns: true, skip_empty_lines: true, bom: true }).length;

  await mkdir(DIR, { recursive: true });
  for (const f of await readdir(DIR)) if (f.endsWith(".csv") && f !== releaseCsvName(version)) await rm(`${DIR}/${f}`);
  await writeFile(`${DIR}/${releaseCsvName(version)}`, csv);
  const manifest: ScdbManifest = {
    version,
    url,
    zip_sha256: sha256(zip),
    csv_file: releaseCsvName(version),
    csv_sha256: sha256(csv),
    rows,
    encoding: "latin1",
    fetched: new Date().toISOString().slice(0, 10),
  };
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`scdb ${version}: ${rows} rows, csv sha256 ${manifest.csv_sha256}`);
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const cur = await currentManifest();

  if (args.includes("--next")) {
    if (!cur) throw new Error("no manifest.json; run `pnpm fetch:scdb -- <version>` once first");
    for (const v of nextVersionCandidates(cur.version)) {
      if ((await head(releaseUrl(v))) === 200) {
        console.log(`newer SCDB release found: ${v} (current ${cur.version})`);
        await fetchRelease(v);
        return;
      }
    }
    console.log(`no SCDB release newer than ${cur.version} under ${SCDB_BASE}`);
    return;
  }

  const version = args.find(isVersion) ?? cur?.version;
  if (!version) throw new Error("no version given and no manifest.json; run `pnpm fetch:scdb -- 2026_01`");
  await fetchRelease(version);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(e instanceof Unreachable ? 2 : 1);
});
