import { describe, expect, it } from "vitest";
import { parse } from "csv-parse/sync";
import { legislator, voteviewMemberRow } from "./schemas";

const MEMBER_HEADER =
  "congress,chamber,icpsr,state_icpsr,district_code,state_abbrev,party_code,occupancy,last_means,bioname,bioguide_id,born,died,nominate_dim1,nominate_dim2,nominate_log_likelihood,nominate_geo_mean_probability,nominate_number_of_votes,nominate_number_of_errors,conditional,nokken_poole_dim1,nokken_poole_dim2";

function parseMemberRow(line: string) {
  const [row] = parse(`${MEMBER_HEADER}\n${line}`, {
    columns: true,
    skip_empty_lines: true,
  }) as Record<string, string>[];
  return voteviewMemberRow.safeParse(row);
}

describe("voteviewMemberRow", () => {
  it("parses a normal House row, empties -> null", () => {
    const r = parseMemberRow(
      '119,House,20301,41,3,AL,200,,,"ROGERS, Mike Dennis",R000575,1958.0,,0.379,0.377,-13.6,0.97,536,5,,0.398,0.394',
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.congress).toBe(119);
      expect(r.data.icpsr).toBe(20301);
      expect(r.data.born).toBe(1958);
      expect(r.data.died).toBeNull();
      expect(r.data.nominate_dim1).toBe(0.379);
    }
  });

  it("rejects a DW-NOMINATE coordinate outside [-1, 1]", () => {
    const r = parseMemberRow(
      '119,House,1,1,1,AL,200,,,"X, Y",A000001,,,1.7,0.1,,,,,,,',
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toMatch(/outside \[-1, 1\]/);
      expect(r.error.issues[0].path).toEqual(["nominate_dim1"]);
    }
  });

  it("rejects a non-numeric coordinate", () => {
    const r = parseMemberRow(
      '119,House,1,1,1,AL,200,,,"X, Y",A000001,,,banana,0.1,,,,,,,',
    );
    expect(r.success).toBe(false);
  });
});

describe("legislator", () => {
  const base = {
    id: { bioguide: "S000033", icpsr: 29147 },
    name: { first: "Bernard", last: "Sanders" },
    bio: { gender: "M" },
    terms: [{ type: "sen", start: "2019-01-03", end: "2025-01-03", state: "VT" }],
  };

  it("accepts a minimal valid legislator", () => {
    expect(legislator.safeParse(base).success).toBe(true);
  });

  it("requires a well-formed bioguide id", () => {
    const r = legislator.safeParse({ ...base, id: { bioguide: "nope" } });
    expect(r.success).toBe(false);
  });

  it("keeps caucus alongside party on a term", () => {
    const r = legislator.safeParse({
      ...base,
      terms: [
        {
          type: "sen",
          start: "2019-01-03",
          end: "2025-01-03",
          state: "VT",
          party: "Independent",
          caucus: "Democrat",
        },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.terms[0].party).toBe("Independent");
      expect(r.data.terms[0].caucus).toBe("Democrat");
    }
  });
});
