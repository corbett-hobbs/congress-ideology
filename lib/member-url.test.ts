import { describe, expect, it } from "vitest";
import { memberPath, memberSlug, slugifyName } from "./member-url";

describe("slugifyName", () => {
  it("lowercases and hyphenates", () => {
    expect(slugifyName("Chuck Schumer")).toBe("chuck-schumer");
  });

  it("drops periods, running initials together", () => {
    expect(slugifyName("J.D. Vance")).toBe("jd-vance");
  });

  it("strips accents", () => {
    expect(slugifyName("Ben Luján")).toBe("ben-lujan");
  });

  it("strips apostrophes", () => {
    expect(slugifyName("Beto O'Rourke")).toBe("beto-orourke");
  });

  it("keeps multi-word last names", () => {
    expect(slugifyName("Marjorie Taylor Greene")).toBe("marjorie-taylor-greene");
    expect(slugifyName("Alexandria Ocasio-Cortez")).toBe(
      "alexandria-ocasio-cortez",
    );
  });
});

describe("memberPath", () => {
  it("routes senators under /congress/senators", () => {
    expect(
      memberPath({
        chamber: "senate",
        bioguideId: "S000148",
        name: "Chuck Schumer",
      }),
    ).toBe("/congress/senators/S000148/chuck-schumer");
  });

  it("routes representatives under /congress/house", () => {
    expect(
      memberPath({
        chamber: "house",
        bioguideId: "O000172",
        name: "Alexandria Ocasio-Cortez",
      }),
    ).toBe("/congress/house/O000172/alexandria-ocasio-cortez");
  });

  it("slug is derived from the name alone", () => {
    expect(memberSlug({ name: "Angus King" })).toBe("angus-king");
  });
});
