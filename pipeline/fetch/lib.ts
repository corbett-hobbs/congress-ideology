import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Repo-root-relative directory that fetch scripts write into. */
export const RAW_DIR = "pipeline/raw";

interface DownloadResult {
  path: string;
  bytes: number;
  sha256: string;
}

/**
 * Download `url` to `destPath` (repo-relative), writing atomically: the body is
 * staged to a sibling `*.download` file and renamed into place only once the
 * transfer completes, so an interrupted run never leaves a half-written
 * snapshot that a later stage would treat as real.
 */
export async function download(
  url: string,
  destPath: string,
): Promise<DownloadResult> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  }

  const body = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(destPath), { recursive: true });
  const tmp = `${destPath}.download`;
  await writeFile(tmp, body);
  await rename(tmp, destPath);

  const sha256 = createHash("sha256").update(body).digest("hex");
  return { path: destPath, bytes: body.byteLength, sha256 };
}

/** One line per file, so `git diff` on a fetch run is self-describing. */
export function logResult({ path, bytes, sha256 }: DownloadResult): void {
  const kb = (bytes / 1024).toFixed(1);
  console.log(`  ${path}  ${kb} KiB  sha256:${sha256.slice(0, 12)}`);
}

/** Run a fetch script's `main`, printing a header and failing loudly. */
export async function run(label: string, main: () => Promise<void>): Promise<void> {
  console.log(`fetch:${label}`);
  try {
    await main();
    console.log(`fetch:${label} ok`);
  } catch (err) {
    console.error(`fetch:${label} failed`);
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}
