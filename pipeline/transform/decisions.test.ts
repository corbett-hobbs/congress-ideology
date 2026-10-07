import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DecisionsDataError, decisionCountRow, decisionsMeta, type ChiefReferenceEntry, type IssueAreaCatalogEntry } from "../../lib/decisions-entities";
import { buildChiefSpans, buildCounts, buildMeta, checkChiefReference, dissentBucket, issueAreaId, parseScdb, recountFromCsv, runGates, selectCases } from "./decisions";

const catalog: IssueAreaCatalogEntry[] = [
  { id: "a", scdb_code: 1, label: "A" },
  { id: "b", scdb_code: 2, label: "B" },
];
const chiefs: ChiefReferenceEntry[] = [
  { scdb_chief: "Smith", name: "Al Smith", justice_id: 1, appointing_president: "Harry S Truman", appointing_party: "Democratic" },
  { scdb_chief: "Jones", name: "Bo Jones", justice_id: 2, appointing_president: "Richard M. Nixon", appointing_party: "Republican" },
];

const HEADER = "caseId,term,decisionType,majVotes,minVotes,voteUnclear,issueArea,chief";
const csv = (...lines: string[]) => [HEADER, ...lines].join("\n") + "\n";
const SAMPLE = csv(
  "1,1946,1,9,0,,1,Smith",
  "2,1946,1,5,4,,2,Smith",
  "3,1946,6,8,1,,,Smith", // per curiam, no issue area
  "4,1946,2,9,0,,1,Smith", // summary: excluded
  "5,1946,4,9,0,,1,Smith", // decree: excluded
  "6,1946,1,5,4,1,1,Smith", // unclear: excluded
  "7,1947,1,6,3,,1,Jones",
  "8,1947,5,4,4,,1,Jones", // 4-4 tie: bucket 4
  "9,1947,1,7,1,,2,Smith",
);

describe("decisions transform", () => {
  it("clips dissents at 4", () => {
    expect([0, 1, 2, 3, 4, 5].map(dissentBucket)).toEqual([0, 1, 2, 3, 4, 4]);
  });

  it("applies the unit-of-analysis rule and counts exclusions", () => {
    const sel = selectCases(parseScdb(SAMPLE));
    expect(sel.cases.map((c) => c.caseId)).toEqual(["1", "2", "3", "7", "8", "9"]);
    expect(sel.exclusions).toEqual({ summary_dispositions: 1, decrees: 1, unclear_votes: 1 });
  });

  it("builds one row per term and issue area, unclassified kept as null", () => {
    const rows = buildCounts(selectCases(parseScdb(SAMPLE)).cases, catalog);
    expect(rows.every((r) => decisionCountRow.safeParse(r).success)).toBe(true);
    expect(rows).toEqual([
      { term: 1946, issue_area_id: "a", n: 1, d0: 1, d1: 0, d2: 0, d3: 0, d4: 0 },
      { term: 1946, issue_area_id: "b", n: 1, d0: 0, d1: 0, d2: 0, d3: 0, d4: 1 },
      { term: 1946, issue_area_id: null, n: 1, d0: 0, d1: 1, d2: 0, d3: 0, d4: 0 },
      { term: 1947, issue_area_id: "a", n: 2, d0: 0, d1: 0, d2: 0, d3: 1, d4: 1 },
      { term: 1947, issue_area_id: "b", n: 1, d0: 0, d1: 1, d2: 0, d3: 0, d4: 0 },
    ]);
  });

  it("fails loudly on an unknown issue area or chief", () => {
    expect(() => issueAreaId(99, catalog)).toThrow(/unknown SCDB issueArea code 99/);
    const cases = selectCases(parseScdb(csv("1,1946,1,9,0,,1,Nobody"))).cases;
    expect(() => buildChiefSpans(cases, chiefs)).toThrow(/unknown SCDB chief "Nobody"/);
    expect(() => selectCases(parseScdb(csv("1,1946,3,9,0,,1,Smith")))).toThrow(/unknown decisionType 3/);
  });

  it("fails on a duplicate caseId", () => {
    expect(() => parseScdb(csv("1,1946,1,9,0,,1,Smith", "1,1946,1,9,0,,1,Smith"))).toThrow(/duplicate caseId/);
  });

  it("builds chief spans from the modal chief of each term", () => {
    const spans = buildChiefSpans(selectCases(parseScdb(SAMPLE)).cases, chiefs);
    expect(spans.map((s) => [s.scdb_chief, s.start_term, s.end_term])).toEqual([["Smith", 1946, 1946], ["Jones", 1947, 1947]]);
  });

  it("checks the chief reference against the Court track", () => {
    const justices = [
      { justice_id: 1, chief_justice_appointment: { president: "Harry S Truman", party: "Democratic" } },
      { justice_id: 2, chief_justice_appointment: { president: "Richard M. Nixon", party: "Republican" } },
    ];
    const presidents = [
      { president: "Harry S. Truman", party: "Democratic" },
      { president: "Richard Nixon", party: "Republican" },
    ];
    expect(() => checkChiefReference(chiefs, justices, presidents)).not.toThrow();
    expect(() => checkChiefReference(chiefs, [justices[0]!, { justice_id: 2, chief_justice_appointment: null }], presidents)).toThrow(/not a Chief Justice/);
    expect(() => checkChiefReference(chiefs, justices, presidents.slice(0, 1))).toThrow(/not in the presidents table/);
    expect(() => checkChiefReference([{ ...chiefs[0]!, appointing_party: "Republican" }], justices, presidents)).toThrow(/court track says/);
  });
});

describe("gates", () => {
  const REAL = readFileSync("pipeline/raw/scdb/SCDB_2026_01_caseCentered_Citation.csv").toString("latin1");
  const rows = parseScdb(REAL);
  const sel = selectCases(rows);
  const realCatalog = JSON.parse(readFileSync("pipeline/reference/decision-issue-areas.json", "utf8")).areas as IssueAreaCatalogEntry[];
  const realChiefs = JSON.parse(readFileSync("pipeline/reference/chief-justices.json", "utf8")).chiefs as ChiefReferenceEntry[];
  const counts = buildCounts(sel.cases, realCatalog);
  const meta = decisionsMeta.parse(
    buildMeta({ version: "2026_01", sourceFile: "x.csv", cases: sel.cases, selection: sel, catalog: realCatalog, spans: buildChiefSpans(sel.cases, realChiefs) }),
  );
  const recount = recountFromCsv(REAL);

  it("pass on the real release and match the plan's facts", () => {
    expect(() => runGates({ version: "2026_01", counts, meta, recount })).not.toThrow();
    expect(sel.cases).toHaveLength(8251);
    expect(sel.exclusions.unclear_votes).toBe(82);
    expect(meta.unclassified_count).toBe(67);
    expect(meta.chief_spans.map((s) => s.scdb_chief)).toEqual(["Vinson", "Warren", "Burger", "Rehnquist", "Roberts"]);
  });

  it("fail when a row is lost, a bucket moves, a term goes missing or an anchor drifts", () => {
    const lost = counts.map((r, i) => (i === 5 ? { ...r, n: r.n - 1, d0: r.d0 > 0 ? r.d0 - 1 : r.d0, d1: r.d0 > 0 ? r.d1 : r.d1 - 1 } : r));
    expect(() => runGates({ version: "2026_01", counts: lost, meta, recount })).toThrow(DecisionsDataError);
    const i4 = counts.findIndex((r) => r.d4 > 0);
    const moved = counts.map((r, i) => (i === i4 ? { ...r, d4: r.d4 - 1, d3: r.d3 + 1 } : r));
    expect(() => runGates({ version: "2026_01", counts: moved, meta, recount })).toThrow(/5-4 count/);
    expect(() => runGates({ version: "2026_01", counts: counts.filter((r) => r.term !== 1960), meta, recount })).toThrow(/gate failed/);
    expect(() => runGates({ version: "2026_01", counts, meta: { ...meta, unclassified_count: 1 }, recount })).toThrow(/unclassified/);
    expect(() => runGates({ version: "2026_01", counts, meta: { ...meta, exclusions: { ...meta.exclusions, unclear_votes: 81 } }, recount })).toThrow(/exclusions/);
  });

  it("the committed outputs are the transform of the committed raw file", () => {
    const committed = readFileSync("pipeline/output/decisions_counts.json", "utf8");
    const normalized = `[\n${counts.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`;
    expect(committed).toBe(normalized);
  });
});
