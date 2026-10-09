import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { congressControlFile, controlSpans } from "./congress-control";
import { dayOfIso } from "./indicator-time";

const file = congressControlFile.parse(JSON.parse(readFileSync(join(process.cwd(), "pipeline/reference/congress-control.json"), "utf8")));

describe("congress control reference", () => {
  it("is contiguous per chamber and spans the whole axis", () => {
    for (const ch of ["house", "senate"] as const) {
      const spans = controlSpans(file.rows, ch, 13057);
      expect(spans[0].s).toBe(0);
      expect(spans[spans.length - 1].e).toBe(13057);
      for (let i = 1; i < spans.length; i++) expect(spans[i].s).toBe(spans[i - 1].e);
    }
  });
  it("runs back to the 93rd Congress, contiguous, with the changes of majority in 1981 and 1987", () => {
    for (const ch of ["house", "senate"] as const) {
      const mine = file.rows.filter((r) => r.chamber === ch).sort((a, b) => a.from.localeCompare(b.from));
      expect(mine[0]!.from).toBe("1973-01-03");
      for (let i = 1; i < mine.length; i++) expect(mine[i]!.from, `${ch} row ${i}`).toBe(new Date(Date.parse(mine[i - 1]!.to!) + 864e5).toISOString().slice(0, 10));
      expect(mine.at(-1)!.to).toBeNull();
    }
    const party = (ch: "house" | "senate", iso: string) => file.rows.find((r) => r.chamber === ch && r.from <= iso && (r.to === null || r.to >= iso))!.party;
    expect(party("senate", "1980-12-31")).toBe("D");
    expect(party("senate", "1981-01-03")).toBe("R");
    expect(party("senate", "1986-12-31")).toBe("R");
    expect(party("senate", "1987-01-03")).toBe("D");
    for (const iso of ["1973-01-03", "1981-06-01", "1987-06-01", "1994-12-31"]) expect(party("house", iso)).toBe("D");
    expect(party("house", "1995-01-03")).toBe("R");
  });
  it("draws a table that starts in 1973 the same as one that starts in 1991 on the 1991-based axis", () => {
    for (const ch of ["house", "senate"] as const) {
      const spans = controlSpans(file.rows, ch, 13057);
      expect(spans[0]).toMatchObject({ s: 0, party: "D" });
      expect(spans[1]!.s).toBe(spans[0]!.e);
      expect(spans[0]!.e).toBeGreaterThan(dayOfIso("1993-01-01"));
    }
  });
  it("shows the Senate's mid-Congress changes of 2001 and 2021 on their dates", () => {
    const sen = controlSpans(file.rows, "senate", 13057);
    const at = (iso: string) => sen.find((s) => dayOfIso(iso) >= s.s && dayOfIso(iso) < s.e)!.party;
    expect(at("2001-01-19")).toBe("D");
    expect(at("2001-01-20")).toBe("R");
    expect(at("2001-06-06")).toBe("D");
    expect(at("2021-01-19")).toBe("R");
    expect(at("2021-01-20")).toBe("D");
  });
  it("agrees loosely with terms.json roster counts (a sanity check, not proof: rosters include replacements)", () => {
    const terms = JSON.parse(readFileSync(join(process.cwd(), "pipeline/output/terms.json"), "utf8")) as {
      congress_number: number; chamber: string; caucus: string;
    }[];
    const failures: string[] = [];
    for (const c of [93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 108, 109, 110, 111, 112, 113, 114, 115, 116, 118, 119]) {
      for (const ch of ["house", "senate"] as const) {
        const start = `${1789 + 2 * (c - 1)}-01-03`;
        const row = file.rows.find((r) => r.chamber === ch && r.from <= start && (r.to === null || r.to >= start))!;
        const n = (p: string) => terms.filter((t) => t.congress_number === c && t.chamber === ch && t.caucus.startsWith(p)).length;
        const dem = n("Democrat");
        const rep = n("Republican");
        if ((row.party === "D" ? dem : rep) < (row.party === "D" ? rep : dem) - 3) failures.push(`${c} ${ch}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
