import { describe, expect, it } from "vitest";
import type { ChamberMember } from "./congress-types";
import { ideologicalDistance, nearestNeighbors } from "./neighbors";

function member(
  bioguideId: string,
  dim1: number | null,
  dim2: number | null,
): ChamberMember {
  return {
    bioguideId,
    chamber: "house",
    name: bioguideId,
    lastName: bioguideId,
    state: "CA",
    district: 1,
    party: "Democrat",
    caucus: "Democrat",
    group: "dem",
    dim1,
    dim2,
    careerDim1: null,
    careerDim2: null,
    nVotes: 500,
  };
}

describe("ideologicalDistance", () => {
  it("is 2D Euclidean over (dim1, dim2)", () => {
    expect(ideologicalDistance(member("a", 0, 0), member("b", 3, 4))).toBe(5);
  });
});

describe("nearestNeighbors", () => {
  const anchor = member("anchor", 0, 0);
  const pool = [
    anchor,
    member("near", 0.1, 0), // d 0.1
    member("mid", 0.3, 0.4), // d 0.5
    member("up", 0, 0.2), // d 0.2
    member("far", -0.9, 0.9), // d ~1.27
    member("noscore", null, null),
  ];

  it("returns the n closest, sorted, excluding the anchor", () => {
    const got = nearestNeighbors(anchor, pool, 3);
    expect(got.map((n) => n.member.bioguideId)).toEqual(["near", "up", "mid"]);
    expect(got[0].distance).toBeCloseTo(0.1);
  });

  it("skips members without a plottable position", () => {
    expect(
      nearestNeighbors(anchor, pool, 5).some(
        (n) => n.member.bioguideId === "noscore",
      ),
    ).toBe(false);
  });

  it("returns nothing when the anchor itself is unscored", () => {
    expect(nearestNeighbors(member("x", null, null), pool)).toEqual([]);
  });

  it("caps at n", () => {
    expect(nearestNeighbors(anchor, pool, 2)).toHaveLength(2);
  });
});
