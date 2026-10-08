import { describe, expect, it } from "vitest";
import { DecisionsDataError } from "../../lib/decisions-entities";
import { buildCaseSummaries, checkAiSummary, checkCaseSummaries, splitSentences, stripHead, summarizeLead } from "./wikipedia-case-summaries";

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

const RUTHERFORD =
  'Rutherford v. United States (consolidated with Carter v. United States), 608 U.S. 454 (2026), was a United States Supreme Court case regarding federal sentencing laws. The Court held the First Step Act\'s amendments to 18 U.S.C. § 924(c) are not retroactively "extraordinary and compelling reasons" for granting compassionate release.';
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
  it("takes 'The Court held the ...' but not 'The Court held oral argument'", () => {
    expect(summarizeLead(RUTHERFORD)).toMatchObject({ sentence: 2, text: expect.stringMatching(/^The Court held the First Step Act's amendments/) });
    expect(summarizeLead("Foo v. Bar, 1 U.S. 1 (1950), was a case about taxes. The Court held oral argument on the question in the spring of that year.")).toBeNull();
  });
  it("skips a later sentence that says 'this' or names another case", () => {
    expect(summarizeLead("Lomax v. Ortiz-Marquez, 1 U.S. 1 (2020), was a case about prisoners. The court held this in a unanimous decision, although one justice joined all but a footnote.")).toBeNull();
    expect(summarizeLead("Flowers v. Mississippi, 588 U.S. 284 (2019), was a case about jurors. The Supreme Court held in Batson v. Kentucky that race-based strikes are unconstitutional.")).toBeNull();
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
  const { rows, report } = buildCaseSummaries(matched, leads, new Map([["No Lead v. Fetched", "x"]]));
  it("gives every case on an article its sentence and counts articles, not cases", () => {
    expect(rows.map((r) => r.case_id)).toEqual(["2009-001", "2009-002", "1990-001"]);
    expect(rows.map((r) => r.via)).toEqual(["wikipedia", "wikipedia", "claude"]);
    expect(report).toMatchObject({ articles: 3, with_lead: 2, summarized: 2, claude: 1, without: 1 });
  });
  it("prefers the article's own sentence over a cached model sentence for the same article", () => {
    const withBoth = buildCaseSummaries([{ case_id: "2009-001", title: "Mohawk Industries, Inc. v. Carpenter" }], leads, new Map([["Mohawk Industries, Inc. v. Carpenter", "A model-written sentence that must not be used for this case."]]));
    expect(withBoth.rows).toHaveLength(1);
    expect(withBoth.rows[0]).toMatchObject({ via: "wikipedia", summary: expect.stringMatching(/^The Court held that disclosure orders/) });
    expect(withBoth.report.claude).toBe(0);
  });
  it("uses a cached model sentence only where the picker finds nothing, and never a null answer", () => {
    const only = buildCaseSummaries(
      [{ case_id: "1976-001", title: "Hills v. Gautreaux" }, { case_id: "1990-001", title: "No Lead v. Fetched" }],
      leads,
      new Map<string, string | null>([["Hills v. Gautreaux", "In a housing dispute, the Court held that a federal remedy could reach beyond the city limits."], ["No Lead v. Fetched", null]]),
    );
    expect(only.rows.map((r) => [r.case_id, r.via])).toEqual([["1976-001", "claude"]]);
  });
  it("fails the build on a duplicate, an unknown case or a collapsed yield", () => {
    const ids = new Set(matched.map((m) => m.case_id));
    expect(() => checkCaseSummaries(rows, 4, ids)).toThrow(); // "x" is not a real sentence
    expect(() => checkCaseSummaries(rows.slice(0, 2), 4, ids)).not.toThrow();
    expect(() => checkCaseSummaries([...rows, rows[0]!], 4, ids)).toThrow(DecisionsDataError);
    expect(() => checkCaseSummaries(rows.slice(0, 2), 4, new Set(["2009-001"]))).toThrow(DecisionsDataError);
    expect(() => checkCaseSummaries(rows.slice(0, 2), 40, ids)).toThrow(DecisionsDataError);
  });
});

describe("checkAiSummary", () => {
  const lead = "Alabama v. Bozeman, 533 U.S. 146 (2001), was a case in which the Court held that a state violated the Interstate Agreement on Detainers by returning a prisoner to prison before trial on the charges. It involved a federal prisoner.";
  const sentence = "The Court held that a state violated the Interstate Agreement on Detainers by returning a prisoner to prison before his trial.";
  const evidence = "the Court held that a state violated the Interstate Agreement on Detainers by returning a prisoner to prison before trial";
  it("accepts a sentence whose evidence is in the lead and whose words come from it", () => {
    expect(checkAiSummary(sentence, evidence, lead)).toBe(true);
  });
  it("rejects a ruling the lead does not state (written from memory)", () => {
    expect(checkAiSummary("The Court held that the later prosecution was permissible under the compact.", "the Court held that the later prosecution was permissible", lead)).toBe(false);
  });
  it("rejects evidence that is not a verbatim stretch of the lead", () => {
    expect(checkAiSummary(sentence, "the Court held that the state acted unlawfully in every respect", lead)).toBe(false);
  });
  it("accepts a ruling worded without a ruling verb, as long as the quote is in the lead", () => {
    const l = "Chevron USA Inc. v. Plaquemines Parish, 608 U.S. ____ (2026), was a case about removal. The Supreme Court agreed in an 8–0 decision, determining that Chevron had shown its production was connected to wartime fuel contracts, and thus the case belonged in federal courts.";
    expect(checkAiSummary("In a removal dispute, the Court agreed in an 8–0 decision that Chevron had shown its production was connected to wartime fuel contracts, so the case belonged in federal courts.", "The Supreme Court agreed in an 8–0 decision, determining that Chevron had shown its production was connected to wartime fuel contracts", l)).toBe(true);
  });
  it("rejects a sentence with a number the lead does not have", () => {
    const l = "Chevron v. NRDC, 467 U.S. 837 (1984), was a case in which the Court held that courts should defer to the agency. In 1981, the EPA changed its definition of source.";
    const ev = "the Court held that courts should defer to the agency";
    expect(checkAiSummary("In a challenge to the EPA's 1981 change to its definition of source, the Court held that courts should defer to the agency.", ev, l)).toBe(true);
    expect(checkAiSummary("In a challenge to the EPA's 2981 change to its definition of source, the Court held that courts should defer to the agency.", ev, l)).toBe(false);
  });
  it("rejects a sentence that adds many words the lead does not have, is too short, or runs on", () => {
    expect(checkAiSummary("The Court held that a state violated detainer rules after Congress amended sentencing guidelines nationwide.", evidence, lead)).toBe(false);
    expect(checkAiSummary("The Court held so.", evidence, lead)).toBe(false);
    expect(checkAiSummary(`${sentence} It involved a federal prisoner.`, evidence, lead)).toBe(false);
  });
});
