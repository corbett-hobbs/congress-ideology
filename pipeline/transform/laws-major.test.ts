import { describe, expect, it } from "vitest";
import type { MayhewEntry, MayhewFile } from "../../lib/laws-entities";
import { buildMajor, entryTitle } from "./laws-major";

const entry = (over: Partial<MayhewEntry> & { entry_id: string; congress: number }): MayhewEntry => ({ list: "L", marks: "", capitals: false, quote: "Some Act. A thing.", law_ids: [], scope: "whole", ...over });
const file = (entries: MayhewEntry[], covered = 94): MayhewFile => ({ _comment: "", source: { author: "A", title: "T", url: "u", files_read: "2026-10-08", licence: "none" }, first_congress: 93, covered_through_congress: covered, entries });
const laws = new Map([["93-pub-1", { congress: 93 }], ["93-pub-2", { congress: 93 }], ["94-pub-1", { congress: 94 }]]);
const ok = [entry({ entry_id: "93-01", congress: 93, law_ids: ["93-pub-1"] }), entry({ entry_id: "94-01", congress: 94, law_ids: ["94-pub-1"] })];

describe("entryTitle", () => {
  it("is the entry's first sentence without its full stop", () => {
    expect(entryTitle("WAR POWERS ACT OF 1973. Limited president’s authority.")).toBe("WAR POWERS ACT OF 1973");
    expect(entryTitle("Opioids policy.")).toBe("Opioids policy");
  });
  it("shortens a very long opening", () => expect(entryTitle("x".repeat(200)).length).toBeLessThanOrEqual(108));
});

describe("buildMajor", () => {
  it("joins entries to laws and reports the share", () => {
    const r = buildMajor(file(ok), laws, 95);
    expect([...r.byLaw.keys()].sort()).toEqual(["93-pub-1", "94-pub-1"]);
    expect(r.report).toMatchObject({ entries: 2, entries_matched: 2, join_share: 1, major_laws: 2 });
    expect(r.file.laws["93-pub-1"]).toEqual([["93-01", 0, 0]]);
  });
  it("lets a treaty entry name no law, but only when it says so", () => {
    const treaty = entry({ entry_id: "93-02", congress: 93, scope: "none", quote: "Treaty ratified." });
    expect(buildMajor(file([...ok, treaty]), laws, 95).report.entries_without_a_public_law).toEqual(["93-02 Treaty ratified"]);
    expect(() => buildMajor(file([...ok, entry({ entry_id: "93-02", congress: 93 })]), laws, 95)).toThrow("names no law");
    expect(() => buildMajor(file([...ok, { ...treaty, law_ids: ["93-pub-2"] }]), laws, 95)).toThrow('scoped "none"');
  });
  it("fails on a law that does not exist or belongs to another Congress", () => {
    expect(() => buildMajor(file([entry({ entry_id: "93-01", congress: 93, law_ids: ["93-pub-9"] }), ok[1]!]), laws, 95)).toThrow("not in the laws data");
    expect(() => buildMajor(file([entry({ entry_id: "93-01", congress: 93, law_ids: ["94-pub-1"] }), ok[1]!]), laws, 95)).toThrow("a law of the 94th");
  });
  it("fails on a Congress with no entry, a repeated entry, or a list that runs past the data", () => {
    expect(() => buildMajor(file([ok[0]!]), laws, 95)).toThrow("94th Congress");
    expect(() => buildMajor(file([ok[0]!, ok[0]!, ok[1]!]), laws, 95)).toThrow("twice");
    expect(() => buildMajor(file(ok, 99), laws, 95)).toThrow("data ends");
  });
  it("counts a law named by several entries once, and notes it", () => {
    const r = buildMajor(file([...ok, entry({ entry_id: "93-02", congress: 93, law_ids: ["93-pub-1"], scope: "part" })]), laws, 95);
    expect(r.report.major_laws).toBe(2);
    expect(r.report.laws_named_by_more_than_one_entry).toEqual(["93-pub-1: 93-01, 93-02"]);
    expect(r.file.laws["93-pub-1"]).toEqual([["93-01", 0, 0], ["93-02", 1, 0]]);
  });
});
