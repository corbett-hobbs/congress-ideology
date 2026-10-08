import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DecisionsDataError } from "../../lib/decisions-entities";
import { parseScdb, selectCases } from "./decisions";
import { checkLandmarks, leadLandmarks, matchLandmarks, nameKey, parseLandmarkList } from "./landmarks";

const WIKI = `
== Individual rights ==
=== Discrimination based on race and ethnicity ===
*''[[Brown v. Board of Education]]'', '''{{ussc|347|483|1954}}''' Segregation in public schools is unconstitutional.
*''[[Heart of Atlanta Motel, Inc. v. United States]]'', '''{{ussc|volume=379|page=241|year=1964}}''' Public accommodations.
== Criminal law ==
=== Capital punishment ===
*''[[City of Grants Pass v. Johnson]]'', '''{{ussc|volume=603|docket=23-175|date=2024}}''' Camping bans.
*''[[Heart of Atlanta Motel, Inc. v. United States|Heart of Atlanta Motel v. U.S.]]'', '''{{ussc|379|241|1964}}''' Again, under a second heading.
*''[[Sarah Keys v. Carolina Coach Company]]'', '''64 MCC 769 (1955)''' Not a Supreme Court case.
*''[[Marbury v. Madison]]'', '''{{ussc|5|137|1803}}''' Before SCDB.
== See also ==
*''[[Not a case]]'', '''{{ussc|1|1|2000}}'''
`;

describe("parseLandmarkList", () => {
  const e = parseLandmarkList(WIKI);
  it("reads positional and named {{ussc}} templates under their headings", () => {
    expect(e).toHaveLength(5);
    expect(e[0]).toMatchObject({ title: "Brown v. Board of Education", topic: "Individual rights › Discrimination based on race and ethnicity", volume: "347", page: "483", year: 1954 });
    expect(e[1]).toMatchObject({ volume: "379", page: "241", year: 1964 });
    expect(e[2]).toMatchObject({ volume: "603", page: null, docket: "23-175", year: 2024 });
    expect(e[3]).toMatchObject({ title: "Heart of Atlanta Motel, Inc. v. United States", display: "Heart of Atlanta Motel v. U.S." });
  });
  it("skips non-Supreme Court bullets and the See also section", () => {
    expect(e.some((x) => x.title.includes("Keys") || x.title === "Not a case")).toBe(false);
  });
});

describe("nameKey", () => {
  it("is the first significant word on each side of the v.", () => {
    expect(nameKey("BROWN v. BOARD OF EDUCATION OF TOPEKA")).toBe("brown|board");
    expect(nameKey("Brown v. Board of Education")).toBe("brown|board");
    expect(nameKey("FEC v. Ted Cruz for Senate")).toBe("fec|ted");
    expect(nameKey("In re Gault")).toBeNull();
  });
});

describe("against the real data", () => {
  const all = parseScdb(readFileSync("pipeline/raw/scdb/SCDB_2026_01_caseCentered_Citation.csv").toString("latin1"));
  const sel = selectCases(all);
  const text = readFileSync("pipeline/raw/wikipedia-landmarks/list.wikitext", "utf8");
  const entries = parseLandmarkList(text);
  const { rows, report } = matchLandmarks(entries, all, sel.cases);
  const byTitle = new Map(rows.map((r) => [r.title, r]));

  it("accounts for every entry exactly once and passes the gate", () => {
    expect(entries.length).toBeGreaterThan(450);
    expect(() => checkLandmarks(entries, rows, report, new Set(sel.cases.map((c) => c.caseId)))).not.toThrow();
    expect(report.by_via.us_cite + report.by_via.docket + report.by_via.name_year).toBe(rows.length);
    expect(rows.length).toBeGreaterThan(330);
  });
  it("joins by cite, by docket and by name and year", () => {
    expect(byTitle.get("Brown v. Board of Education")?.via).toBe("us_cite");
    expect(byTitle.get("City of Grants Pass v. Johnson")?.via).toBe("docket");
    expect(byTitle.get("Dobbs v. Jackson Women's Health Organization")?.via).toBe("name_year");
  });
  it("leaves pre-SCDB and out-of-scope cases out, and keeps every heading a case sits under", () => {
    expect(byTitle.has("Marbury v. Madison")).toBe(false);
    expect(report.out_of_scope.map((o) => o.title)).toContain("Dusky v. United States");
    expect(byTitle.get("Heart of Atlanta Motel, Inc. v. United States")!.topics.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((r) => r.topics.length >= 1)).toBe(true);
  });
  it("fails the gate when entries go missing, when too many fail to join, or when a case is not on the page", () => {
    const ids = new Set(sel.cases.map((c) => c.caseId));
    expect(() => checkLandmarks(entries.slice(1), rows, report, ids)).toThrow(DecisionsDataError);
    expect(() => checkLandmarks(entries, rows, { ...report, unmatched: report.unmatched.concat(Array(30).fill(report.unmatched[0]!)), pre_1946: report.pre_1946 - 30 }, ids)).toThrow(/did not join|accounted/);
    expect(() => checkLandmarks(entries, rows, report, new Set())).toThrow(/not a case on the page/);
    expect(() => checkLandmarks(entries.slice(0, 40), rows.slice(0, 5), { ...report, entries: 40, matched: 5 }, ids)).toThrow(DecisionsDataError);
  });
});

describe("leadLandmarks", () => {
  const linked = [
    { case_id: "2025-065", title: "Mullin v. Doe" },
    { case_id: "1990-001", title: "On the list" },
    { case_id: "1990-002", title: "Late mention" },
    { case_id: "1990-003", title: "No lead" },
  ];
  const leads = {
    "Mullin v. Doe": "Mullin v. Doe, 609 U.S. ___ (2026), is a landmark United States Supreme Court case in which the Court held",
    "On the list": "X v. Y is a landmark decision.",
    "Late mention": `${"A".repeat(700)} is a landmark decision.`,
  };
  it("flags an article whose opening calls the case a landmark, once, and not a case already on the list", () => {
    expect(leadLandmarks(linked, leads, new Set(["1990-001"]))).toEqual([{ case_id: "2025-065", title: "Mullin v. Doe", topics: [], via: "lead" }]);
  });
});
