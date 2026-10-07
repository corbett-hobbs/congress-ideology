import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { ageOn, buildDemographics, caucusGroup, conveningDate, isVotingTerm, presidentOnConvening, type DemoLegislator, type DemoTerm } from "./demographics-derive";
import { CONVENING, tenureBand } from "./demographics-entities";
import { legislator, term } from "./entities";
import { administration } from "./executive-orders-entities";
import { HISTORICAL_ADMINISTRATIONS } from "./troops-presidents";

const out = (f: string): unknown[] => JSON.parse(readFileSync(`pipeline/output/${f}`, "utf8"));
const legislators = out("legislators.json").map((r) => legislator.parse(r));
const terms = out("terms.json").map((r) => term.parse(r));
const admins = [...HISTORICAL_ADMINISTRATIONS, ...out("administrations.json").map((r) => administration.parse(r))];
const payload = buildDemographics(legislators, terms, admins);

const L = (id: string, gender: "M" | "F" = "M", birthday?: string): DemoLegislator => ({ bioguide_id: id, gender, ...(birthday ? { birthday } : {}) });
const T = (id: string, c: number, chamber: "house" | "senate" = "house", caucus: string | null = "Democrat", state = "OH"): DemoTerm => ({ bioguide_id: id, congress_number: c, chamber, state, caucus });

describe("convening dates", () => {
  it("match the most common House term start in the first months of each Congress (raw congress-legislators)", () => {
    const R = "pipeline/raw/congress-legislators/";
    const people = [...parse(readFileSync(`${R}legislators-current.yaml`, "utf8")), ...parse(readFileSync(`${R}legislators-historical.yaml`, "utf8"))] as { terms: { type: string; start: string }[] }[];
    for (const [c, day] of Object.entries(CONVENING)) {
      const year = String(1789 + 2 * (Number(c) - 1));
      const n = new Map<string, number>();
      for (const p of people) for (const t of p.terms) if (t.type === "rep" && t.start.startsWith(year) && t.start.slice(5, 7) < "04") n.set(t.start, (n.get(t.start) ?? 0) + 1);
      const top = [...n].sort((a, b) => b[1] - a[1])[0][0];
      expect(day, `${c}th Congress`).toBe(top);
    }
  });
  it("cover 73 through the latest Congress in the data, in order", () => {
    const days = Object.keys(CONVENING).map(Number);
    expect(days[0]).toBe(73);
    expect(days[days.length - 1]).toBe(payload.lastCongress);
    const dates = days.map((c) => conveningDate(c));
    expect([...dates].sort()).toEqual(dates);
  });
});

describe("ageOn", () => {
  it("counts a birthday that falls on the convening day", () => {
    expect(ageOn("1950-01-03", "2025-01-03")).toBe(75);
    expect(ageOn("1950-01-04", "2025-01-03")).toBe(74);
    expect(ageOn("1950-12-31", "2025-01-03")).toBe(74);
  });
});

describe("voting members and caucus", () => {
  it("drops delegates, and Alaska/Hawaii delegates before statehood", () => {
    expect(isVotingTerm({ bioguide_id: "X", congress_number: 100, chamber: "house", state: "PR" })).toBe(false);
    expect(isVotingTerm({ bioguide_id: "X", congress_number: 80, chamber: "house", state: "HI" })).toBe(false);
    expect(isVotingTerm({ bioguide_id: "X", congress_number: 87, chamber: "house", state: "HI" })).toBe(true);
    expect(isVotingTerm({ bioguide_id: "B001127", congress_number: 86, chamber: "house", state: "HI" })).toBe(false);
    expect(isVotingTerm({ bioguide_id: "X", congress_number: 80, chamber: "senate", state: "OH" })).toBe(true);
  });
  it("groups compound caucus names with their party and everything else as other", () => {
    expect([caucusGroup("Democrat"), caucusGroup("Democrat-Liberal"), caucusGroup("Republican"), caucusGroup("Independent"), caucusGroup(null)]).toEqual(["D", "D", "R", "O", "O"]);
  });
});

describe("tenure", () => {
  it("counts back across 1933: first elected in the 63rd, he is in the 11-or-more band in the 73rd", () => {
    const ts = Array.from({ length: 11 }, (_, i) => T("A", 63 + i));
    const p = buildDemographics([L("A")], ts, admins);
    expect(p.views.both[0].tenure).toEqual([0, 0, 0, 1]);
    expect([1, 2, 5, 6, 10, 11].map(tenureBand)).toEqual([0, 1, 1, 2, 2, 3]);
  });
  it("counts gaps and either chamber, once per Congress", () => {
    const ts = [T("A", 70), T("A", 72, "senate"), T("A", 73), T("A", 73, "senate")];
    const p = buildDemographics([L("A")], ts, admins);
    expect(p.views.house[0].tenure).toEqual([0, 1, 0, 0]);
    expect(p.views.senate[0].tenure).toEqual([0, 1, 0, 0]);
    expect(p.views.both[0].seats).toBe(1);
  });
  it("puts a member who is in their first Congress in the first band", () => {
    expect(buildDemographics([L("A")], [T("A", 73)], admins).views.both[0].tenure).toEqual([1, 0, 0, 0]);
  });
});

describe("age, women and the roster", () => {
  const ls = [L("A", "M", "1900-03-09"), L("B", "F", "1890-01-01"), L("C", "F"), L("D", "F", "1900-01-01")];
  const ts = [T("A", 73), T("B", 73, "senate", "Republican"), T("C", 73, "house", "Republican"), T("D", 73, "house", "Independent"), T("A", 73, "house", "Democrat", "PR")];
  const p = buildDemographics(ls, ts, admins).views.both[0];
  it("is every voting member once; delegates are out", () => {
    expect(p.seats).toBe(4);
  });
  it("ages by caucus on the convening day, leaving out members with no birthdate", () => {
    expect(p.age.D).toEqual({ median: 33, average: 33, n: 1 }); // born the day of the convening: a whole 33
    expect(p.age.R).toEqual({ median: 43, average: 43, n: 1 });
    expect(p.ageMissing).toBe(1); // C
  });
  it("counts women by caucus group", () => {
    expect(p.women).toEqual({ D: 0, R: 2, O: 1 });
  });
});

describe("the real data", () => {
  const n = payload.lastCongress - payload.firstCongress + 1;
  it("has one row per Congress in every view", () => {
    for (const v of Object.values(payload.views)) expect(v.map((r) => r.congress)).toEqual(Array.from({ length: n }, (_, i) => 73 + i));
  });
  it("never has fewer seat-holders than seats: Senate 96/98/100, House 435", () => {
    for (const r of payload.views.senate) expect(r.seats, `Senate ${r.congress}`).toBeGreaterThanOrEqual(r.congress <= 85 ? 96 : r.congress === 86 ? 98 : 100);
    for (const r of payload.views.house) expect(r.seats, `House ${r.congress}`).toBeGreaterThanOrEqual(435);
  });
  it("stays inside a plausible ceiling (seats plus mid-term replacements)", () => {
    for (const r of payload.views.senate) expect(r.seats).toBeLessThanOrEqual(120);
    for (const r of payload.views.house) expect(r.seats).toBeLessThanOrEqual(470);
  });
  it("Both is Senate plus House, less the few people who held a seat in each chamber in one Congress", () => {
    const both = new Map<number, Set<string>>();
    const by = new Map<string, Set<string>>();
    for (const t of terms) {
      if (t.congress_number < 73 || !isVotingTerm(t)) continue;
      const k = `${t.congress_number}`;
      const s = by.get(`${k}|${t.bioguide_id}`) ?? new Set();
      s.add(t.chamber);
      by.set(`${k}|${t.bioguide_id}`, s);
    }
    for (const [key, ch] of by) if (ch.size === 2) (both.get(Number(key.split("|")[0])) ?? both.set(Number(key.split("|")[0]), new Set()).get(Number(key.split("|")[0]))!).add(key);
    for (let i = 0; i < n; i++) {
      const c = 73 + i;
      const b = payload.views.both[i];
      const s = payload.views.senate[i];
      const h = payload.views.house[i];
      expect(b.seats).toBe(s.seats + h.seats - (both.get(c)?.size ?? 0));
      expect(b.women.D + b.women.R + b.women.O).toBeLessThanOrEqual(s.women.D + s.women.R + s.women.O + h.women.D + h.women.R + h.women.O);
    }
  });
  it("tenure bands add up to the seats, so each tenure bar is 100%", () => {
    for (const v of Object.values(payload.views)) for (const r of v) expect(r.tenure.reduce((a, b) => a + b, 0)).toBe(r.seats);
  });
  it("leaves out few members for want of a birthdate", () => {
    const missing = payload.views.both.reduce((a, r) => a + r.ageMissing, 0);
    const total = payload.views.both.reduce((a, r) => a + r.seats, 0);
    expect(missing / total).toBeLessThan(0.005);
  });
  it("puts the president in office on the first day on each Congress", () => {
    expect(presidentOnConvening(admins, 73).president).toBe("Franklin D. Roosevelt");
    expect(presidentOnConvening(admins, 79).president).toBe("Franklin D. Roosevelt"); // Jan 1945, Truman came in April
    expect(presidentOnConvening(admins, 115).president).toBe("Barack Obama"); // Jan 3, 2017
    expect(presidentOnConvening(admins, 119).president).toBe("Joe Biden"); // Jan 3, 2025
    expect(payload.views.both[0].termId).toBe("1933-03-04");
  });
  it("ages run in a plausible range and the latest Congress is older than the 1970s", () => {
    for (const r of payload.views.both) {
      for (const g of ["D", "R"] as const) {
        expect(r.age[g].median).toBeGreaterThan(40);
        expect(r.age[g].median).toBeLessThan(70);
      }
    }
    const row = (c: number) => payload.views.both[c - 73];
    expect(row(118).age.D.average!).toBeGreaterThan(row(95).age.D.average!);
  });
});
