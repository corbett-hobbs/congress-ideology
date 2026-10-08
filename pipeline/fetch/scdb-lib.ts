import { inflateRawSync } from "node:zlib";

/**
 * Pure helpers for the SCDB fetch (`scdb.ts`): release naming, candidate "next release" URLs and a
 * minimal single-file zip reader (the host serves one CSV per zip; no dependency needed).
 */
export const SCDB_BASE = "http://scdb.wustl.edu/_brickFiles";

export const releaseZipName = (version: string) => `SCDB_${version}_caseCentered_Citation.csv.zip`;
export const releaseCsvName = (version: string) => `SCDB_${version}_caseCentered_Citation.csv`;
export const releaseUrl = (version: string) => `${SCDB_BASE}/${version}/${releaseZipName(version)}`;

export const justiceZipName = (version: string) => `SCDB_${version}_justiceCentered_Citation.csv.zip`;
export const justiceCsvName = (version: string) => `SCDB_${version}_justiceCentered_Citation.csv`;
export const justiceUrl = (version: string) => `${SCDB_BASE}/${version}/${justiceZipName(version)}`;

export const isVersion = (v: string) => /^\d{4}_\d{2}$/.test(v);

/** "2026_01" -> "Version 2026 Release 01". */
export function versionLabel(version: string): string {
  const [year, rel] = version.split("_");
  return `Version ${year} Release ${rel}`;
}

/** The releases that could follow `version`: the next release of the same year, then release 01 of the next. */
export function nextVersionCandidates(version: string): string[] {
  const [year, rel] = version.split("_").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  return [`${year}_${pad(rel + 1)}`, `${year + 1}_01`];
}

/** Extract the first file of a zip archive (stored or deflated), using the central directory for sizes. */
export function unzipFirstFile(zip: Buffer): { name: string; data: Buffer } {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file (no end-of-central-directory record)");
  const cd = zip.readUInt32LE(eocd + 16);
  if (zip.readUInt32LE(cd) !== 0x02014b50) throw new Error("zip central directory is damaged");
  const method = zip.readUInt16LE(cd + 10);
  const compressed = zip.readUInt32LE(cd + 20);
  const nameLen = zip.readUInt16LE(cd + 28);
  const local = zip.readUInt32LE(cd + 42);
  const name = zip.subarray(cd + 46, cd + 46 + nameLen).toString("utf8");
  if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error("zip local header is damaged");
  const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  const body = zip.subarray(start, start + compressed);
  if (method === 0) return { name, data: Buffer.from(body) };
  if (method === 8) return { name, data: inflateRawSync(body) };
  throw new Error(`unsupported zip compression method ${method}`);
}
