import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { committeeBillsShard, type CommitteeBillRow } from "./committee-bills-entities";
import {
  FLOW_MIN_BAND,
  NO_FILTER,
  billLabel,
  congressGovUrl,
  filterBills,
  flowLayout,
  isBipartisan,
  monthColumns,
  monthLabel,
  passedHere,
  prepareBills,
  sortBills,
  stageCounts,
  stageOf,
  subcommitteeMix,
  timelineSteps,
} from "./committee-bills-derive";
import type { BillSponsorCell } from "./committee-bills-types";

const row = (over: Partial<CommitteeBillRow> = {}): CommitteeBillRow => ({ b: "hr", n: "1", t: "A bill", i: "2025-01-03", r: "2025-01-03", ...over });
const sponsors: BillSponsorCell[] = [
  ["Andy Biggs", "R-AZ-5", "R", "/congress/house/B001302/andy-biggs"],
  ["Jamie Raskin", "D-MD-8", "D", null],
];
const payload = (rows: CommitteeBillRow[], chamber: "house" | "senate" | "joint" = "house") => ({ rows, chamber, dataThrough: "2026-10-07", areas: ["Energy", "Law"], sponsors });

describe("stageOf", () => {
  it("reads the furthest step recorded", () => {
    expect(stageOf(row(), "house")).toBe(1);
    expect(stageOf(row({ h: "2025-02-01" }), "house")).toBe(2);
    expect(stageOf(row({ h: "2025-02-01", m: "2025-03-01" }), "house")).toBe(3);
    expect(stageOf(row({ p: "2025-03-08" }), "house")).toBe(4);
    expect(stageOf(row({ d: "2025-03-08" }), "house")).toBe(4);
    expect(stageOf(row({ p: "2025-03-08", g: ["2025-04-01", null] }), "house")).toBe(5);
    expect(stageOf(row({ g: ["2025-04-01", "2025-05-01"], l: "119-5", w: "2025-06-01" }), "house")).toBe(6);
  });
  it("does not infer a step the source never logged", () => {
    expect(stageOf(row({ m: "2025-03-01" }), "house")).toBe(3);
  });
  it("counts passage of the committee's own chamber only", () => {
    const g: CommitteeBillRow["g"] = [null, "2025-04-01"];
    expect(passedHere(g, "house")).toBe(false);
    expect(passedHere(g, "senate")).toBe(true);
    expect(passedHere(g, "joint")).toBe(true);
    expect(passedHere(undefined, "house")).toBe(false);
  });
});

describe("labels", () => {
  it("labels a bill and links Congress.gov", () => {
    expect(billLabel({ b: "hjres", n: "7" })).toBe("H.J.Res. 7");
    expect(congressGovUrl({ b: "s", n: "24" }, 119)).toBe("https://www.congress.gov/bill/119th-congress/senate-bill/24");
    expect(congressGovUrl({ b: "sjres", n: "3" }, 111)).toBe("https://www.congress.gov/bill/111th-congress/senate-joint-resolution/3");
    expect(monthLabel("2026-03")).toBe("Mar ’26");
  });
});

describe("isBipartisan", () => {
  it("needs a cosponsor from the other party", () => {
    expect(isBipartisan("R", [0, 5, 0])).toBe(false);
    expect(isBipartisan("R", [1, 5, 0])).toBe(true);
    expect(isBipartisan("D", [3, 1, 0])).toBe(true);
    expect(isBipartisan("D", [3, 0, 0])).toBe(false);
    expect(isBipartisan("I", [1, 1, 0])).toBe(true);
    expect(isBipartisan("I", [4, 0, 0])).toBe(false);
    expect(isBipartisan("R", undefined)).toBe(false);
  });
});

const rows: CommitteeBillRow[] = [
  row({ n: "1", r: "2025-01-03", s: 0, c: [2, 6, 0], a: 0, u: [0] }),
  row({ n: "2", r: "2025-02-10", s: 1, c: [9, 0, 0], a: 1, h: "2025-03-01", t: "Clean Water Act" }),
  row({ n: "3", r: "2025-02-11", s: 0, m: "2025-04-01", q: [14, 9], u: [0, 1] }),
  row({ n: "4", r: "2025-03-05", s: 1, d: "2025-06-01", g: ["2025-07-01", null] }),
  row({ n: "5", r: "2025-03-06", s: 0, p: "2025-05-01", k: "2025-05-02", e: ["H. Rept. 119-9"] }),
  row({ n: "6", r: "2026-09-20", g: ["2025-08-01", "2025-09-01"], l: "119-7", w: "2025-10-01" }),
];
const list = prepareBills(payload(rows));

describe("prepareBills", () => {
  it("derives stage, cosponsors, bipartisanship, month and waiting", () => {
    expect(list.map((b) => b.stage)).toEqual([1, 2, 3, 5, 4, 6]);
    expect(list[0]).toMatchObject({ cosponsors: 8, bipartisan: true, month: "2025-01", last: "2025-01-03" });
    expect(list[1]!.bipartisan).toBe(false);
    // 2025-01-03 to 2026-10-07 is far over a month; a bill past markup is never "waiting".
    expect(list[0]!.waiting).toBeGreaterThan(600);
    expect(list[4]!.waiting).toBeNull();
    expect(list[5]!.waiting).toBeNull();
  });
  it("does not flag a bill referred within the month", () => {
    const p = prepareBills(payload([row({ r: "2026-09-20" })]));
    expect(p[0]!.waiting).toBeNull();
  });
});

describe("stageCounts", () => {
  const c = stageCounts(list);
  it("counts where bills stopped and how far they got", () => {
    expect(c.stop.slice(1)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(c.reach.slice(1)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(c.discharged).toBe(0);
  });
  it("splits discharged from reported at stage 4", () => {
    expect(stageCounts(prepareBills(payload([row({ d: "2025-06-01" }), row({ p: "2025-06-01" })]))).discharged).toBe(1);
  });
});

describe("filterBills", () => {
  const ids = (f: Partial<typeof NO_FILTER>, skip?: "stage" | "month") => filterBills(list, { ...NO_FILTER, ...f }, sponsors, skip).map((b) => b.row.n);
  it("filters by stage, stopped or reached", () => {
    expect(ids({ stage: { k: 3, mode: "stop" } })).toEqual(["3"]);
    expect(ids({ stage: { k: 4, mode: "reach" } })).toEqual(["4", "5", "6"]);
    expect(ids({ stage: { k: 4, mode: "reach" } }, "stage")).toHaveLength(6);
  });
  it("filters by sponsor party, bipartisanship, area, subcommittee and month", () => {
    expect(ids({ party: "R" })).toEqual(["1", "3", "5"]);
    expect(ids({ bipartisan: true })).toEqual(["1"]);
    expect(ids({ area: 1 })).toEqual(["2"]);
    expect(ids({ sub: 1 })).toEqual(["3"]);
    expect(ids({ month: "2025-02" })).toEqual(["2", "3"]);
    expect(ids({ month: "2025-02" }, "month")).toHaveLength(6);
  });
  it("searches every word across bill, title, sponsor, area and law number", () => {
    expect(ids({ query: "clean water" })).toEqual(["2"]);
    expect(ids({ query: "h.r. 5" })).toEqual(["5"]);
    expect(ids({ query: "raskin" })).toEqual(["2", "4"]);
    expect(ids({ query: "119-7" })).toEqual(["6"]);
    expect(ids({ query: "energy" })).toEqual(["1"]);
    expect(ids({ query: "water nonsense" })).toEqual([]);
  });
});

describe("sortBills", () => {
  const order = (id: Parameters<typeof sortBills>[1]) => sortBills(list, id).map((b) => b.row.n);
  it("sorts newest referral, furthest along, waiting longest and most cosponsors", () => {
    expect(order("new")).toEqual(["6", "5", "4", "3", "2", "1"]);
    expect(order("far")[0]).toBe("6");
    expect(order("wait").slice(0, 3)).toEqual(["1", "2", "3"]);
    expect(order("cos").slice(0, 2)).toEqual(["2", "1"]);
  });
});

describe("monthColumns", () => {
  const cols = monthColumns(list, 119, "2026-10-07");
  it("runs month by month from January of the Congress's first year to the data's month", () => {
    expect(cols[0]!.key).toBe("2025-01");
    expect(cols.at(-1)!.key).toBe("2026-10");
    expect(cols).toHaveLength(22);
  });
  it("stacks every bill once by its furthest stage", () => {
    expect(cols.reduce((n, c) => n + c.total, 0)).toBe(6);
    expect(cols.find((c) => c.key === "2025-02")!.values).toMatchObject({ "2": 1, "3": 1 });
    for (const c of cols) expect(Object.values(c.values).reduce((a, b) => a + b, 0)).toBe(c.total);
  });
});

describe("flowLayout", () => {
  const counts = stageCounts(prepareBills(payload([...rows, ...Array.from({ length: 94 }, (_, i) => row({ n: String(100 + i) }))])));
  const o = { width: 900, height: 300, top: 40, bottom: 30, nodeW: 12, padL: 4, padR: 100 };
  const f = flowLayout(counts, o);
  it("draws a node for every stage reached and one for each stage bills ended at", () => {
    expect(f.nodes.filter((n) => n.kind === "reach")).toHaveLength(6);
    expect(f.nodes.filter((n) => n.kind === "stop").map((n) => n.stage)).toEqual([1, 2, 3, 4, 5]);
  });
  it("sizes nodes by count, with a floor so a few bills stay visible", () => {
    const [first, second] = f.nodes.filter((n) => n.kind === "reach");
    expect(first!.value).toBe(100);
    expect(first!.h).toBeGreaterThan(second!.h);
    const law = f.nodes.find((n) => n.id === "reach-6")!;
    expect(law.h).toBeGreaterThanOrEqual(3);
  });
  it("keeps every node inside the plot and columns left to right", () => {
    for (const n of f.nodes) {
      expect(n.y).toBeGreaterThanOrEqual(o.top);
      expect(n.y + n.h).toBeLessThanOrEqual(o.height - o.bottom + 0.001);
      expect(n.x + n.w).toBeLessThanOrEqual(o.width - o.padR + 0.001);
    }
    const xs = f.nodes.filter((n) => n.kind === "reach").map((n) => n.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });
  it("draws a band into each next stage and each ending, none for a count of zero", () => {
    expect(f.links.filter((l) => l.kind === "reach")).toHaveLength(5);
    expect(f.links.filter((l) => l.kind === "stop")).toHaveLength(5);
    const none = flowLayout(stageCounts(prepareBills(payload([row(), row()]))), o);
    expect(none.links.filter((l) => l.kind === "reach")).toHaveLength(0);
    expect(none.links.filter((l) => l.kind === "stop")).toHaveLength(1);
    for (const l of f.links) expect(l.d).toMatch(/^M[\d.,\-]+ C.* Z$/);
  });
  it("handles an empty committee without dividing by zero", () => {
    const e = flowLayout(stageCounts([]), o);
    expect(e.links).toHaveLength(0);
    expect(e.nodes.every((n) => n.h === 0)).toBe(true);
    expect(FLOW_MIN_BAND).toBeGreaterThan(0);
  });
});

describe("subcommitteeMix", () => {
  it("counts a bill in every subcommittee it was referred to, most bills first", () => {
    const mix = subcommitteeMix(list, [{ id: "X01", name: "Alpha" }, { id: "X02", name: "Beta" }, { id: "X03", name: "Gamma" }]);
    expect(mix.map((m) => [m.name, m.total])).toEqual([["Alpha", 2], ["Beta", 1]]);
    expect(mix[0]!.stop[1]).toBe(1);
    expect(mix[0]!.stop[3]).toBe(1);
  });
});

describe("timelineSteps", () => {
  it("lists the steps in order, with the vote and the law", () => {
    const t = timelineSteps(row({ h: "2025-02-01", m: "2025-03-01", q: [24, 11], p: "2025-03-08", k: "2025-03-09", e: ["H. Rept. 119-9"], g: ["2025-04-01", null], l: "119-5", w: "2025-06-01" }), "house");
    expect(t.map((s) => s.label)).toEqual(["Referred", "Hearing", "Markup or ordered reported", "Reported", "Placed on a calendar", "Passed the House", "Became law"]);
    expect(t[2]).toMatchObject({ note: "24–11 vote", date: "2025-03-01" });
    expect(t[3]).toMatchObject({ note: "H. Rept. 119-9" });
    expect(t.at(-1)).toMatchObject({ date: "2025-06-01", note: "Pub. L. 119–5", done: true });
  });
  it("marks a step not recorded and names a discharge", () => {
    const t = timelineSteps(row({ d: "2025-06-01" }), "senate");
    expect(t.find((s) => s.label === "Hearing")).toMatchObject({ done: false, date: null });
    expect(t.find((s) => s.label === "Discharged")).toMatchObject({ done: true });
    expect(t.find((s) => s.label === "Passed the Senate")).toMatchObject({ done: false });
  });
});

// The real shards: stage counts add up and no committee's rows are lost.
describe("real shards", () => {
  const meta = JSON.parse(readFileSync("pipeline/output/committee_bills_meta.json", "utf8")) as { committees: Record<string, number>; data_through: string };
  for (const id of ["HSII", "HSJU", "SSJU"]) {
    it(`${id}: counts add up and every bill has a stage`, () => {
      const s = committeeBillsShard.parse(JSON.parse(readFileSync(`pipeline/output/committee_bills/${id}.json`, "utf8")));
      const prepared = prepareBills({ rows: s.rows, chamber: s.chamber, dataThrough: meta.data_through, areas: s.areas, sponsors: s.sponsors.map((x): BillSponsorCell => [x[1], `${x[2]}-${x[3]}`, x[2], null]) });
      const c = stageCounts(prepared);
      expect(c.reach[1]).toBe(meta.committees[id]);
      expect(c.stop.slice(1).reduce((a, b) => a + b, 0)).toBe(meta.committees[id]);
      expect(monthColumns(prepared, 119, meta.data_through).reduce((n, m) => n + m.total, 0)).toBe(meta.committees[id]);
    });
  }
});
