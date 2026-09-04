import { describe, expect, it } from "vitest";
import type { RawCommittee, RawCommitteeMember } from "../validate/schemas";
import { buildCommittees, shortCommitteeName } from "./committees";

function committee(over: Partial<RawCommittee> & { thomas_id: string }): RawCommittee {
  return {
    type: "house",
    name: `House Committee on ${over.thomas_id}`,
    ...over,
  };
}

function member(over: Partial<RawCommitteeMember> & { bioguide: string }): RawCommitteeMember {
  return {
    name: "Test Member",
    party: "majority",
    rank: 1,
    ...over,
  };
}

describe("shortCommitteeName", () => {
  it("strips House/Senate 'Committee on (the)' boilerplate", () => {
    expect(shortCommitteeName("House Committee on the Judiciary", "house")).toBe(
      "Judiciary",
    );
    expect(shortCommitteeName("House Committee on Ways and Means", "house")).toBe(
      "Ways and Means",
    );
    expect(shortCommitteeName("Senate Committee on Finance", "senate")).toBe(
      "Finance",
    );
  });

  it("handles select / special / permanent-select committees and caucuses", () => {
    expect(
      shortCommitteeName("House Permanent Select Committee on Intelligence", "house"),
    ).toBe("Intelligence");
    expect(shortCommitteeName("Senate Special Committee on Aging", "senate")).toBe(
      "Aging",
    );
    expect(
      shortCommitteeName(
        "United States Senate Caucus on International Narcotics Control",
        "senate",
      ),
    ).toBe("International Narcotics Control");
  });

  it("keeps the leading 'Joint' for joint committees", () => {
    expect(shortCommitteeName("Joint Economic Committee", "joint")).toBe(
      "Joint Economic",
    );
    expect(shortCommitteeName("Joint Committee on Taxation", "joint")).toBe(
      "Joint Taxation",
    );
    expect(
      shortCommitteeName("Joint Committee of Congress on the Library", "joint"),
    ).toBe("Joint Library");
  });
});

describe("buildCommittees", () => {
  it("emits one row per top-level committee, sorted by id, with derived short_name", () => {
    const { committees } = buildCommittees(
      [
        committee({ thomas_id: "HSJU", name: "House Committee on the Judiciary" }),
        committee({ thomas_id: "HSAG", name: "House Committee on Agriculture" }),
        committee({ thomas_id: "JSEC", name: "Joint Economic Committee", type: "joint" }),
      ],
      {},
    );
    expect(committees.map((c) => c.committee_id)).toEqual(["HSAG", "HSJU", "JSEC"]);
    expect(committees[2]).toEqual({
      committee_id: "JSEC",
      name: "Joint Economic Committee",
      short_name: "Joint Economic",
      chamber: "joint",
    });
  });

  it("inverts the roster to member-keyed rows and normalises roles", () => {
    const { memberships } = buildCommittees(
      [committee({ thomas_id: "HSJU", name: "House Committee on the Judiciary" })],
      {
        HSJU: [
          member({ bioguide: "J000289", party: "majority", rank: 1, title: "Chair" }),
          member({ bioguide: "R000606", party: "minority", rank: 1, title: "Ranking Member" }),
          member({ bioguide: "I000056", party: "majority", rank: 2, title: "Vice Chairman" }),
          member({ bioguide: "N000002", party: "minority", rank: 2 }),
        ],
      },
    );
    expect(memberships).toEqual([
      { bioguide_id: "I000056", committee_id: "HSJU", party: "majority", role: "member", rank: 2 },
      { bioguide_id: "J000289", committee_id: "HSJU", party: "majority", role: "chair", rank: 1 },
      { bioguide_id: "N000002", committee_id: "HSJU", party: "minority", role: "member", rank: 2 },
      { bioguide_id: "R000606", committee_id: "HSJU", party: "minority", role: "ranking_member", rank: 1 },
    ]);
  });

  it("skips subcommittee rosters (keys not in committees-current.yaml)", () => {
    const { memberships } = buildCommittees(
      [committee({ thomas_id: "HSAG", name: "House Committee on Agriculture" })],
      {
        HSAG: [member({ bioguide: "A000001" })],
        HSAG03: [member({ bioguide: "B000002" })],
      },
    );
    expect(memberships.map((m) => m.bioguide_id)).toEqual(["A000001"]);
  });

  it("collapses a member listed twice on one committee, keeping the senior role", () => {
    const { memberships, duplicateSeats } = buildCommittees(
      [committee({ thomas_id: "HSRU", name: "House Committee on Rules" })],
      {
        HSRU: [
          member({ bioguide: "X000001", party: "majority", rank: 9, title: "Ex Officio" }),
          member({ bioguide: "X000001", party: "majority", rank: 1, title: "Chair" }),
        ],
      },
    );
    expect(memberships).toEqual([
      { bioguide_id: "X000001", committee_id: "HSRU", party: "majority", role: "chair", rank: 1 },
    ]);
    expect(duplicateSeats).toEqual(["X000001|HSRU"]);
  });

  it("reports committees that have no roster block", () => {
    const { committeesWithoutRoster } = buildCommittees(
      [committee({ thomas_id: "HSAG" }), committee({ thomas_id: "HSJU" })],
      { HSAG: [member({ bioguide: "A000001" })] },
    );
    expect(committeesWithoutRoster).toEqual(["HSJU"]);
  });
});
