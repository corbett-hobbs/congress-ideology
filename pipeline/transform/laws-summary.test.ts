import { describe, expect, it } from "vitest";
import { firstSentence, splitSentences, summaryText } from "./laws-summary";

const one = (html: string) => firstSentence(html).sentence;

describe("summaryText", () => {
  it("drops a leading bold name, tags and entities", () => {
    expect(summaryText("<p><strong>Name Act</strong></p><p>This act does a thing.&nbsp;</p><ul><li>one</li></ul>")).toBe("This act does a thing. one");
  });
});

describe("splitSentences", () => {
  it("does not split on abbreviations or initials", () => {
    expect(splitSentences("Amends 5 U.S.C. to protect D.C. employees. Requires the Sec. of the Treasury to act.")).toEqual(["Amends 5 U.S.C. to protect D.C. employees.", "Requires the Sec. of the Treasury to act."]);
    expect(splitSentences("Designates the Gerald R. Ford Building in Grand Rapids. Another sentence.")[0]).toBe("Designates the Gerald R. Ford Building in Grand Rapids.");
  });
});

describe("firstSentence", () => {
  it("cuts the stage note and the name from a 1970s-90s summary", () => {
    expect(one("(Measure passed House, amended) Designates specified lands in the Fire Island National Seashore, New York, as the Fire Island Wilderness. Declares more.")).toBe("Designates specified lands in the Fire Island National Seashore, New York, as the Fire Island Wilderness.");
    expect(one("American University Incorporation Amendments Act of 1990 - Amends Federal law to remove the requirement that three-fifths of the members of the Board be citizens. Next.")).toMatch(/^Amends Federal law to remove/);
  });
  it("cuts nested stage notes", () => {
    expect(one("(Measure passed House, amended, roll call #43 (342-69)) Designates the Point Reyes Wilderness, Point Reyes National Seashore, California, as the Phillip Burton Wilderness. More.")).toMatch(/^Designates the Point Reyes/);
  });
  it("cuts the 2000s 'has not been amended' note", () => {
    expect(one("(This measure has not been amended since it was introduced. The summary of that version is repeated here.) Directs the Secretary of Defense to reimburse a member of the armed forces for costs. More.")).toMatch(/^Directs the Secretary of Defense/);
  });
  it("cuts an omnibus summary's opening title and a name that runs into the sentence", () => {
    expect(one("Title I: Military Personnel - Appropriates funds for FY 2004 for active-duty and reserve personnel in the Army, Navy, Marine Corps, and Air Force.")).toMatch(/^Appropriates funds for FY 2004/);
    expect(one("Major Medical Facility Authorization Act of 2020 This bill authorizes the Department of Veterans Affairs to carry out specified major medical facility projects during FY2020.")).toBe("Authorizes the Department of Veterans Affairs to carry out specified major medical facility projects during FY2020.");
  });
  it("turns 'This act ...' into the verb", () => {
    expect(one("<p><strong>Title</strong></p><p>This act designates the facility of the U.S. Postal Service located at 1663 East Date Place in San Bernardino, California, as the Dr. Margaret B. Hill Post Office Building.</p>")).toMatch(/^Designates the facility of the U\.S\. Postal Service located at 1663 East Date Place/);
    expect(one("This bill would amend the Internal Revenue Code to do many different things at once.")).toMatch(/^This bill would/);
  });
  it("gives none for a table of contents, a fragment, or a sentence out of range", () => {
    expect(firstSentence("TABLE OF CONTENTS: Title I: Medicare Provisions Subtitle A: Provisions Relating to Part A").why).toBe("table-of-contents");
    expect(firstSentence("(Reported to House from the Committee on Armed Services with amendment, H.").sentence).toBeNull();
    expect(firstSentence("Designates a post office.").why).toBe("too-short");
    expect(firstSentence(`Amends ${"the law ".repeat(60)}.`).why).toBe("too-long");
    expect(firstSentence(null).why).toBe("empty");
  });
});
