import { describe, expect, it } from "vitest";
import { displayName } from "./display-name";

describe("displayName", () => {
  it("uses the middle name when first is only an initial", () => {
    expect(displayName({ first: "J.", middle: "French", last: "Hill" })).toBe(
      "French Hill",
    );
    expect(
      displayName({ first: "W.", middle: "Gregory", last: "Steube" }),
    ).toBe("Gregory Steube");
  });
  it("prefers a nickname", () => {
    expect(
      displayName({ first: "Charles", nickname: "Chuck", last: "Schumer" }),
    ).toBe("Chuck Schumer");
  });
  it("unwraps a parenthetical nickname in first", () => {
    expect(
      displayName({
        first: "Charles (Chuck)",
        middle: "Marion",
        last: "Edwards",
      }),
    ).toBe("Chuck Edwards");
  });
  it("keeps J.D.-style names when there is no usable middle name", () => {
    expect(displayName({ first: "J.D.", last: "Vance" })).toBe("J.D. Vance");
  });
  it("does not swap in a middle initial", () => {
    expect(displayName({ first: "J.", middle: "R.", last: "Smith" })).toBe(
      "J. Smith",
    );
  });
});
