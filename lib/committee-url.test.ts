import { describe, expect, it } from "vitest";
import { committeePath, committeeSlug } from "./committee-url";

describe("committeeSlug", () => {
  it("slugifies the short name", () => {
    expect(committeeSlug({ shortName: "Ways and Means" })).toBe("ways-and-means");
    expect(committeeSlug({ shortName: "Joint Economic" })).toBe("joint-economic");
  });

  it("drops punctuation the way member slugs do", () => {
    expect(
      committeeSlug({ shortName: "Agriculture, Nutrition, and Forestry" }),
    ).toBe("agriculture-nutrition-and-forestry");
    expect(committeeSlug({ shortName: "Veterans' Affairs" })).toBe(
      "veterans-affairs",
    );
  });
});

describe("committeePath", () => {
  it("routes under /congress/committees with the committee id and slug", () => {
    expect(
      committeePath({ committeeId: "HSJU", shortName: "Judiciary" }),
    ).toBe("/congress/committees/HSJU/judiciary");
  });
});
