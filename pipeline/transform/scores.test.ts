import { describe, expect, it } from "vitest";
import { buildCrosswalk } from "./crosswalk";
import { buildIdeologyScores } from "./scores";
import { memberRow, rawLegislator } from "./fixtures";

const crosswalk = buildCrosswalk([
  rawLegislator({ bioguide: "A000001", icpsr: 1 }),
  rawLegislator({ bioguide: "A000069", icpsr: 69 }),
]);

describe("buildIdeologyScores", () => {
  it("resolves via the crosswalk and drops President rows", () => {
    const { scores } = buildIdeologyScores(
      [
        memberRow({ icpsr: 1, bioguide_id: "", congress: 118 }),
        memberRow({ icpsr: 1, chamber: "President", congress: 118 }),
      ],
      crosswalk,
    );
    expect(scores).toHaveLength(1);
    expect(scores[0]).toMatchObject({
      bioguide_id: "A000001",
      congress_number: 118,
      chamber: "house",
    });
  });

  it("keeps a per-chamber row when a member served both chambers in one Congress", () => {
    const { scores } = buildIdeologyScores(
      [
        memberRow({
          icpsr: 69,
          bioguide_id: "A000069",
          congress: 101,
          chamber: "House",
          nokken_poole_dim1: -0.4,
        }),
        memberRow({
          icpsr: 69,
          bioguide_id: "A000069",
          congress: 101,
          chamber: "Senate",
          nokken_poole_dim1: -0.34,
        }),
      ],
      crosswalk,
    );
    expect(scores).toHaveLength(2);
    expect(scores.map((s) => s.chamber).sort()).toEqual(["house", "senate"]);
    expect(scores.find((s) => s.chamber === "house")?.nokken_poole_dim1).toBe(-0.4);
    expect(scores.find((s) => s.chamber === "senate")?.nokken_poole_dim1).toBe(-0.34);
  });

  it("collects a row that resolves to no bioguide instead of emitting it", () => {
    const { scores, unresolvable } = buildIdeologyScores(
      [memberRow({ icpsr: 99999, bioguide_id: "", bioname: "POE, Washington", congress: 29 })],
      crosswalk,
    );
    expect(scores).toHaveLength(0);
    expect(unresolvable).toEqual([
      { icpsr: 99999, bioname: "POE, Washington", congress: 29 },
    ]);
  });

  it("flags a crosswalk / Voteview bioguide disagreement as a mismatch", () => {
    const { scores, mismatches } = buildIdeologyScores(
      [memberRow({ icpsr: 1, bioguide_id: "Z000999", congress: 118 })],
      crosswalk,
    );
    expect(scores).toHaveLength(0);
    expect(mismatches).toEqual([
      { icpsr: 1, bioname: "TEST, Member", crosswalk: "A000001", voteview: "Z000999" },
    ]);
  });
});
