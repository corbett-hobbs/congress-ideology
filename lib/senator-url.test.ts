import { describe, expect, it } from "vitest";
import { senatorPath, senatorSlug, slugifyName } from "./senator-url";

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
    expect(slugifyName("Catherine Cortez Masto")).toBe("catherine-cortez-masto");
    expect(slugifyName("Darline Graham Nordone")).toBe("darline-graham-nordone");
  });

  it("collapses stray separators", () => {
    expect(slugifyName("Cindy Hyde-Smith")).toBe("cindy-hyde-smith");
  });
});

describe("senatorPath", () => {
  it("builds the canonical path", () => {
    expect(
      senatorPath({ bioguideId: "S000148", name: "Chuck Schumer" }),
    ).toBe("/congress/senators/S000148/chuck-schumer");
  });

  it("resolves via id — slug is derived", () => {
    const ref = { bioguideId: "K000383", name: "Angus King" };
    expect(senatorSlug(ref)).toBe("angus-king");
  });
});
