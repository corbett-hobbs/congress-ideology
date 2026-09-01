import { describe, expect, it } from "vitest";
import { buildLegislators } from "./legislators";
import { rawLegislator } from "./fixtures";

describe("buildLegislators", () => {
  it("keeps stable identity only and derives birth_year", () => {
    const [leg] = buildLegislators([
      rawLegislator({
        bioguide: "S000033",
        first: "Bernard",
        last: "Sanders",
        nickname: "Bernie",
        official_full: "Bernard Sanders",
        birthday: "1941-09-08",
        gender: "M",
        terms: [{ type: "sen", party: "Independent", caucus: "Democrat" }],
      }),
    ]);
    expect(leg).toEqual({
      bioguide_id: "S000033",
      name: {
        first: "Bernard",
        last: "Sanders",
        nickname: "Bernie",
        official_full: "Bernard Sanders",
      },
      birth_year: 1941,
      gender: "M",
    });
  });

  it("omits absent optional fields rather than emitting undefined", () => {
    const [leg] = buildLegislators([
      rawLegislator({ bioguide: "X000001", first: "A", last: "B", gender: "F" }),
    ]);
    expect(leg).not.toHaveProperty("birth_year");
    expect(Object.keys(leg.name)).toEqual(["first", "last"]);
  });

  it("sorts by bioguide_id", () => {
    const out = buildLegislators([
      rawLegislator({ bioguide: "C000003" }),
      rawLegislator({ bioguide: "A000001" }),
      rawLegislator({ bioguide: "B000002" }),
    ]);
    expect(out.map((l) => l.bioguide_id)).toEqual([
      "A000001",
      "B000002",
      "C000003",
    ]);
  });
});
