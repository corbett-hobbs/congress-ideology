import { describe, expect, it } from "vitest";
import type { WikiCaseEntry } from "../fetch/wikipedia-cases-lib";
import type { ScdbCaseRow } from "../../lib/decisions-entities";
import { checkWikipediaCases, isCaseArticle, matchWikipediaCases, overlap, sideKey } from "./wikipedia-cases";

const scdb = (o: Partial<ScdbCaseRow> & { caseId: string; caseName: string }): ScdbCaseRow => ({
  term: 2000, decisionType: 1, majVotes: 9, minVotes: 0, voteUnclear: 0, issueArea: 1, chief: "Rehnquist", decisionDirection: null, dateDecision: "6/1/2001", docket: "", usCite: "", sctCite: "", ledCite: "", lexisCite: "", ...o,
});
const wiki = (o: Partial<WikiCaseEntry> & { name: string }): WikiCaseEntry => ({ title: o.name, volume: null, page: null, docket: null, year: null, source: "s", ...o });

describe("names", () => {
  it("keys a case by the first word on each side of the v.", () => {
    expect(sideKey("PUNG v. ISABELLA COUNTY, MICHIGAN")).toBe("pung|isabella");
    expect(sideKey("Pung v. Isabella County (2026)")).toBe("pung|isabella");
    expect(sideKey("In re Gault")).toBeNull();
  });
  it("overlaps abbreviations with their full words", () => {
    expect(overlap("NEW YORK, CHICAGO & ST. LOUIS RAILROAD CO.", "N.Y.C. & S.L.E.R.R. Co.")).toBeLessThan(0.5);
    expect(overlap("Bell Telephone Co.", "Bell Telephone Company")).toBe(1);
  });
  it("rejects list self-links and topic pages, keeps case and multi-case articles", () => {
    expect(isCaseArticle("List of United States Supreme Court cases, volume 498", "Ohio v. Huertas")).toBe(false);
    expect(isCaseArticle("Fifth Amendment to the United States Constitution", "Salinas v. Texas")).toBe(false);
    expect(isCaseArticle("The Tidelands Case", "United States v. California")).toBe(true);
    expect(isCaseArticle("Biden v. Nebraska", "Department of Education v. Brown")).toBe(true);
  });
});

describe("matchWikipediaCases", () => {
  it("joins by U.S. cite even when the names are abbreviated differently", () => {
    const { rows } = matchWikipediaCases([wiki({ name: "Stone v. N.Y.C. & St. L.R. Co.", title: "Stone v. New York Central", volume: 345, page: 1 })], [scdb({ caseId: "a", caseName: "STONE v. NEW YORK, CHICAGO & ST. LOUIS RAILROAD CO.", usCite: "345 U.S. 1" })]);
    expect(rows).toEqual([{ case_id: "a", title: "Stone v. New York Central", via: "us_cite" }]);
  });
  it("treats a redirect and its target as one article, and lets the names choose between companions", () => {
    const entries = [wiki({ name: "A v. B", title: "A v. B", volume: 400, page: 5 }), wiki({ name: "A v. B", title: "Old A v. B", volume: 400, page: 5 })];
    expect(matchWikipediaCases(entries, [scdb({ caseId: "a", caseName: "A v. B", usCite: "400 U.S. 5" })], { "Old A v. B": "A v. B" }).rows).toHaveLength(1);
    const companions = [wiki({ name: "Roe v. Wade", volume: 410, page: 113 }), wiki({ name: "Doe v. Bolton", volume: 410, page: 113 })];
    expect(matchWikipediaCases(companions, [scdb({ caseId: "d", caseName: "DOE v. BOLTON", usCite: "410 U.S. 113" })]).rows[0]!.title).toBe("Doe v. Bolton");
  });
  it("joins a decision with no U.S. cite by its docket and year, the names only vetoing", () => {
    const entries = [wiki({ name: "National Republican Senatorial Committee v. FEC", volume: 609, docket: "24-621", year: 2026 }), wiki({ name: "Other v. Case", volume: 609, docket: "24-999", year: 2026 })];
    const nrsc = scdb({ caseId: "n", caseName: "NATIONAL REPUBLICAN SENATORIAL COMMITTEE v. FEDERAL ELECTION COMMISSION", docket: "24-621", dateDecision: "6/30/2026", ledCite: "225 L. Ed. 2d 998" });
    expect(matchWikipediaCases(entries, [nrsc]).rows).toEqual([{ case_id: "n", title: "National Republican Senatorial Committee v. FEC", via: "docket" }]);
    // same docket, unrelated name or a different year: no match
    expect(matchWikipediaCases(entries, [{ ...nrsc, caseName: "ACME CORP. v. WIDGET CO." }]).rows).toEqual([]);
    expect(matchWikipediaCases(entries, [{ ...nrsc, dateDecision: "6/30/2019" }]).rows).toEqual([]);
  });
  it("joins by docket within the volume", () => {
    const { rows } = matchWikipediaCases([wiki({ name: "Allen v. Milligan", volume: 599, docket: "21-1086" })], [scdb({ caseId: "m", caseName: "ALLEN v. MILLIGAN", docket: "21-1086", usCite: "599 U.S. 99999" })]);
    expect(rows).toEqual([{ case_id: "m", title: "Allen v. Milligan", via: "docket" }]);
  });
  it("joins a case with no U.S. cite by name and year (Pung v. Isabella County)", () => {
    const { rows } = matchWikipediaCases([wiki({ name: "Pung v. Isabella County", volume: 609, page: 30, year: 2026 })], [scdb({ caseId: "p", caseName: "Pung v. Isabella County, Michigan", sctCite: "146 S. Ct. 1964", dateDecision: "6/23/2026", term: 2025 })]);
    expect(rows).toEqual([{ case_id: "p", title: "Pung v. Isabella County", via: "name_year" }]);
  });
  it("does not guess: a different year, or two candidate articles, gives no link", () => {
    const c = scdb({ caseId: "x", caseName: "Smith v. Jones", dateDecision: "6/1/1990", term: 1989 });
    expect(matchWikipediaCases([wiki({ name: "Smith v. Jones", year: 2005 })], [c]).rows).toEqual([]);
    const two = matchWikipediaCases([wiki({ name: "Smith v. Jones", title: "Smith v. Jones (1990)", year: 1990 }), wiki({ name: "Smith v. Jones", title: "Smith v. Jones (1991)", year: 1991 })], [c]);
    expect(two.rows).toEqual([{ case_id: "x", title: "Smith v. Jones (1990)", via: "name_year" }]);
    const ambiguous = matchWikipediaCases([wiki({ name: "Smith v. Jones", title: "Smith v. Jones", year: 1990 }), wiki({ name: "Smith v. Jones", title: "Smith v. Jones Inc.", year: 1990 })], [c]);
    expect(ambiguous.rows).toEqual([]);
    expect(ambiguous.report.conflicts).toHaveLength(1);
  });
  it("separates 'the list shows no article' from 'no list names the case'", () => {
    const entries = [wiki({ name: "A v. B", title: null, volume: 350, page: 1 }), wiki({ name: "Z", title: "Z", volume: 420, page: 1, source: "List of volume 420" })];
    const cases = [scdb({ caseId: "red", caseName: "A v. B", usCite: "350 U.S. 1" }), scdb({ caseId: "none", caseName: "Q v. R", sctCite: "146 S. Ct. 1", term: 2025, dateDecision: "6/1/2026" })];
    const { report } = matchWikipediaCases(entries, cases);
    expect(report.red_linked).toEqual(["red"]);
    expect(report.unlisted).toBe(1);
  });
});

describe("checkWikipediaCases", () => {
  it("fails when the match rate collapses", () => {
    const { report } = matchWikipediaCases([], [scdb({ caseId: "a", caseName: "A v. B" })]);
    expect(() => checkWikipediaCases([], report, new Set(["a"]))).toThrow(/only 0 of 1/);
  });
});
