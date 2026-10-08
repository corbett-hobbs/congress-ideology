import { describe, expect, it } from "vitest";
import { scdbCaseRow, scdbJusticeRow, type ScdbCaseRow, type ScdbJusticeRow } from "../../lib/decisions-entities";
import { buildJusticeVotes } from "./justice-votes";

const kase = (caseId: string, majVotes: number, minVotes: number, writer: string): ScdbCaseRow =>
  scdbCaseRow.parse({ caseId, term: "1990", decisionType: "1", majVotes, minVotes, voteUnclear: "", issueArea: "1", chief: "X", majOpinWriter: writer, decisionDirection: "", dateDecision: "1/1/1990", caseName: "A v. B", docket: "1", usCite: "", sctCite: "", ledCite: "", lexisCite: "" });
const row = (caseId: string, justice: number, vote: string, opinion: string, majority: string): ScdbJusticeRow => scdbJusticeRow.parse({ caseId, justice, vote, opinion, majority });

describe("buildJusticeVotes", () => {
  const cases = [kase("a", 2, 1, "1"), kase("b", 1, 1, "")];
  const rows = [
    row("a", 1, "1", "2", "2"), // wrote the majority opinion
    row("a", 2, "3", "2", "2"), // wrote a concurrence
    row("a", 3, "2", "2", "1"), // wrote a dissent
    row("b", 1, "8", "1", ""), // equally divided
    row("b", 2, "8", "1", ""),
    row("c", 1, "1", "1", "2"), // not a case in scope
  ];
  it("classifies each vote and keeps only cases in scope", () => {
    const { votes, report } = buildJusticeVotes(rows, cases);
    expect(votes["1"]).toEqual([["a", 1, 1], ["b", 3, 0]]);
    expect(votes["2"]).toEqual([["a", 1, 2], ["b", 3, 0]]);
    expect(votes["3"]).toEqual([["a", 2, 3]]);
    expect(report.out_of_scope_rows).toBe(1);
  });
  it("fails when the votes do not add up to the case's split", () => {
    expect(() => buildJusticeVotes(rows.slice(0, 2), cases)).toThrow(/give 2-0/);
  });
  it("marks a blank vote as not taking part", () => {
    const { votes } = buildJusticeVotes([...rows.slice(0, 3), row("b", 1, "8", "", ""), row("b", 2, "8", "", ""), row("a", 9, "", "", "")], cases);
    expect(votes["9"]).toEqual([["a", 0, 0]]);
  });
});
