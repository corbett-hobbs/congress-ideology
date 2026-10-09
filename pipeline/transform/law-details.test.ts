import { describe, expect, it } from "vitest";
import { lawDetailsShard } from "../../lib/law-details-entities";
import type { RawAction, RawLaw } from "../../lib/laws-entities";
import { buildActions, buildLawDetail, cleanActionText, committeeActions, committeeLabel, lawIdDifferences, RAW_SUMMARY_CAP, summaryParagraphs } from "./law-details";

const act = (date: string, type: string, text: string, votes?: RawAction["votes"]): RawAction => ({ date, type, text, src: null, ...(votes ? { votes } : {}) });

describe("summaryParagraphs", () => {
  it("drops the bold name paragraph, tags and entities", () => {
    const r = summaryParagraphs("<p><strong>Some Act</strong></p><p>This act does &quot;x&quot; &amp; y.&nbsp;</p><p>Second.</p>");
    expect(r.paragraphs).toEqual(['This act does "x" & y.', "Second."]);
    expect(r.cut).toBe(false);
  });
  it("splits the old unclosed <p> style and list items", () => {
    expect(summaryParagraphs("Intro. <p>  Next paragraph. <p> <ul><li>One</li><li>Two</li></ul>").paragraphs).toEqual(["Intro.", "Next paragraph.", "• One", "• Two"]);
  });
  it("drops a stage note that stands alone", () => {
    expect(summaryParagraphs("<p>(LATEST SUMMARY)</p><p>Does a thing.</p>").paragraphs).toEqual(["Does a thing."]);
    expect(summaryParagraphs("(Measure passed House, amended) <p>Does a thing.").paragraphs).toEqual(["Does a thing."]);
  });
  it("trims a summary the fetcher cut back to its last finished sentence", () => {
    const html = `<p>First sentence. Second sentence. ${"x".repeat(RAW_SUMMARY_CAP)}`.slice(0, RAW_SUMMARY_CAP);
    const r = summaryParagraphs(html);
    expect(r.cut).toBe(true);
    expect(r.paragraphs).toEqual(["First sentence. Second sentence."]);
  });
});

describe("cleanActionText", () => {
  it("removes the Library of Congress prefix and the Congressional Record references", () => {
    expect(cleanActionText("Passed/agreed to in Senate: Passed Senate by Unanimous Consent. (consideration: CR S6003; text: CR S6003)")).toBe("Passed Senate by Unanimous Consent.");
    expect(cleanActionText("Agreed to: 365 - 20 (Roll no. 442). (text: CR H5598)")).toBe("Agreed to: 365 - 20 (Roll no. 442).");
  });
  it("leaves other parentheses alone", () => {
    expect(cleanActionText("Passed (2/3 required): 365 - 20 (Roll no. 442).")).toBe("Passed (2/3 required): 365 - 20 (Roll no. 442).");
  });
});

describe("buildActions", () => {
  it("merges the two copies of an action and keeps the roll call", () => {
    const v = [{ chamber: "House" as const, roll: 442, session: 2, date: "2024-09-23" }];
    const out = buildActions([act("2024-09-23", "Floor", "Passed (Roll no. 442). (text: CR H1)", v), act("2024-09-23", "Floor", "Passed/agreed to in House: Passed (Roll no. 442). (text: CR H1)", v)]);
    expect(out).toEqual([["2024-09-23", 0, "Passed (Roll no. 442).", [[0, 442, 2]]]]);
  });
  it("merges a President and a BecameLaw entry with the same text", () => {
    expect(buildActions([act("2024-09-30", "President", "Signed by President."), act("2024-09-30", "BecameLaw", "Signed by President.")])).toEqual([["2024-09-30", 2, "Signed by President."]]);
  });
  it("sorts by date and keeps the source order within a day", () => {
    const out = buildActions([act("2024-02-02", "Floor", "B"), act("2024-02-01", "Floor", "A2"), act("2024-02-01", "Floor", "A1")]);
    expect(out.map((a) => a[2])).toEqual(["A2", "A1", "B"]);
  });
  it("keeps a veto and an unknown type", () => {
    expect(buildActions([act("1974-01-01", "Veto", "Vetoed by President."), act("1974-01-02", "Odd", "Something.")]).map((a) => a[1])).toEqual([4, 5]);
  });
});

const law = (over: Partial<RawLaw> = {}): RawLaw => ({
  law_id: "118-pub-1", congress: 118, number: 1, bill_type: "hr", bill_number: "1", origin_chamber: "House", title: "t", introduced: "2023-01-01",
  sponsor: null, sponsor_name: null, cosponsors: [], policy_area: null, summary_html: null, summary_stage: null, became_law: ["2023-02-01"],
  latest_action_date: null, updated: null, actions: [], committees: [], ...over,
});

describe("buildLawDetail", () => {
  it("has a null summary when the law has none and parses against the shard schema", () => {
    const d = buildLawDetail(law({ actions: [act("2023-02-01", "BecameLaw", "Signed by President.")] }));
    expect(d.summary).toBeNull();
    expect(() => lawDetailsShard.parse({ congress: 118, laws: { "118-pub-1": d } })).not.toThrow();
  });
  it("marks a cut summary", () => {
    const d = buildLawDetail(law({ summary_html: `<p>Does a thing. ${"y".repeat(RAW_SUMMARY_CAP)}`.slice(0, RAW_SUMMARY_CAP) }));
    expect(d.cut).toBe(true);
    expect(d.summary).toEqual(["Does a thing."]);
  });
});

describe("lawIdDifferences", () => {
  it("is empty when the ids are equal and names both sides otherwise", () => {
    expect(lawIdDifferences(["a", "b"], ["b", "a"])).toEqual({ missing: [], extra: [] });
    expect(lawIdDifferences(["a", "c"], ["a", "b"])).toEqual({ missing: ["b"], extra: ["c"] });
  });
});

describe("committeeActions", () => {
  const committees = [
    { code: "hswm00", name: "Ways and Means Committee", chamber: "House", activities: [{ name: "Reported By", date: "2025-10-31" }, { name: "Markup by", date: "2025-09-17" }, { name: "Referred To", date: "2025-09-15" }, { name: "Unknown", date: "2025-09-15" }, { name: "Referred to", date: null }], subcommittees: [{ code: "hswm03", name: "Health Subcommittee", activities: [{ name: "Hearings By (subcommittee)", date: "2025-09-20" }] }] },
    { code: "ssfi00", name: "Finance Committee", chamber: "Senate", activities: [{ name: "Discharged From", date: "2026-09-17" }], subcommittees: [] },
  ];
  it("words the introduction, each dated committee step and each subcommittee step, and drops the undated and the unknown", () => {
    const out = committeeActions(law({ introduced: "2025-09-15", origin_chamber: "House", committees }));
    expect(out.map((a) => [a.date, a.type, a.text])).toEqual([
      ["2025-09-15", "Introduced", "Introduced in the House"],
      ["2025-10-31", "Committee", "Reported by House Ways and Means Committee"],
      ["2025-09-17", "Committee", "Markup by House Ways and Means Committee"],
      ["2025-09-15", "Committee", "Referred to House Ways and Means Committee"],
      ["2025-09-20", "Committee", "Hearings by Health Subcommittee of the House Ways and Means Committee"],
      ["2026-09-17", "Committee", "Discharged from Senate Finance Committee"],
    ]);
  });
  it("does not double the chamber and leaves a joint committee bare", () => {
    expect(committeeLabel("House Administration Committee", "House")).toBe("House Administration Committee");
    expect(committeeLabel("Joint Economic Committee", "Joint")).toBe("Joint Economic Committee");
  });
  it("puts them in the stored action list, oldest first, ahead of the floor on a shared date", () => {
    const d = buildLawDetail(law({ introduced: "2025-09-15", committees, actions: [act("2025-09-15", "Floor", "Floor same day")] }));
    expect(d.actions.map((a) => a[2]).slice(0, 3)).toEqual(["Introduced in the House", "Referred to House Ways and Means Committee", "Floor same day"]);
  });
});
