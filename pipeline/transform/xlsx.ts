import { inflateRawSync } from "node:zlib";

/**
 * Minimal read-only `.xlsx` reader (first worksheet only), so the trade pipeline
 * needs no spreadsheet dependency. An `.xlsx` is a zip of XML; this reads the zip
 * central directory, inflates the two parts it needs, and returns each row as a
 * sparse `column letter -> value` map (strings stay strings, numeric cells stay
 * the file's own text so the caller decides how to parse them).
 */
export type XlsxRow = { row: number; cells: Record<string, string> };

function zipEntries(buf: Buffer): Map<string, Buffer> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file (no end-of-central-directory record)");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("corrupt zip central directory");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataStart, dataStart + compSize);
    if (method !== 0 && method !== 8) throw new Error(`zip entry ${name}: unsupported compression method ${method}`);
    out.set(name, method === 8 ? inflateRawSync(raw) : raw);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");

const stripTags = (s: string) => decode(s.replace(/<[^>]+>/g, ""));

export function readXlsx(buf: Buffer): XlsxRow[] {
  const parts = zipEntries(buf);
  const sheet = parts.get("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("xlsx has no xl/worksheets/sheet1.xml");
  const sst = parts.get("xl/sharedStrings.xml");
  const strings = sst
    ? [...sst.toString("utf8").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => stripTags(m[1]))
    : [];

  const rows: XlsxRow[] = [];
  const xml = sheet.toString("utf8");
  for (const rm of xml.matchAll(/<row\b[^>]*?\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: Record<string, string> = {};
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const body = cm[2];
      if (!body) continue;
      const col = /\br="([A-Z]+)\d+"/.exec(cm[1])?.[1];
      if (!col) continue;
      const v = /<v>([\s\S]*?)<\/v>/.exec(body);
      if (/\bt="s"/.test(cm[1])) {
        if (v) cells[col] = strings[Number(v[1])] ?? "";
      } else if (/\bt="inlineStr"/.test(cm[1])) {
        cells[col] = stripTags(body);
      } else if (v) {
        cells[col] = decode(v[1]);
      }
    }
    if (Object.keys(cells).length) rows.push({ row: Number(rm[1]), cells });
  }
  return rows;
}
