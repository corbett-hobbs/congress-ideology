import { describe, expect, it } from "vitest";
import type { ChamberMember } from "./congress-types";
import { partyColorKey, presentParties } from "./party-palette";

const m = (over: Partial<ChamberMember>): ChamberMember =>
  ({
    bioguideId: "X000001",
    chamber: "house",
    name: "T",
    lastName: "T",
    state: "CA",
    district: 1,
    party: "?",
    caucus: "?",
    group: "other",
    dim1: 0,
    dim2: 0,
    careerDim1: null,
    careerDim2: null,
    nVotes: 100,
    partyCode: null,
    ...over,
  }) as ChamberMember;

describe("partyColorKey", () => {
  it("maps the modern big two by Voteview code", () => {
    expect(partyColorKey(m({ partyCode: 100 }))).toBe("dem");
    expect(partyColorKey(m({ partyCode: 200 }))).toBe("rep");
  });

  it("gives historical parties their own key", () => {
    expect(partyColorKey(m({ partyCode: 1 }))).toBe("federalist");
    expect(partyColorKey(m({ partyCode: 13 }))).toBe("demrep");
    expect(partyColorKey(m({ partyCode: 29 }))).toBe("whig");
    expect(partyColorKey(m({ partyCode: 555 }))).toBe("jackson");
  });

  it("folds 1820s faction codes into the faction they became", () => {
    expect(partyColorKey(m({ partyCode: 8888 }))).toBe("adams"); // Adams-Clay Rep
    expect(partyColorKey(m({ partyCode: 1346 }))).toBe("jackson"); // Jackson Rep
  });

  it("falls back for an uncoloured code, keyed off the group", () => {
    expect(partyColorKey(m({ partyCode: 340, group: "other" }))).toBe("oth"); // Populist
    expect(partyColorKey(m({ partyCode: 999999, group: "dem" }))).toBe("dem");
  });

  it("falls back to the group when there is no Voteview code", () => {
    expect(partyColorKey(m({ partyCode: null, group: "rep" }))).toBe("rep");
    expect(partyColorKey(m({ partyCode: null, group: "other" }))).toBe("oth");
  });
});

describe("presentParties", () => {
  it("returns only present parties, in legend order, with counts", () => {
    const got = presentParties([
      m({ partyCode: 29 }), // whig
      m({ partyCode: 29 }),
      m({ partyCode: 100 }), // dem
      m({ partyCode: 340 }), // -> oth
    ]);
    expect(got).toEqual([
      { key: "dem", count: 1 },
      { key: "whig", count: 2 },
      { key: "oth", count: 1 },
    ]);
  });
});
