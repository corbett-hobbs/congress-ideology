import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { isVersion, nextVersionCandidates, releaseUrl, unzipFirstFile, versionLabel } from "./scdb-lib";

describe("scdb-lib", () => {
  it("builds release names and urls", () => {
    expect(releaseUrl("2026_01")).toBe("http://scdb.wustl.edu/_brickFiles/2026_01/SCDB_2026_01_caseCentered_Citation.csv.zip");
    expect(versionLabel("2026_01")).toBe("Version 2026 Release 01");
    expect(isVersion("2026_01")).toBe(true);
    expect(isVersion("2026")).toBe(false);
  });
  it("lists the releases that could follow", () => {
    expect(nextVersionCandidates("2026_01")).toEqual(["2026_02", "2027_01"]);
    expect(nextVersionCandidates("2025_09")).toEqual(["2025_10", "2026_01"]);
  });
  it("reads stored and deflated single-file zips", () => {
    const text = Buffer.from("col1,col2\nhello,w\u00f6rld\n", "latin1");
    for (const method of [0, 8] as const) {
      const body = method === 8 ? deflateRawSync(text) : text;
      const name = Buffer.from("a.csv");
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(method, 8);
      local.writeUInt32LE(body.length, 18);
      local.writeUInt32LE(text.length, 22);
      local.writeUInt16LE(name.length, 26);
      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(method, 10);
      central.writeUInt32LE(body.length, 20);
      central.writeUInt32LE(text.length, 24);
      central.writeUInt16LE(name.length, 28);
      central.writeUInt32LE(0, 42);
      const cdOffset = local.length + name.length + body.length;
      const eocd = Buffer.alloc(22);
      eocd.writeUInt32LE(0x06054b50, 0);
      eocd.writeUInt16LE(1, 8);
      eocd.writeUInt16LE(1, 10);
      eocd.writeUInt32LE(central.length + name.length, 12);
      eocd.writeUInt32LE(cdOffset, 16);
      const zip = Buffer.concat([local, name, body, central, name, eocd]);
      const out = unzipFirstFile(zip);
      expect(out.name).toBe("a.csv");
      expect(out.data.equals(text)).toBe(true);
    }
  });
  it("rejects a non-zip", () => {
    expect(() => unzipFirstFile(Buffer.from("<html>503</html>".repeat(5)))).toThrow(/not a zip/);
  });
});
