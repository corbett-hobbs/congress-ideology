import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { RAW_DIR } from "./lib";
import {
  COURT_HEADER,
  JUSTICES_HEADER,
  MANUAL_INSTRUCTIONS,
  detectChallenge,
  latestReleaseYear,
  looksLikeCsv,
  releaseLabelFromReadme,
} from "./mq-check";

/**
 * Martin-Quinn Supreme Court ideal points (Washington University in St. Louis).
 *
 *   pnpm fetch:mq                      fetch the latest release folder we already have
 *   pnpm fetch:mq -- 2025              fetch a specific release year
 *   pnpm fetch:mq -- --probe           is a newer release published? (latest+1, current year)
 *   pnpm fetch:mq -- --adopt [year] [--label "2024 Release 01"]
 *                                      record SOURCE.json for hand-placed files
 *
 * The file host sits behind a Cloudflare bot challenge that serves an HTTP 403
 * "Just a moment..." page to scripts. We do NOT try to solve, evade or work
 * around it: one honest request per file, no retries, and on a challenge we
 * stop with instructions for placing the files by hand. A hand-placed snapshot
 * (`retrieved_via: "manual"`) is a first-class input to the transform.
 *
 * Exit codes: 0 ok / nothing new, 2 blocked or HTTP error, 3 not a CSV, 1 other.
 */
const BASE = "https://mqscores.wustl.edu/media";
const MQ_DIR = `${RAW_DIR}/mq`;
const USER_AGENT =
  "InsideGov-pipeline/0.1 (+https://github.com/corbett-hobbs/congress-ideology; annual data check)";

const FILES = [
  { name: "justices.csv", header: JUSTICES_HEADER, required: true },
  { name: "court.csv", header: COURT_HEADER, required: true },
  { name: "README.txt", header: null, required: false },
] as const;

class Blocked extends Error {}
class NotCsv extends Error {}

function sha256(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

async function localYears(): Promise<string[]> {
  return existsSync(MQ_DIR) ? readdir(MQ_DIR) : [];
}

interface Got {
  status: number;
  body: string;
}

/** One polite GET. No retries. */
async function get(url: string): Promise<Got> {
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  const body = await res.text();
  if (detectChallenge(res.status, res.headers.get("content-type") ?? "", body)) {
    throw new Blocked(
      `${url} -> HTTP ${res.status}: the host served a bot-challenge page. Not attempting to bypass it.\n${MANUAL_INSTRUCTIONS(
        Number(/media\/(\d{4})\//.exec(url)?.[1] ?? "0"),
      )}`,
    );
  }
  return { status: res.status, body };
}

async function fetchRelease(year: number): Promise<void> {
  const got = new Map<string, string>();
  for (const f of FILES) {
    const url = `${BASE}/${year}/${f.name}`;
    let r: Got;
    try {
      r = await get(url);
    } catch (err) {
      if (!f.required) continue; // optional README: a failure on it alone is not fatal
      throw err;
    }
    if (r.status !== 200) {
      if (!f.required) continue;
      throw new Error(`GET ${url} -> HTTP ${r.status}`);
    }
    if (f.header && !looksLikeCsv(r.body, f.header)) {
      throw new NotCsv(`${url} returned 200 but is not the expected CSV (missing columns: ${f.header.join(", ")}).`);
    }
    got.set(f.name, r.body);
  }

  const dir = `${MQ_DIR}/${year}`;
  await mkdir(dir, { recursive: true });
  const hashes: Record<string, string> = {};
  const urls: Record<string, string> = {};
  for (const [name, body] of got) {
    const tmp = `${dir}/${name}.download`;
    await writeFile(tmp, body);
    await rename(tmp, `${dir}/${name}`);
    hashes[name] = sha256(body);
    urls[name] = `${BASE}/${year}/${name}`;
    console.log(`  ${dir}/${name}  ${(Buffer.byteLength(body) / 1024).toFixed(1)} KiB  sha256:${hashes[name].slice(0, 12)}`);
  }
  await writeSource(year, "fetch", hashes, urls, releaseLabelFromReadme(got.get("README.txt") ?? ""));
}

async function writeSource(
  year: number,
  via: "fetch" | "manual",
  hashes: Record<string, string>,
  urls: Record<string, string>,
  releaseLabel: string | null,
): Promise<void> {
  const source = {
    release_year: year,
    release_label: releaseLabel,
    retrieved_via: via,
    retrieved_on: new Date().toISOString().slice(0, 10),
    page: "https://mqscores.wustl.edu/measures.php",
    urls,
    sha256: hashes,
  };
  await writeFile(`${MQ_DIR}/${year}/SOURCE.json`, JSON.stringify(source, null, 2) + "\n");
  console.log(`  ${MQ_DIR}/${year}/SOURCE.json  (${via})`);
}

/** Record SOURCE.json for hand-placed files, hashing them locally. */
async function adopt(year: number, label: string | null): Promise<void> {
  const dir = `${MQ_DIR}/${year}`;
  const hashes: Record<string, string> = {};
  for (const f of FILES) {
    const path = `${dir}/${f.name}`;
    if (!existsSync(path)) {
      if (f.required) throw new Error(`${path} not found. ${MANUAL_INSTRUCTIONS(year)}`);
      continue;
    }
    const buf = await readFile(path);
    if (f.header && !looksLikeCsv(buf.toString("utf8"), f.header)) {
      throw new NotCsv(`${path} is not the expected CSV (missing columns: ${f.header.join(", ")}).`);
    }
    hashes[f.name] = sha256(buf);
  }
  const readme = existsSync(`${dir}/README.txt`) ? await readFile(`${dir}/README.txt`, "utf8") : "";
  await writeSource(year, "manual", hashes, {}, label ?? releaseLabelFromReadme(readme));
}

/** Is a release newer than what we hold published? Blocked == unknown, not "no". */
async function probe(): Promise<void> {
  const latest = latestReleaseYear(await localYears());
  const candidates = [...new Set([(latest ?? 2023) + 1, new Date().getFullYear()])].filter((y) => y > (latest ?? 0));
  for (const year of candidates) {
    const url = `${BASE}/${year}/justices.csv`;
    const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
    const body = await res.text();
    if (detectChallenge(res.status, res.headers.get("content-type") ?? "", body)) {
      throw new Blocked(`probe ${url} -> HTTP ${res.status}: bot challenge; cannot tell whether a newer release exists.`);
    }
    if (res.status === 200 && looksLikeCsv(body, JUSTICES_HEADER)) {
      console.log(`newer release found: ${year}`);
      await fetchRelease(year);
      return;
    }
    console.log(`  ${year}: HTTP ${res.status} (no release)`);
  }
  console.log("no newer release published");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const yearArg = args.find((a) => /^\d{4}$/.test(a));
  const li = args.indexOf("--label");
  const label = li >= 0 ? (args[li + 1] ?? null) : null;

  if (args.includes("--probe")) return probe();
  const year = yearArg ? Number(yearArg) : latestReleaseYear(await localYears());
  if (year == null) throw new Error("No release folder under pipeline/raw/mq/ and no year given: `pnpm fetch:mq -- 2024`.");
  if (args.includes("--adopt")) return adopt(year, label);
  return fetchRelease(year);
}

console.log("fetch:mq");
try {
  await main();
  console.log("fetch:mq ok");
} catch (err) {
  console.error("fetch:mq failed");
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = err instanceof Blocked ? 2 : err instanceof NotCsv ? 3 : 1;
}
