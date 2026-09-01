import type {
  Legislator as RawLegislator,
  LegislatorTerm,
  VoteviewMemberRow,
} from "../validate/schemas";

/** Build a raw legislator for tests. */
export function rawLegislator(
  over: Partial<{
    bioguide: string;
    icpsr: number | number[];
    first: string;
    last: string;
    middle: string;
    nickname: string;
    suffix: string;
    official_full: string;
    birthday: string;
    gender: "M" | "F";
    terms: Partial<LegislatorTerm>[];
  }> = {},
): RawLegislator {
  const id: RawLegislator["id"] = { bioguide: over.bioguide ?? "T000001" };
  if (over.icpsr !== undefined) id.icpsr = over.icpsr;
  return {
    id,
    name: {
      first: over.first ?? "Test",
      last: over.last ?? "Member",
      ...(over.middle ? { middle: over.middle } : {}),
      ...(over.nickname ? { nickname: over.nickname } : {}),
      ...(over.suffix ? { suffix: over.suffix } : {}),
      ...(over.official_full ? { official_full: over.official_full } : {}),
    },
    bio: {
      ...(over.birthday ? { birthday: over.birthday } : {}),
      gender: over.gender ?? "M",
    },
    terms: (over.terms ?? [{}]).map(rawTerm),
  } as RawLegislator;
}

export function rawTerm(over: Partial<LegislatorTerm> = {}): LegislatorTerm {
  return {
    type: "rep",
    start: "2013-01-03",
    end: "2015-01-03",
    state: "CA",
    ...over,
  } as LegislatorTerm;
}

/** Build a Voteview member row for tests (only the fields the transform uses). */
export function memberRow(
  over: Partial<VoteviewMemberRow> = {},
): VoteviewMemberRow {
  return {
    congress: 119,
    chamber: "House",
    icpsr: 1,
    district_code: 1,
    state_abbrev: "CA",
    party_code: 100,
    bioname: "TEST, Member",
    bioguide_id: "T000001",
    born: null,
    died: null,
    nominate_dim1: 0.1,
    nominate_dim2: 0.2,
    nokken_poole_dim1: 0.11,
    nokken_poole_dim2: 0.21,
    nominate_number_of_votes: 100,
    ...over,
  } as VoteviewMemberRow;
}
