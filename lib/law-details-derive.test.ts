import { describe, expect, it } from "vitest";
import { longDate, methodText, partySplit, rollLabel, timeline, yeaShare } from "./law-details-derive";
import { congressGovBillUrl, lawId, lawPath, lawSlug, parseLawId } from "./law-url";

describe("law URLs", () => {
  it("builds the canonical path and parses ids", () => {
    const path = lawPath(lawId(118, 90), "United States Commission on International Religious Freedom Reauthorization Act of 2024");
    expect(path.startsWith("/congress/laws/118-pub-90/united-states-commission-on-international-religious")).toBe(true);
    expect(path.split("/")[4]!.length).toBeLessThanOrEqual(70);
    expect(parseLawId("118-pub-90")).toEqual({ congress: 118, number: 90 });
    expect(parseLawId("118-pub-90x")).toBeNull();
    expect(parseLawId("abc")).toBeNull();
  });
  it("keeps a long old title to a word boundary and never returns an empty slug", () => {
    const s = lawSlug("A joint resolution to provide for a temporary prohibition of strikes or lockouts with respect to the Long Island Rail Road labor-management dispute.");
    expect(s.length).toBeLessThanOrEqual(70);
    expect(s.endsWith("-")).toBe(false);
    expect(s.startsWith("a-joint-resolution-to-provide")).toBe(true);
    expect(lawSlug("???")).toBe("law");
  });
  it("maps a bill to Congress.gov", () => {
    expect(congressGovBillUrl(118, "hr", "1")).toBe("https://www.congress.gov/bill/118th-congress/house-bill/1");
    expect(congressGovBillUrl(101, "sjres", "5")).toBe("https://www.congress.gov/bill/101st-congress/senate-joint-resolution/5");
    expect(congressGovBillUrl(112, "s", "9")).toBe("https://www.congress.gov/bill/112th-congress/senate-bill/9");
    expect(congressGovBillUrl(93, "x", "9")).toBeNull();
  });
});

describe("timeline", () => {
  it("labels roll calls and turns a signing entry into 'law'", () => {
    const t = timeline([
      ["2024-09-23", 0, "Passed.", [[0, 442, 2]]],
      ["2024-09-30", 2, "Signed by President."],
      ["2024-09-26", 2, "Presented to President."],
    ]);
    expect(t.map((x) => x.kind)).toEqual(["law", "president", "floor"]);
    expect(t[2]).toMatchObject({ rolls: ["House roll call 442"] });
    expect(rollLabel([1, 7, null])).toBe("Senate roll call 7");
  });
  it("runs newest first, and on one date the later step of the process first", () => {
    const t = timeline([
      ["2025-09-15", 7, "Introduced in the House"],
      ["2025-09-15", 6, "Referred to House Ways and Means Committee"],
      ["2026-09-17", 6, "Discharged from Senate Finance Committee"],
      ["2026-09-17", 0, "Passed Senate without amendment by Unanimous Consent."],
      ["2025-12-01", 0, "B first in the source"],
      ["2025-12-01", 0, "A second in the source"],
    ]);
    expect(t.map((x) => x.text)).toEqual([
      "Passed Senate without amendment by Unanimous Consent.",
      "Discharged from Senate Finance Committee",
      "B first in the source",
      "A second in the source",
      "Referred to House Ways and Means Committee",
      "Introduced in the House",
    ]);
    expect(t[0]!.kind).toBe("floor");
    expect(t[1]!.kind).toBe("committee");
    expect(t[5]!.kind).toBe("introduced");
  });
});

describe("votes and parties", () => {
  it("words the method", () => {
    expect(methodText([0, 365, 20])).toBe("Recorded vote");
    expect(methodText([1, null, null])).toBe("Voice vote");
    expect(methodText([2, null, null])).toBe("Unanimous consent");
    expect(methodText([3, null, null])).toBe("Method not stated");
  });
  it("shares and splits", () => {
    expect(yeaShare(3, 1)).toBe(0.75);
    expect(yeaShare(null, null)).toBeNull();
    expect(yeaShare(0, 0)).toBeNull();
    expect(partySplit(["R", "D", "R"])).toEqual([{ party: "D", n: 1 }, { party: "R", n: 2 }]);
  });
  it("formats dates without a time zone shift", () => {
    expect(longDate("2024-09-30")).toBe("Sep 30, 2024");
  });
});
