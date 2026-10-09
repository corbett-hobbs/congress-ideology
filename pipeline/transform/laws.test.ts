import { describe, expect, it } from "vitest";
import type { LawPolicyAreas, RawCongressFile, RawLaw } from "../../lib/laws-entities";
import { commemorativeReport, buildCommittees, committeeIdOf, areaIdFor, areaIndex, buildCounts, buildLawRow, buildMeta, checkCounts, checkDates, checkNumbering, chooseSources, isVetoOverride, splitPending, overlapDifferences, signingDate, sponsorReport } from "./laws";

const law = (congress: number, number: number, over: Partial<RawLaw> = {}): RawLaw => ({
  law_id: `${congress}-pub-${number}`,
  congress,
  number,
  bill_type: "hr",
  bill_number: String(100 + number),
  origin_chamber: "House",
  title: "An act",
  introduced: "2013-02-01",
  sponsor: "A000001",
  sponsor_name: "Rep. A",
  cosponsors: [],
  policy_area: "Health",
  summary_html: null,
  summary_stage: null,
  became_law: ["2013-06-01"],
  latest_action_date: "2013-06-01",
  updated: "2024-01-01",
  actions: [],
  committees: [],
  ...over,
});
const file = (congress: number, laws: RawLaw[], over: Partial<RawCongressFile> = {}): RawCongressFile => ({ source: "congress-gov", congress, fetched: "2026-10-08", list_count: laws.length, max_number: Math.max(...laws.map((l) => l.number)), laws, ...over });
const areas: LawPolicyAreas = {
  groups: [{ id: "health-social-welfare", label: "Health" }, { id: "commemorations", label: "Commemorations" }],
  areas: [
    { id: "health", name: "Health", group: "health-social-welfare", status: "current" },
    { id: "commemorations", name: "Commemorations", group: "commemorations", status: "retired" },
  ],
  legacy_terms: ["Noise"],
};

describe("chooseSources", () => {
  it("prefers Bill Status and keeps the other as the overlap check", () => {
    const m = chooseSources([file(93, [law(93, 1)]), file(93, [law(93, 1)], { source: "govinfo-billstatus", list_count: null })]);
    expect(m.get(93)!.primary.source).toBe("govinfo-billstatus");
    expect(m.get(93)!.overlap!.source).toBe("congress-gov");
  });
  it("starts at the 93rd and leaves no Congress out", () => {
    expect(() => chooseSources([file(94, [law(94, 1)])])).toThrow("93rd");
    expect(() => chooseSources([file(93, [law(93, 1)]), file(95, [law(95, 1)])])).toThrow("94th");
  });
});

describe("checkNumbering", () => {
  it("accepts 1..N", () => expect(() => checkNumbering(file(113, [law(113, 1), law(113, 2)]), { "113": 2 })).not.toThrow());
  it("names the missing law numbers, which the list endpoint's own count would hide", () => {
    expect(() => checkNumbering(file(113, [law(113, 1), law(113, 3)]), {})).toThrow("113-2");
  });
  it("rejects a repeated law", () => {
    expect(() => checkNumbering(file(113, [law(113, 1), law(113, 1), law(113, 2)], { max_number: 2 }), {})).toThrow("twice");
  });
  it("must match the independent count", () => {
    expect(() => checkNumbering(file(113, [law(113, 1), law(113, 2)]), { "113": 3 })).toThrow("independent count");
  });
  it("accepts a partial Congress with no independent count", () => expect(() => checkNumbering(file(119, [law(119, 1)]), { "113": 296 })).not.toThrow());
});

describe("dates", () => {
  it("takes the earliest became-law date", () => expect(signingDate(law(113, 1, { became_law: ["2013-06-02", "2013-06-01"] }))).toBe("2013-06-01"));
  it("allows signing up to 20 January after the Congress ends", () => {
    expect(() => checkDates(file(112, [law(112, 1, { became_law: ["2013-01-14"] })]))).not.toThrow();
    expect(() => checkDates(file(112, [law(112, 1, { became_law: ["2013-01-21"] })]))).toThrow("outside");
    expect(() => checkDates(file(112, [law(112, 1, { became_law: ["2011-01-02"] })]))).toThrow("outside");
  });
  it("refuses a law with no became-law action", () => expect(() => signingDate(law(113, 1, { became_law: [] }))).toThrow("no \"became law\""));
});

describe("splitPending", () => {
  const f = file(119, [law(119, 1, { became_law: ["2025-02-01"] }), law(119, 2, { became_law: [] })]);
  it("holds back a numbered law with no enactment action in a Congress in progress", () => {
    const r = splitPending(f, true);
    expect(r.pending).toEqual(["119-pub-2"]);
    expect(r.file.laws.map((l) => l.number)).toEqual([1]);
  });
  it("leaves a finished Congress alone, so the missing date fails the build", () => {
    expect(splitPending(f, false).pending).toEqual([]);
    expect(() => checkDates(f)).toThrow("no \"became law\"");
  });
});

describe("isVetoOverride", () => {
  const a = (text: string) => ({ date: "1995-12-20", type: "Veto", text, src: null });
  it("needs a veto and an over-veto passage", () => {
    expect(isVetoOverride([a("Vetoed by President."), a("Passed Senate over veto by Yea-Nay Vote. 68-30.")])).toBe(true);
    expect(isVetoOverride([a("Vetoed by President.")])).toBe(false);
    expect(isVetoOverride([a("Line item veto by President")])).toBe(false);
  });
});

describe("policy areas", () => {
  const idx = areaIndex(areas);
  it("maps names, legacy terms and none", () => {
    expect(areaIdFor("Health", idx)).toBe("health");
    expect(areaIdFor("Noise", idx)).toBe("not-classified");
    expect(areaIdFor(null, idx)).toBe("not-classified");
  });
  it("stops on a name it does not know", () => expect(() => areaIdFor("Pest control", idx)).toThrow("Pest control"));
  it("rejects an area in an unknown group", () => expect(() => areaIndex({ ...areas, areas: [{ id: "x", name: "X", group: "nope", status: "current" }] })).toThrow("unknown group"));
});

describe("commemorative laws", () => {
  const idx = areaIndex(areas);
  const extra: Parameters<typeof buildLawRow>[2] = { house: [3, null, null, null], senate: [3, null, null, null], band: 0, override_votes: null, major: null };
  it("moves a law whose title names a building into Commemorations and keeps the CRS area", () => {
    const row = buildLawRow(law(113, 1, { title: 'To designate the facility of the United States Postal Service located at 1 Main Street in Troy, Ohio, as the "A. B. Post Office".' }), idx, extra);
    expect(row).toMatchObject({ area_id: "commemorations", crs_area_id: "health" });
  });
  it("leaves an ordinary law alone, with no crs_area_id", () => {
    const row = buildLawRow(law(113, 1), idx, extra);
    expect(row.area_id).toBe("health");
    expect("crs_area_id" in row).toBe(false);
  });
  it("counts a law CRS itself filed under Commemorations, with no crs_area_id", () => {
    const row = buildLawRow(law(113, 1, { title: "An act", policy_area: "Commemorations" }), idx, extra);
    expect(row.area_id).toBe("commemorations");
    expect("crs_area_id" in row).toBe(false);
  });
  it("reports the agreement with CRS and stops below the floor", () => {
    const filed = (n: number, title: string) => law(113, n, { title, policy_area: "Commemorations" });
    const ok = commemorativeReport([filed(1, "A joint resolution designating the week of May 1 as \"National Test Week\"."), filed(2, "An act")].slice(0, 1), idx);
    expect(ok.crs_labeled).toMatchObject({ laws: 1, also_caught_by_title_rules: 1, agreement: 1 });
    expect(() => commemorativeReport([filed(1, "An act"), filed(2, "An act")], idx)).toThrow("below the 90% floor");
  });
});

describe("counts and meta", () => {
  const idx = areaIndex(areas);
  const rows = [law(113, 1), law(113, 2, { policy_area: "Noise" }), law(114, 1, { became_law: ["2015-03-01"] })].map((l) => buildLawRow(l, idx, { house: [3, null, null, null], senate: [3, null, null, null], band: 0, override_votes: null, major: l.congress === 93 ? true : null }));
  it("counts per Congress and area and adds back to the list", () => {
    const c = buildCounts(rows);
    expect(c).toEqual([
      { congress: 113, area_id: "health", n: 1, bands: [1, 0, 0, 0, 0], major: 0 },
      { congress: 113, area_id: "not-classified", n: 1, bands: [1, 0, 0, 0, 0], major: 0 },
      { congress: 114, area_id: "health", n: 1, bands: [1, 0, 0, 0, 0], major: 0 },
    ]);
    expect(() => checkCounts(c, rows)).not.toThrow();
    expect(() => checkCounts([{ congress: 113, area_id: "health", n: 5, bands: [5, 0, 0, 0, 0], major: 0 }, c[2]!], rows)).toThrow("counts add to");
    expect(() => checkCounts([{ ...c[0]!, bands: [0, 0, 0, 0, 0] }, c[1]!, c[2]!], rows)).toThrow("band counts");
  });
  it("flags a Congress with no independent count as partial", () => {
    const chosen = chooseSources([file(93, [law(93, 1)]), file(94, [law(94, 1)])]);
    const meta = buildMeta({ rows, chosen, areas, independent: { "93": 1 }, voteviewLast: { House: "2026-09-16", Senate: "2026-09-30" }, majorThrough: 93 });
    expect(meta.partial_congresses).toEqual([94]);
    expect(meta.areas.at(-1)).toMatchObject({ id: "not-classified", status: "none" });
  });
});

describe("overlap", () => {
  const a = file(108, [law(108, 1)], { source: "govinfo-billstatus", list_count: null });
  it("passes identical files", () => expect(overlapDifferences(a, file(108, [law(108, 1)]))).toEqual([]));
  it("names each field that differs", () => {
    const d = overlapDifferences(a, file(108, [law(108, 1, { policy_area: "Noise", sponsor: "B000002" })]));
    expect(d.join("|")).toMatch(/policy area.*sponsor|sponsor.*policy area/);
  });
  it("names a law only one source has", () => expect(overlapDifferences(a, file(108, [law(108, 2)])).length).toBe(2));
});

describe("sponsorReport", () => {
  it("lists unknown sponsors and laws with none", () => {
    const r = sponsorReport([law(113, 1), law(113, 2, { sponsor: "Z000001" }), law(113, 3, { sponsor: null })], new Set(["A000001"]));
    expect(r.unresolved.map((u) => u.law_id)).toEqual(["113-pub-2"]);
    expect(r.none).toEqual(["113-pub-3"]);
  });
});

describe("committees", () => {
  const act = (name: string) => ({ name, date: "2013-02-01" });
  const l = law(113, 1, {
    committees: [
      { code: "hsif00", name: "Energy and Commerce Committee", chamber: "House", activities: [act("Referred To"), act("Reported By")], subcommittees: [{ code: "hsif14", name: "Health Subcommittee", activities: [act("Referred to")] }] },
      { code: "hssy00", name: "Science, Space, and Technology Committee", chamber: "House", activities: [act("Referred To")], subcommittees: [] },
      { code: "hlig12", name: "A subcommittee listed alone", chamber: "House", activities: [], subcommittees: [] },
    ],
  });
  it("turns system codes into committees.json and subcommittees.json ids", () => {
    expect(committeeIdOf("hsif00")).toBe("HSIF");
    expect(committeeIdOf("hsif14")).toBe("HSIF14");
  });
  it("lists each law's committees, subcommittees and lower-cased steps, and says which have a page", () => {
    const { file } = buildCommittees([l, law(113, 2)], { committees: new Set(["HSIF"]), subcommittees: new Set(["HSIF14"]) });
    expect(file.laws["113-pub-1"]).toEqual([
      ["HLIG", ["HLIG12"], []],
      ["HSIF", ["HSIF14"], ["referred to", "reported by"]],
      ["HSSY", [], ["referred to"]],
    ]);
    expect(file.laws["113-pub-2"]).toBeUndefined();
    expect(file.committees.HSIF).toMatchObject({ name: "Energy and Commerce Committee", chamber: "House", parent: null, page: true });
    expect(file.committees.HSIF14).toMatchObject({ parent: "HSIF", page: true });
    expect(file.committees.HSSY.page).toBe(false);
    expect(file.committees.HLIG.page).toBe(false);
  });
});
