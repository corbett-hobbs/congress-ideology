import { describe, expect, it } from "vitest";
import { buildTerms } from "./terms";
import { rawLegislator } from "./fixtures";

const CAP = 119;

describe("buildTerms", () => {
  it("expands a Senate term into one row per Congress", () => {
    const { terms } = buildTerms(
      [
        rawLegislator({
          bioguide: "S000033",
          terms: [
            {
              type: "sen",
              start: "2013-01-03",
              end: "2019-01-03",
              state: "VT",
              party: "Independent",
              caucus: "Democrat",
            },
          ],
        }),
      ],
      CAP,
    );
    expect(terms.map((t) => t.congress_number)).toEqual([113, 114, 115]);
    expect(terms.every((t) => t.chamber === "senate")).toBe(true);
    expect(terms.every((t) => t.district === null)).toBe(true);
  });

  it("keeps party and caucus separate for an independent who caucuses", () => {
    const { terms } = buildTerms(
      [
        rawLegislator({
          bioguide: "K000383",
          terms: [
            {
              type: "sen",
              start: "2013-01-03",
              end: "2015-01-03",
              state: "ME",
              party: "Independent",
              caucus: "Democrat",
            },
          ],
        }),
      ],
      CAP,
    );
    expect(terms).toHaveLength(1);
    expect(terms[0].party).toBe("Independent");
    expect(terms[0].caucus).toBe("Democrat");
  });

  it("defaults caucus to party when the source does not distinguish", () => {
    const { terms } = buildTerms(
      [rawLegislator({ terms: [{ party: "Republican" }] })],
      CAP,
    );
    expect(terms[0].caucus).toBe("Republican");
  });

  it("maps at-large / delegate districts (-1 and 0) to null", () => {
    const { terms } = buildTerms(
      [
        rawLegislator({
          bioguide: "A000001",
          terms: [{ type: "rep", state: "AK", district: -1 }],
        }),
        rawLegislator({
          bioguide: "B000002",
          terms: [{ type: "rep", state: "DC", district: 0 }],
        }),
        rawLegislator({
          bioguide: "C000003",
          terms: [{ type: "rep", state: "MT", district: 1 }],
        }),
      ],
      CAP,
    );
    expect(terms.find((t) => t.bioguide_id === "A000001")?.district).toBeNull();
    expect(terms.find((t) => t.bioguide_id === "B000002")?.district).toBeNull();
    expect(terms.find((t) => t.bioguide_id === "C000003")?.district).toBe(1);
  });

  describe("mid-Congress party switch (party_affiliations)", () => {
    const vanDrew = rawLegislator({
      bioguide: "V000133",
      terms: [
        {
          type: "rep",
          start: "2019-01-03",
          end: "2021-01-03",
          state: "NJ",
          district: 2,
          party: "Republican", // congress-legislators records the *ending* party
          party_affiliations: [
            { start: "2019-01-03", end: "2019-12-18", party: "Democrat" },
            { start: "2019-12-19", end: "2021-01-03", party: "Republican" },
          ],
        },
      ],
    });

    it("uses the start-of-Congress party at top level and carries the array", () => {
      const { terms } = buildTerms([vanDrew], CAP);
      expect(terms).toHaveLength(1);
      expect(terms[0].party).toBe("Democrat");
      expect(terms[0].caucus).toBe("Democrat");
      expect(terms[0].party_affiliations).toEqual([
        { start: "2019-01-03", end: "2019-12-18", party: "Democrat" },
        { start: "2019-12-19", end: "2021-01-03", party: "Republican" },
      ]);
    });

    it("attributes a mid-6-year-term Senate switch to the one Congress it happened in", () => {
      const thurmond = rawLegislator({
        bioguide: "T000254",
        terms: [
          {
            type: "sen",
            start: "1961-01-03",
            end: "1967-01-03",
            state: "SC",
            party: "Republican",
            party_affiliations: [
              { start: "1961-01-03", end: "1964-09-16", party: "Democrat" },
              { start: "1964-09-16", end: "1967-01-03", party: "Republican" },
            ],
          },
        ],
      });
      const { terms } = buildTerms([thurmond], CAP);
      const byCongress = Object.fromEntries(
        terms.map((t) => [t.congress_number, t]),
      );
      expect(byCongress[87].party).toBe("Democrat");
      expect(byCongress[87].party_affiliations).toBeUndefined();
      expect(byCongress[88].party).toBe("Democrat");
      expect(byCongress[88].party_affiliations).toHaveLength(2);
      expect(byCongress[89].party).toBe("Republican");
      expect(byCongress[89].party_affiliations).toBeUndefined();
    });
  });

  it("merges two term records that land on the same (congress, chamber)", () => {
    const { terms, collisions } = buildTerms(
      [
        rawLegislator({
          bioguide: "R000001",
          terms: [
            { type: "rep", start: "2013-01-03", end: "2013-06-01", state: "NY", district: 5, party: "Democrat" },
            { type: "rep", start: "2013-09-01", end: "2015-01-03", state: "NY", district: 5, party: "Democrat" },
          ],
        }),
      ],
      CAP,
    );
    expect(terms).toHaveLength(1);
    expect(terms[0].congress_number).toBe(113);
    expect(collisions).toHaveLength(1);
  });
});
