import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { administration } from "./executive-orders-entities";
import { administrationOn, buildLawsPayload, groupCountsByCongress, signedMostByCongress, totalsByCongress } from "./laws-derive";
import { lawCommitteesFile, lawCountRow, lawRow, lawsMeta } from "./laws-entities";
import { HISTORICAL_ADMINISTRATIONS } from "./troops-presidents";

const read = (f: string): unknown => JSON.parse(readFileSync(`pipeline/output/${f}`, "utf8"));
const counts = z.array(lawCountRow).parse(read("laws_counts.json"));
const laws = z.array(lawRow).parse(read("laws.json"));
const meta = lawsMeta.parse(read("laws_meta.json"));
const admins = [...HISTORICAL_ADMINISTRATIONS, ...z.array(administration).parse(read("administrations.json"))];

describe("the committed Laws files", () => {
  const totals = totalsByCongress(counts);
  it("hit the anchors: 651 laws in the 93rd, 274 in the 118th", () => {
    expect(totals.get(93)).toBe(651);
    expect(totals.get(118)).toBe(274);
  });
  it("start at the 93rd and run without a gap to the latest Congress", () => {
    expect(meta.first_congress).toBe(93);
    for (let c = 93; c <= meta.last_congress; c++) expect(totals.get(c), `Congress ${c}`).toBeGreaterThan(0);
  });
  it("flag only the Congress in progress as partial", () => {
    expect(meta.partial_congresses).toEqual([meta.last_congress]);
    expect(meta.last_congress).toBeGreaterThanOrEqual(119);
  });
  it("count every law exactly once", () => {
    expect([...totals.values()].reduce((a, b) => a + b, 0)).toBe(laws.length);
    expect(laws.length).toBe(meta.law_count);
  });
  it("list the 32 current CRS areas, the retired one, and Not classified", () => {
    expect(meta.areas.filter((a) => a.status === "current")).toHaveLength(32);
    expect(meta.areas.filter((a) => a.status === "retired").map((a) => a.name)).toEqual(["Commemorations"]);
    expect(meta.areas.at(-1)).toMatchObject({ id: "not-classified", status: "none" });
  });
  it("give every area a topic group, and about ten groups plus Not classified", () => {
    const groups = new Set(meta.groups.map((g) => g.id));
    for (const a of meta.areas) expect(groups.has(a.group), a.id).toBe(true);
    expect(meta.groups.length).toBeGreaterThanOrEqual(10);
    expect(meta.groups.length).toBeLessThanOrEqual(12);
  });
  it("keep Commemorations out of the 2010s", () => {
    const comm = counts.filter((c) => c.area_id === "commemorations");
    expect(comm.length).toBeGreaterThan(0);
    expect(Math.max(...comm.map((c) => c.congress))).toBeLessThanOrEqual(112);
  });
  it("date every law inside its Congress or by 20 January after it", () => {
    for (const l of laws) {
      const start = 1789 + 2 * (l.congress - 1);
      expect(l.date >= `${start}-01-03` && l.date <= `${start + 2}-01-20`, l.law_id).toBe(true);
    }
  });
  it("number the laws of each finished Congress 1..N", () => {
    const by = new Map<number, number[]>();
    for (const l of laws) by.set(l.congress, [...(by.get(l.congress) ?? []), l.number]);
    for (const [c, nums] of by) if (!meta.partial_congresses.includes(c)) expect(nums.slice().sort((a, b) => a - b), `Congress ${c}`).toEqual(Array.from({ length: nums.length }, (_, i) => i + 1));
  });
  it("record the known veto overrides", () => {
    const ids = new Set(laws.filter((l) => l.veto_override).map((l) => l.law_id));
    for (const id of ["93-pub-148" /* War Powers Resolution */, "114-pub-222" /* Justice Against Sponsors of Terrorism Act */, "116-pub-283" /* FY2021 NDAA */]) expect(ids.has(id), id).toBe(true);
    expect(ids.has("118-pub-90")).toBe(false);
  });
});

describe("Not classified and committees", () => {
  it("leaves laws without a CRS area only in the 93rd-95th Congresses", () => {
    const nc = counts.filter((c) => c.area_id === "not-classified");
    expect(nc.length).toBeGreaterThan(0);
    expect(Math.max(...nc.map((c) => c.congress))).toBeLessThanOrEqual(95);
  });
  const committees = lawCommitteesFile.parse(read("laws_committees.json"));
  it("links a law to its committees and subcommittees", () => {
    const hr815 = committees.laws["118-pub-50"]!;
    expect(hr815.find(([id]) => id === "HSVR")?.[1]).toEqual(["HSVR03"]);
    expect(committees.committees.HSVR).toMatchObject({ chamber: "House", page: true });
    expect(committees.committees.HSVR03).toMatchObject({ parent: "HSVR", page: true });
  });
  it("names every id a law uses", () => {
    for (const entries of Object.values(committees.laws)) for (const [id, subs] of entries) for (const k of [id, ...subs]) expect(committees.committees[k], k).toBeDefined();
  });
  it("only ever flags a page for a committee id of the current Congress", () => {
    const current = new Set((read("committees.json") as { committee_id: string }[]).map((c) => c.committee_id));
    for (const [id, c] of Object.entries(committees.committees)) if (c.parent === null && c.page) expect(current.has(id), id).toBe(true);
  });
});

describe("administrationOn", () => {
  it("finds the president on the day, including inauguration day", () => {
    expect(administrationOn("2021-01-20", admins)?.president).toBe("Joe Biden");
    expect(administrationOn("2021-01-19", admins)?.president).toBe("Donald Trump");
    expect(administrationOn("1974-08-09", admins)?.president).toBe("Gerald Ford");
    expect(administrationOn("1974-08-08", admins)?.president).toBe("Richard Nixon");
  });
});

describe("signedMostByCongress", () => {
  const signed = signedMostByCongress(laws, admins);
  it("names the president who signed most", () => {
    expect(signed.get(111)?.president).toBe("Barack Obama");
    expect(signed.get(115)?.president).toBe("Donald Trump");
    expect(signed.get(117)?.president).toBe("Joe Biden");
    expect(signed.get(97)?.president).toBe("Ronald Reagan");
  });
  it("splits the 93rd between Nixon and Ford and keeps the laws summing", () => {
    const s = signed.get(93)!;
    expect(s.split.map((x) => x.president).sort()).toEqual(["Gerald Ford", "Richard Nixon"]);
    expect(s.split.reduce((a, b) => a + b.n, 0)).toBe(651);
    expect(s.n).toBe(Math.max(...s.split.map((x) => x.n)));
  });
  it("counts every law once, in every Congress", () => {
    const totals = totalsByCongress(counts);
    for (const [c, s] of signed) expect(s.split.reduce((a, b) => a + b.n, 0), `Congress ${c}`).toBe(totals.get(c));
  });
  it("agrees with a plain recount from the dates", () => {
    const by = new Map<number, Map<string, number>>();
    for (const l of laws) {
      const a = admins.find((x) => x.start <= l.date && (x.end === null || l.date <= x.end))!;
      const m = by.get(l.congress) ?? new Map();
      m.set(a.term_id, (m.get(a.term_id) ?? 0) + 1);
      by.set(l.congress, m);
    }
    for (const [c, m] of by) expect(signed.get(c)!.n, `Congress ${c}`).toBe(Math.max(...m.values()));
  });
  it("splits a Congress that straddles an inauguration", () => {
    expect(signed.get(101)!.split.length).toBeGreaterThanOrEqual(1);
    expect(signed.get(107)!.president).toBe("George W. Bush");
  });
  it("throws for a law no administration covers", () => {
    expect(() => signedMostByCongress([{ congress: 1, date: "1800-01-01", law_id: "x" }], admins)).toThrow("no administration");
  });
});

describe("groupCountsByCongress and buildLawsPayload", () => {
  it("group counts add back to the Congress totals", () => {
    const totals = totalsByCongress(counts);
    for (const [c, per] of groupCountsByCongress(counts, meta)) expect([...per.values()].reduce((a, b) => a + b, 0)).toBe(totals.get(c));
  });
  it("builds a dense payload that matches the counts", () => {
    const p = buildLawsPayload(counts, laws, meta, admins);
    expect(p.congresses[0]).toBe(93);
    expect(p.counts.map((row) => row.reduce((a, b) => a + b, 0))[0]).toBe(651);
    expect(p.signedMost).toHaveLength(p.congresses.length);
    expect(p.partial.at(-1)).toBe(true);
    expect(p.lawCount).toBe(laws.length);
  });
});
