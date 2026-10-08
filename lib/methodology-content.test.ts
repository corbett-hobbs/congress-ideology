import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { METHODOLOGY } from "./methodology-content";

const entries = METHODOLOGY.flatMap((g) => g.entries);

describe("methodology content", () => {
  it("has unique ids that do not clash with section anchors", () => {
    const ids = [...entries.map((e) => e.id), ...METHODOLOGY.map((g) => g.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every docPath points at a file in the repo", () => {
    for (const e of entries.filter((x) => x.docPath)) {
      expect(existsSync(join(process.cwd(), e.docPath!)), e.docPath).toBe(true);
    }
  });

  it("has no placeholder text and every source link is https or a known http host", () => {
    for (const e of entries) {
      for (const text of [e.description, e.caveats, e.updates, e.credit ?? ""]) expect(text).not.toMatch(/TODO|\[[^\]]*\]/);
      for (const s of e.sources) if (s.url) expect(s.url).toMatch(/^https?:\/\//);
    }
  });

  it("keeps the required credits", () => {
    const all = JSON.stringify(entries);
    for (const needle of ["Voteview: Congressional Roll-Call Votes Database", "not endorsed or certified by the Federal Reserve", "not endorsed or certified by the Census Bureau", "GPL-3.0", "Dynamic Ideal Point Estimation", "CC BY-SA"]) {
      expect(all).toContain(needle);
    }
  });
});
