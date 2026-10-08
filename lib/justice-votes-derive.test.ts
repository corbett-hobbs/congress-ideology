import { describe, expect, it } from "vitest";
import type { JusticeVote } from "./decisions-entities";
import type { DecisionCase } from "./decisions-types";
import { joinVotes, matchesVote, pct, voteStats } from "./justice-votes-derive";

const kase = (id: string, band: number): DecisionCase => [2000, "2000-01-01", id, "1 U.S. 1", 0, band, 5, 4, "", "", "", "", 0, 0, id];
const cases = [kase("c3", 4), kase("c2", 0), kase("c1", 4), kase("c0", 1)];
const votes: JusticeVote[] = [
  ["c1", 1, 0],
  ["c2", 2, 3],
  ["c3", 2, 0],
  ["c9", 1, 0],
  ["c0", 0, 0],
];

describe("justice votes", () => {
  it("joins in case-list order and drops rows whose case is not listed", () => {
    expect(joinVotes(votes, cases).map((v) => v.c[2])).toEqual(["c3", "c2", "c1", "c0"]);
  });
  it("counts a side only where one was taken, and the close cases separately", () => {
    expect(voteStats(joinVotes(votes, cases))).toEqual({ took: 3, majority: 1, dissent: 2, close: 2, closeMajority: 1 });
  });
  it("filters by side and by writing an opinion", () => {
    const rows = joinVotes(votes, cases);
    expect(rows.filter((r) => matchesVote(r, "dissent")).length).toBe(2);
    expect(rows.filter((r) => matchesVote(r, "majority")).length).toBe(1);
    expect(rows.filter((r) => matchesVote(r, "wrote")).map((r) => r.c[2])).toEqual(["c2"]);
  });
  it("rounds percentages and tolerates nothing to divide", () => {
    expect(pct(2, 3)).toBe(67);
    expect(pct(0, 0)).toBeNull();
  });
});
