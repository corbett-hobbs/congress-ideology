import { describe, expect, it } from "vitest";
import { buildLeadership } from "./leadership";
import type { Legislator } from "../validate/schemas";

const leg = (bioguide: string, roles: { title: string; chamber: "house" | "senate"; start: string; end?: string }[]) =>
  ({ id: { bioguide }, name: { first: "A", last: "B" }, bio: { gender: "M" }, terms: [], leadership_roles: roles }) as unknown as Legislator;

describe("buildLeadership", () => {
  it("keeps only the held (open-ended) Speaker and floor-leader posts", () => {
    const rows = buildLeadership([
      leg("J000299", [{ title: "Speaker of the House", chamber: "house", start: "2023-10-25" }]),
      leg("J000294", [{ title: "House Minority Leader", chamber: "house", start: "2023-01-03" }]),
      leg("T000250", [{ title: "Senate Majority Leader", chamber: "senate", start: "2025-01-03" }]),
      leg("M000355", [{ title: "Senate Majority Leader", chamber: "senate", start: "2021-01-03", end: "2025-01-03" }]),
      leg("S000148", [{ title: "House Majority Whip", chamber: "house", start: "2023-01-03" }]),
    ]);
    expect(rows).toEqual([
      { bioguide_id: "J000294", chamber: "house", role: "minority_leader" },
      { bioguide_id: "J000299", chamber: "house", role: "speaker" },
      { bioguide_id: "T000250", chamber: "senate", role: "majority_leader" },
    ]);
  });
});
