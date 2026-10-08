import { describe, expect, it } from "vitest";
import { DecisionsDataError } from "../../lib/decisions-entities";
import { buildCaseSummaries, checkCaseSummaries, splitSentences, stripHead, summarizeLead } from "./wikipedia-case-summaries";

// Real openings of Wikipedia case articles (trimmed), one per shape the picker has to handle.
const MOHAWK =
  "Mohawk Industries, Inc. v. Carpenter, 558 U.S. 100 (2009), is a United States Supreme Court case in which the Court held that disclosure orders adverse to attorney–client privilege do not qualify for immediate appeal under the collateral order doctrine.\nThis opinion is notable, as being the first Supreme Court opinion authored by Justice Sonia Sotomayor.";
const EDELMAN =
  "Edelman v. Jordan, 415 U.S. 651 (1974), was a United States Supreme Court case that held that the sovereign immunity recognized in the Eleventh Amendment prevented a federal court from ordering a state from paying back funds that had been unconstitutionally withheld.";
const PASADENA =
  "Pasadena City Board of Education v. Spangler, 427 U.S. 424 (1976), was a United States Supreme Court case holding that once a school district remedies de jure racial discrimination they are not required to provide remedies for population shifts that are not caused by state discrimination.";
const LYNG = "Lyng v. Castillo, 477 U.S. 635 (1986), reversed a lower court's decision that the change in the statutory definition of a household violated the appellee's due process rights.";
const STUMP =
  "Stump v. Sparkman, 435 U.S. 349 (1978), is the leading United States Supreme Court decision on judicial immunity. It involved an Indiana judge who was sued by a young woman. The Supreme Court held that the judge was immune from being sued for issuing the order because it was issued as a judicial function.";
const IANCU =
  "Iancu v. Brunetti, No. 18–302, 588 U.S. 388 (2019), is a Supreme Court of the United States case related to the registration of trademarks. It decided 6–3 that the provisions of the Lanham Act prohibiting registration of scandalous matter is unconstitutional.";
const MATTZ = "Mattz v. Arnett was a United States Supreme Court case in which the Court held that the land that had been the Klamath River Reservation remained Indian country within the meaning of federal law.";
const REL = "Louisiana ex rel. Francis v. Resweber, 329 U.S. 459 (1947), is a case in which the U.S. Supreme Court held that a second attempt at execution did not violate the Constitution.";

describe("splitSentences", () => {
  it("leaves v., U.S., Co., No. and initials inside a sentence", () => {
    expect(splitSentences("Smith v. Jones Co., No. 12-34, 500 U.S. 1 (1991), was a case. The Court held that X.")).toEqual(["Smith v. Jones Co., No. 12-34, 500 U.S. 1 (1991), was a case.", "The Court held that X."]);
    expect(splitSentences("Louisiana ex rel. Francis v. Resweber, 329 U.S. 459 (1947), is a case. It was argued.")).toHaveLength(2);
  });
});

describe("stripHead", () => {
  it("cuts the name, cite and scaffolding and keeps the clause that follows", () => {
    expect(stripHead(MOHAWK.split("\n")[0]!)).toEqual({ text: "The Court held that disclosure orders adverse to attorney–client privilege do not qualify for immediate appeal under the collateral order doctrine.", cut: true });
  });
  it("puts a subject back in front of a bare verb", () => {
    expect(stripHead(EDELMAN).text).toMatch(/^The Court held that the sovereign immunity/);
    expect(stripHead(LYNG).text).toMatch(/^The Court reversed a lower court's decision/);
  });
  it("turns 'a case holding that' into 'The Court held that'", () => {
    expect(stripHead(PASADENA).text).toMatch(/^The Court held that once a school district remedies/);
  });
  it("copes with a missing cite", () => {
    expect(stripHead(MATTZ).text).toMatch(/^The Court held that the land/);
  });
  it("hands a sentence with no cite head back untouched", () => {
    expect(stripHead("The Court held that X is Y.")).toEqual({ text: "The Court held that X is Y.", cut: false });
  });
});

describe("summarizeLead", () => {
  it("takes the first sentence when it states the ruling", () => {
    expect(summarizeLead(MOHAWK)).toMatchObject({ sentence: 1, text: expect.stringMatching(/^The Court held that disclosure orders/) });
    expect(summarizeLead(REL)).toMatchObject({ sentence: 1 });
  });
  it("falls through to a later sentence that opens with the Court as its subject", () => {
    expect(summarizeLead(STUMP)).toEqual({ sentence: 3, text: "The Supreme Court held that the judge was immune from being sued for issuing the order because it was issued as a judicial function." });
    expect(summarizeLead(IANCU)?.text).toMatch(/^The Court decided 6–3 that/);
  });
  it("gives nothing when the opening states no ruling", () => {
    expect(summarizeLead("Hills v. Gautreaux, 425 U.S. 284 (1976), was a decision of the United States Supreme Court.")).toBeNull();
    expect(summarizeLead("Bell v. Wolfish, 441 U.S. 520 (1979), concerned the conditions of inmates held in short-term detention. The case was argued in 1978.")).toBeNull();
  });
  it("gives nothing for an article that is not a case (a term list reached through a redirect)", () => {
    expect(summarizeLead("The Supreme Court of the United States handed down twelve per curiam opinions during its 2002 term. The Court held that something.")).toBeNull();
  });
  it("skips a later sentence that points back at one it is not showing", () => {
    expect(summarizeLead("Butz v. Economou, 438 U.S. 478 (1978), was a case about officials. The court held that such officials were entitled only to qualified immunity, except where absolute immunity is essential.")).toBeNull();
  });
  it("drops footnote marks and refuses a sentence that is too long or cut off", () => {
    expect(summarizeLead("Bates v. City of Little Rock, 361 U.S. 516 (1960), was a case in which the Court held that the First Amendment forbade compelled disclosure of membership lists.[1]")?.text).not.toMatch(/\[/);
    expect(summarizeLead(`Long v. Case, 1 U.S. 1 (1950), was a case in which the Court held that ${"the thing ".repeat(40)}was so.`)).toBeNull();
    expect(summarizeLead("Cut v. Off, 1 U.S. 1 (1950), was a case in which the Court held that the thing was decided because of the")).toBeNull();
  });
});

describe("buildCaseSummaries / checkCaseSummaries", () => {
  const leads = { "Mohawk Industries, Inc. v. Carpenter": MOHAWK, "Hills v. Gautreaux": "Hills v. Gautreaux, 425 U.S. 284 (1976), was a decision of the United States Supreme Court." };
  const matched = [
    { case_id: "2009-001", title: "Mohawk Industries, Inc. v. Carpenter" },
    { case_id: "2009-002", title: "Mohawk Industries, Inc. v. Carpenter" }, // a companion case shares the article
    { case_id: "1976-001", title: "Hills v. Gautreaux" },
    { case_id: "1990-001", title: "No Lead v. Fetched" },
  ];
  const { rows, report } = buildCaseSummaries(matched, leads);
  it("gives every case on an article its sentence and counts articles, not cases", () => {
    expect(rows.map((r) => r.case_id)).toEqual(["2009-001", "2009-002"]);
    expect(report).toMatchObject({ articles: 3, with_lead: 2, summarized: 1, without: 2 });
  });
  it("fails the build on a duplicate, an unknown case or a collapsed yield", () => {
    const ids = new Set(matched.map((m) => m.case_id));
    expect(() => checkCaseSummaries(rows, 4, ids)).not.toThrow();
    expect(() => checkCaseSummaries([...rows, rows[0]!], 4, ids)).toThrow(DecisionsDataError);
    expect(() => checkCaseSummaries(rows, 4, new Set(["2009-001"]))).toThrow(DecisionsDataError);
    expect(() => checkCaseSummaries(rows, 40, ids)).toThrow(DecisionsDataError);
  });
});
