import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { committeeBillsMeta, committeeBillsShard, type RawBill } from "../../lib/committee-bills-entities";
import { billFacts, buildShards, checkLaws, committeeEvents, committeeIdOf, dataThrough, orderedVote, parseSponsorName, subcommitteeIdOf } from "./committee-bills";

const COMMITTEES = [
  { committee_id: "HSII", chamber: "house" as const },
  { committee_id: "HSJU", chamber: "house" as const },
  { committee_id: "SSJU", chamber: "senate" as const },
];
const SUBS = [{ subcommittee_id: "HSII13", parent_committee_id: "HSII", name: "Federal Lands" }];

const bill = (over: Partial<RawBill> = {}): RawBill => ({
  type: "hr",
  number: "26",
  title: "Protecting American Energy Production Act",
  introduced: "2025-01-03",
  origin_chamber: "House",
  sponsor: { id: "P000048", name: "Rep. Pfluger, August [R-TX-11]" },
  cosponsors: [2, 1, 0],
  policy_area: "Energy",
  committees: [
    {
      code: "hsii00",
      name: "Natural Resources Committee",
      chamber: "House",
      activities: [
        { name: "Referred To", date: "2025-01-03" },
        { name: "Markup By", date: "2025-04-01" },
        { name: "Reported By", date: "2025-04-08" },
      ],
      subcommittees: [{ code: "hsii13", name: "Federal Lands Subcommittee", activities: [{ name: "Hearings By (subcommittee)", date: "2025-03-05" }] }],
    },
    { code: "hsju00", name: "Judiciary Committee", chamber: "House", activities: [{ name: "Referred To", date: "2025-01-03" }], subcommittees: [] },
  ],
  actions: [
    { date: "2025-04-01", type: "Committee", text: "Ordered to be Reported (Amended) by the Yeas and Nays: 24 - 11.", committees: ["hsii00"] },
    { date: "2025-04-10", type: "Calendars", text: "", committees: [] },
    { date: "2025-05-01", type: "Floor", text: "Passed/agreed to in House", committees: [] },
  ],
  laws: [],
  reports: ["H. Rept. 119-12"],
  cbo_estimates: 1,
  latest_action: { date: "2025-05-01", text: "Received in the Senate." },
  updated: "2026-01-01",
  ...over,
});

describe("ids", () => {
  it("joins the source's codes to committees.json and subcommittees.json", () => {
    expect(committeeIdOf("hsii00")).toBe("HSII");
    expect(subcommitteeIdOf("hsii13")).toBe("HSII13");
  });
});

describe("orderedVote", () => {
  it("reads a recorded tally, a voice vote and unanimous consent", () => {
    expect(orderedVote("Ordered to be Reported (Amended) by the Yeas and Nays: 14 - 9.")).toEqual([14, 9]);
    expect(orderedVote("Ordered to be Reported in the Nature of a Substitute by the Yeas and Nays: 23 - 15.")).toEqual([23, 15]);
    expect(orderedVote("Ordered to be Reported (Amended) by Voice Vote.")).toBe("voice");
    expect(orderedVote("Ordered to be Reported by Unanimous Consent.")).toBe("unanimous");
  });
  it("says nothing for a Senate committee that records no method, or an unrelated action", () => {
    expect(orderedVote("Committee on Indian Affairs. Ordered to be reported without amendment favorably.")).toBeNull();
    expect(orderedVote("Committee Consideration and Mark-up Session Held")).toBeNull();
  });
});

describe("parseSponsorName", () => {
  it("splits name, party and place", () => {
    expect(parseSponsorName("Rep. Biggs, Andy [R-AZ-5]")).toEqual({ name: "Biggs, Andy", party: "R", place: "AZ-5" });
    expect(parseSponsorName("Sen. Crapo, Mike [R-ID]")).toEqual({ name: "Crapo, Mike", party: "R", place: "ID" });
    expect(parseSponsorName("Rep. Begich, Nicholas [R-AK-At Large]")).toEqual({ name: "Begich, Nicholas", party: "R", place: "AK" });
    expect(parseSponsorName("Rescom. Hernández, Pablo [D-PR-At Large]")?.place).toBe("PR");
  });
  it("returns null for wording it does not know", () => {
    expect(parseSponsorName("The Speaker")).toBeNull();
  });
});

describe("billFacts", () => {
  it("reads passage, the calendar, a veto and enactment", () => {
    expect(billFacts(bill())).toMatchObject({ house: "2025-05-01", senate: null, vetoed: false, calendar: "2025-04-10", signed: undefined });
    const f = billFacts(bill({ actions: [{ date: "2025-05-02", type: "Floor", text: "Passed/agreed to in Senate", committees: [] }, { date: "2025-06-01", type: "Veto", text: "", committees: [] }] }));
    expect(f).toMatchObject({ house: null, senate: "2025-05-02", vetoed: true });
  });
  it("counts a bill as enacted only once a 'became law' action exists", () => {
    expect(billFacts(bill({ laws: ["119-120"] })).signed).toBeUndefined();
    expect(billFacts(bill({ laws: ["119-5"], actions: [{ date: "2025-06-01", type: "BecameLaw", text: "", committees: [] }] })).signed).toBe("2025-06-01");
    expect(billFacts(bill({ laws: ["119-5"], actions: [{ date: "2025-06-02", type: "President", text: "Became Public Law", committees: [] }] })).signed).toBe("2025-06-02");
  });
});

describe("committeeEvents", () => {
  const b = bill();
  it("takes the earliest dated step of each kind, from the committee or its subcommittees", () => {
    expect(committeeEvents(b, b.committees[0]!, "2025-04-10")).toMatchObject({ r: "2025-01-03", h: "2025-03-05", m: "2025-04-01", p: "2025-04-08", k: "2025-04-10", q: [24, 11], subs: ["hsii13"] });
  });
  it("gives a committee that only received the bill nothing but its referral", () => {
    const e = committeeEvents(b, b.committees[1]!, "2025-04-10");
    expect(e).toMatchObject({ r: "2025-01-03", subs: [] });
    expect(e.h ?? e.m ?? e.p ?? e.d ?? e.k ?? e.q).toBeUndefined();
  });
  it("counts a mark-up named only in the action text, and a discharge", () => {
    const only = bill({
      committees: [{ code: "hsju00", name: "Judiciary Committee", chamber: "House", activities: [{ name: "Referred To", date: "2025-01-03" }, { name: "Discharged From", date: "2025-09-01" }], subcommittees: [] }],
      actions: [{ date: "2025-02-10", type: "Committee", text: "Subcommittee Consideration and Mark-up Session Held", committees: ["hsju00"] }],
    });
    expect(committeeEvents(only, only.committees[0]!, undefined)).toMatchObject({ m: "2025-02-10", d: "2025-09-01" });
  });
  it("puts a calendar date only on a bill the committee reported or was discharged from", () => {
    const e = committeeEvents(b, b.committees[1]!, "2025-04-10");
    expect(e.k).toBeUndefined();
  });
});

describe("buildShards", () => {
  const { shards, report } = buildShards([bill(), bill({ number: "27", title: "Second", introduced: "2025-02-01", sponsor: null, policy_area: null, cosponsors: [0, 0, 0], committees: [{ code: "hsju00", name: "Judiciary Committee", chamber: "House", activities: [{ name: "Referred To", date: "2025-02-02" }], subcommittees: [] }, { code: "hsxx00", name: "Gone", chamber: "House", activities: [], subcommittees: [] }], actions: [], reports: [], cbo_estimates: 0, latest_action: { date: "2025-02-02", text: "Referred" } })], 119, COMMITTEES, SUBS);
  it("writes a row per bill and committee, newest referral first", () => {
    expect([...shards.keys()]).toEqual(["HSII", "HSJU"]);
    expect(shards.get("HSJU")!.rows.map((r) => r.n)).toEqual(["27", "26"]);
    expect(report.rows).toBe(3);
  });
  it("keeps the dated steps, the sponsor table and the other-committee count", () => {
    const r = shards.get("HSII")!.rows[0]!;
    expect(r).toMatchObject({ b: "hr", n: "26", r: "2025-01-03", h: "2025-03-05", m: "2025-04-01", p: "2025-04-08", k: "2025-04-10", q: [24, 11], x: 1, g: ["2025-05-01", null], o: 1, u: [0], c: [2, 1, 0], z: ["2025-05-01", "Received in the Senate."] });
    expect(shards.get("HSII")!.sponsors).toEqual([["P000048", "Pfluger, August", "R", "TX-11"]]);
    expect(shards.get("HSII")!.subs).toEqual([{ id: "HSII13", name: "Federal Lands" }]);
    expect(shards.get("HSII")!.areas).toEqual(["Energy"]);
  });
  it("leaves out what is absent and the latest action of a bill that never moved", () => {
    const r = shards.get("HSJU")!.rows[0]!;
    expect(r).not.toHaveProperty("s");
    expect(r).not.toHaveProperty("a");
    expect(r).not.toHaveProperty("c");
    expect(r).not.toHaveProperty("z");
    expect(r.x).toBe(1);
  });
  it("reports a committee that is not in committees.json instead of writing it", () => {
    expect(report.unmapped_committees).toEqual({ hsxx00: { name: "Gone", chamber: "House", rows: 1 } });
  });
  it("validates against the shard schema", () => {
    for (const s of shards.values()) expect(committeeBillsShard.safeParse(s).success).toBe(true);
  });
});

describe("dataThrough", () => {
  it("is the latest dated event anywhere", () => {
    expect(dataThrough([bill()])).toBe("2025-05-01");
  });
});

describe("checkLaws", () => {
  it("passes when the bills' laws are the Laws track's laws", () => {
    expect(() => checkLaws(["119-1", "119-2"], ["119-1", "119-2"], 119)).not.toThrow();
  });
  it("fails on a law one side lacks", () => {
    expect(() => checkLaws(["119-1"], ["119-1", "119-2"], 119)).toThrow(/119-2/);
    expect(() => checkLaws(["119-1", "119-3"], ["119-1"], 119)).toThrow(/119-3/);
  });
});

// The committed output: every shard parses, the counts add up, and the stage-carrying fields are internally consistent.
describe("committed output", () => {
  const out = "pipeline/output";
  const meta = committeeBillsMeta.parse(JSON.parse(readFileSync(`${out}/committee_bills_meta.json`, "utf8")));
  const shards = Object.keys(meta.committees).map((id) => committeeBillsShard.parse(JSON.parse(readFileSync(`${out}/committee_bills/${id}.json`, "utf8"))));
  it("has a shard for every committee the meta lists, with the counts it states", () => {
    expect(shards).toHaveLength(Object.keys(meta.committees).length);
    for (const s of shards) expect(s.rows.length).toBe(meta.committees[s.committee_id]);
    expect(shards.reduce((n, s) => n + s.rows.length, 0)).toBe(meta.rows);
  });
  it("keeps every index inside its table", () => {
    for (const s of shards) {
      for (const r of s.rows) {
        if (r.s !== undefined) expect(s.sponsors[r.s]).toBeDefined();
        if (r.a !== undefined) expect(s.areas[r.a]).toBeDefined();
        for (const u of r.u ?? []) expect(s.subs[u]).toBeDefined();
      }
    }
  });
  it("orders each shard newest referral first and dates nothing after the data runs through", () => {
    for (const s of shards) {
      for (let i = 1; i < s.rows.length; i++) expect(s.rows[i - 1]!.r >= s.rows[i]!.r).toBe(true);
      for (const r of s.rows) for (const d of [r.r, r.h, r.m, r.p, r.d, r.k]) if (d) expect(d <= meta.data_through).toBe(true);
    }
  });
  it("only calls a bill a calendar placement after it was reported or discharged", () => {
    for (const s of shards) for (const r of s.rows) if (r.k) expect(!!(r.p || r.d)).toBe(true);
  });
});
