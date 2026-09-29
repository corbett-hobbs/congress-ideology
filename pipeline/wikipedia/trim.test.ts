import { describe, expect, it } from "vitest";
import { needsReview, splitSentences, trimExtract } from "./trim";

describe("splitSentences", () => {
  it("does not split on U.S.", () => {
    expect(
      splitSentences("She is the junior U.S. senator from Washington. She is a Democrat."),
    ).toEqual([
      "She is the junior U.S. senator from Washington.",
      "She is a Democrat.",
    ]);
  });

  it("does not split on U.S. even before a capitalised word", () => {
    expect(splitSentences("He served in the U.S. Army. Then he ran.")).toEqual([
      "He served in the U.S. Army.",
      "Then he ran.",
    ]);
  });

  it("does not split on D-Calif. and other AP state tags", () => {
    expect(
      splitSentences("Sen. Alex Padilla (D-Calif.) Introduced a bill. It passed."),
    ).toEqual(["Sen. Alex Padilla (D-Calif.) Introduced a bill.", "It passed."]);
    expect(splitSentences("Rep. Jane Doe (R-Fla.) Spoke first. Then left.")).toHaveLength(2);
  });

  it("does not split on Jr., Sr., Dr., Mr.", () => {
    expect(
      splitSentences("John Smith Jr. Served as mayor. Dr. Jones followed. Mr. Lee too."),
    ).toEqual([
      "John Smith Jr. Served as mayor.",
      "Dr. Jones followed.",
      "Mr. Lee too.",
    ]);
  });

  it("does not split on middle initials", () => {
    expect(splitSentences("Steny H. Hoyer is a Democrat. He is old.")).toEqual([
      "Steny H. Hoyer is a Democrat.",
      "He is old.",
    ]);
  });

  it("splits on ! and ? and after closing quotes", () => {
    expect(splitSentences('He said "no." Then he left! Why? Nobody knows.')).toEqual([
      'He said "no."',
      "Then he left!",
      "Why?",
      "Nobody knows.",
    ]);
  });

  it("does not split on decimals or a lowercase continuation", () => {
    expect(splitSentences("It grew 3.5 percent in Rep. smith's view. Done.")).toEqual([
      "It grew 3.5 percent in Rep. smith's view.",
      "Done.",
    ]);
  });

  it("returns a trailing fragment without terminal punctuation", () => {
    expect(splitSentences("One. Two")).toEqual(["One.", "Two"]);
  });
});

describe("trimExtract", () => {
  it("keeps two sentences when they fit", () => {
    const text = "A is a senator. B is a Democrat. C happened.";
    expect(trimExtract(text)).toBe("A is a senator. B is a Democrat.");
  });

  it("drops to one sentence when two exceed the cap", () => {
    const s1 = "A".repeat(150) + ".";
    const s2 = "B".repeat(200) + ".";
    expect(trimExtract(`${s1} ${s2}`)).toBe(s1);
  });

  it("keeps an over-long first sentence whole", () => {
    const s1 = "A".repeat(500) + ".";
    expect(trimExtract(`${s1} Short.`)).toBe(s1);
  });

  it("never splits inside U.S. / D-Calif. / Jr. when trimming", () => {
    const text =
      "John Smith Jr. is the U.S. representative (D-Calif.) for the 5th district. He was elected in 2020. He lives there.";
    expect(trimExtract(text)).toBe(
      "John Smith Jr. is the U.S. representative (D-Calif.) for the 5th district. He was elected in 2020.",
    );
  });

  it("collapses whitespace and handles empty input", () => {
    expect(trimExtract("One.\n\nTwo   words.")).toBe("One. Two words.");
    expect(trimExtract("   ")).toBe("");
  });
});

describe("needsReview", () => {
  it("flags very short extracts", () => {
    expect(needsReview("A U.S. senator.")).toBe(true);
  });
  it("flags extracts that never mention the legislature", () => {
    expect(needsReview("x".repeat(100) + " is an American actor and singer known for many roles.")).toBe(true);
  });
  it("passes a normal extract", () => {
    expect(
      needsReview(
        "Maria Ellen Cantwell is an American politician serving since 2001 as the junior U.S. senator from Washington.",
      ),
    ).toBe(false);
  });
});
