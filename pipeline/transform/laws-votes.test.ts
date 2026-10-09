import { describe, expect, it } from "vitest";
import type { RawAction, RawLaw } from "../../lib/laws-entities";
import type { RollcallTuple } from "../fetch/voteview-rollcalls-lib";
import { bandOf, buildPassage, finalPassage, indexRollcalls, joinRollcall, overrideVotes, resolveVotes, supportBand, textRoll, textTally, voteBody, VoteGateError, yesShare, type ChamberVote } from "./laws-votes";

const a = (date: string, text: string, over: Partial<RawAction> = {}): RawAction => ({ date, type: "Floor", text, src: 9, ...over });
const roll = (chamber: "House" | "Senate", n: number, session = 1) => ({ chamber, roll: n, session, date: null });

describe("the wording of a vote", () => {
  it("strips the feed prefix but keeps a colon inside the sentence", () => {
    expect(voteBody("Passed/agreed to in House: Passed House by Yea-Nay Vote: 396 - 17 (Record Vote No: 293).")).toBe("Passed House by Yea-Nay Vote: 396 - 17 (Record Vote No: 293).");
    expect(voteBody("House Concurred, in Senate Amendments , with Amendments by Yea-Nay Vote: 397 - 1 (Record Vote No: 58).")).toContain("397 - 1");
  });
  it.each([
    ["Passed Senate with an amendment by Yea-Nay Vote. 51 - 50. Record Vote Number: 372.", [51, 50], 372],
    ["Measure passed House, amended, roll call #660 (357-1).", [357, 1], 660],
    ["On passage Passed by the Yeas and Nays: 373 - 40, 2 Present (Roll no. 836).", [373, 40], 836],
    ["On motion that the House agree to the Senate amendment Agreed to by recorded vote: 218 - 214 (Roll no. 190).", [218, 214], 190],
    ["Passed Senate without amendment by Voice Vote.(consideration: CR S14680-14681)", null, null],
    ["Passed Senate by Unanimous Consent. (consideration: CR S2679-2680)", null, null],
  ])("reads %s", (text, tally, rollNo) => {
    const body = voteBody(text);
    expect(textTally(body)).toEqual(tally);
    expect(textRoll(body)).toBe(rollNo);
  });
  it("does not mistake Congressional Record page ranges for a tally", () => {
    expect(textTally(voteBody("Agreed to by voice vote.(consideration: CR H945-946; text: CR H945)"))).toBeNull();
  });
});

describe("finalPassage", () => {
  it("takes each chamber's newest passage and reads the method", () => {
    const v = finalPassage([
      a("1974-12-09", "Passed/agreed to in House: Measure passed House, amended, roll call #660 (357-1).", { votes: [roll("House", 660, 2)] }),
      a("1974-12-10", "Passed/agreed to in Senate: Measure passed Senate."),
      a("1974-11-01", "Passed/agreed to in House: Measure passed House."),
    ]);
    expect(v.get("House")).toMatchObject({ kind: "roll", date: "1974-12-09", roll: 660, session: 2, yea: 357, nay: 1, tally: "text" });
    expect(v.get("Senate")).toMatchObject({ kind: "unstated", yea: null });
  });
  it("lets a voice-vote wording decide over an unrelated roll-call reference", () => {
    const v = finalPassage([a("1988-03-18", "Passed/agreed to in Senate: Passed Senate with amendments by Voice Vote.", { votes: [roll("Senate", 63, 2)] })]);
    expect(v.get("Senate")!.kind).toBe("voice");
  });
  it("does not borrow a reference from a differently worded action the same day", () => {
    const v = finalPassage([
      a("1988-03-18", "Passed/agreed to in Senate: Passed Senate with amendments."),
      a("1988-03-18", "Motion to table the motion to reconsider was agreed to.", { src: null, votes: [roll("Senate", 63, 2)] }),
    ]);
    expect(v.get("Senate")!.kind).toBe("unstated");
  });
  it("counts a concurrence recorded as 'Resolving differences' but not a disagreement", () => {
    const v = finalPassage([
      a("1976-09-16", "Resolving differences -- House actions: House agreed to Senate amendment, roll call #744 (242-138).", { type: "NotUsed", votes: [roll("House", 744, 2)] }),
      a("1976-09-17", "Resolving differences -- Senate actions: Senate disagreed to House amendments."),
      a("1976-06-10", "Passed/agreed to in Senate: Measure passed Senate, amended, roll call #276 (65-19).", { votes: [roll("Senate", 276, 2)] }),
    ]);
    expect(v.get("House")).toMatchObject({ kind: "roll", yea: 242, nay: 138 });
    expect(v.get("Senate")).toMatchObject({ yea: 65, nay: 19 });
  });
  it("reads a concurrence that only the chamber's own feed records", () => {
    const v = finalPassage([
      a("1988-10-04", "House Agreed to Senate Amendments by Unanimous Consent.", { src: 2, type: "ResolvingDifferences" }),
      a("1988-09-13", "Passed/agreed to in House: Passed House (Amended) by Voice Vote."),
      a("1988-09-30", "Senate concurred in the House amendment with an amendment by Voice Vote.", { src: null, type: "ResolvingDifferences" }),
    ]);
    expect(v.get("House")).toMatchObject({ kind: "consent", date: "1988-10-04" });
    expect(v.get("Senate")).toMatchObject({ kind: "voice", date: "1988-09-30" });
  });
  it("prefers the roll-call line when a chamber has two on the same day", () => {
    const v = finalPassage([
      a("1980-12-15", "Passed/agreed to in Senate: Measure passed Senate, amended."),
      a("1980-12-15", "Resolving differences -- Senate actions: Senate agreed to House amendment, roll call #546 (34-20).", { type: "NotUsed", votes: [roll("Senate", 546, 2)] }),
    ]);
    expect(v.get("Senate")).toMatchObject({ yea: 34, nay: 20 });
  });
});

describe("overrideVotes", () => {
  it("reads the two override tallies", () => {
    const o = overrideVotes([
      a("1973-11-07", "Passed House over veto: Motion to override veto passed House, roll call #542 (284-135).", { type: "Veto" }),
      a("1973-11-07", "Passed Senate over veto: Motion to override veto passed Senate, roll call #465 (75-18).", { type: "Veto" }),
    ]);
    expect(o.get("House")).toMatchObject({ yea: 284, nay: 135 });
    expect(o.get("Senate")).toMatchObject({ yea: 75, nay: 18 });
  });
});

describe("support band", () => {
  it.each([[0.5, 1], [0.5999, 1], [0.6, 2], [0.7499, 2], [0.75, 3], [0.8999, 3], [0.9, 4], [1, 4]])("%d -> band %d", (share, band) => expect(bandOf(share)).toBe(band));
  const v = (kind: ChamberVote["kind"], yea: number | null, nay: number | null): ChamberVote => ({ kind, date: "2000-01-01", roll: null, session: null, yea, nay, tally: yea === null ? null : "text", text: "" });
  it("uses the closest recorded vote in either chamber", () => {
    expect(supportBand([v("roll", 219, 212), v("roll", 60, 39)])).toMatchObject({ band: 1 });
    expect(supportBand([v("roll", 400, 20), v("voice", null, null)])).toMatchObject({ band: 4 });
  });
  it("is band 0 when neither chamber recorded a vote", () => {
    expect(supportBand([v("voice", null, null), v("unstated", null, null)])).toEqual({ band: 0, share: null });
    expect(supportBand([])).toEqual({ band: 0, share: null });
  });
  it("counts yes over votes cast, ignoring a vote nobody cast", () => {
    expect(yesShare(60, 40)).toBe(0.6);
    expect(yesShare(0, 0)).toBeNull();
  });
});

describe("Voteview join and the tally gate", () => {
  const rows: RollcallTuple[] = [
    [104, "H", 1089, "1996-06-10", 2, 223, 345, 4, "HR3400"],
    [93, "H", 700, "1974-12-09", null, null, 356, 1, "S4040"],
    [93, "H", 702, "1974-12-09", null, null, 100, 200, "HR1"],
  ];
  const idx = indexRollcalls(rows, { H: "2026-09-16", S: "2026-09-30" });
  const vote = (over: Partial<ChamberVote>): ChamberVote => ({ kind: "roll", date: "1996-06-10", roll: 223, session: 2, yea: 339, nay: 4, tally: "text", text: "", ...over });
  const law = (id: string, congress: number, bill: string) => ({ law_id: id, congress, bill });

  it("joins by the clerk's session and roll number", () => {
    expect(joinRollcall(104, "House", vote({}), "HR3400", idx)?.how).toBe("clerk");
  });
  it("falls back to date, bill and tally when Voteview has no clerk number", () => {
    const j = joinRollcall(93, "House", vote({ date: "1974-12-09", roll: 660, session: 2, yea: 357, nay: 1 }), "S4040", idx);
    expect(j?.how).toBe("date+bill");
    expect(j?.row[2]).toBe(700);
  });
  it("stops on a disagreement the clerk number proves, until a person records the right tally", () => {
    const votes = new Map([["House" as const, vote({})]]);
    expect(() => resolveVotes(law("104-pub-229", 104, "HR3400"), votes, idx, [])).toThrow(VoteGateError);
    const r = resolveVotes(law("104-pub-229", 104, "HR3400"), votes, idx, [{ law_id: "104-pub-229", chamber: "House", use: "text", reason: "official roll call says 339-4" }]);
    expect(r.get("House")).toMatchObject({ check: "exception" });
    expect(r.get("House")!.vote).toMatchObject({ yea: 339, nay: 4 });
  });
  it("reports, not fails, a disagreement found only by date and bill", () => {
    const votes = new Map([["House" as const, vote({ date: "1974-12-09", roll: 660, session: 2, yea: 300, nay: 1 })]]);
    expect(resolveVotes(law("93-pub-1", 93, "S4040"), votes, idx, []).get("House")!.check).toBe("unverified");
  });
  it("accepts a one-vote difference that leaves the band alone", () => {
    const votes = new Map([["House" as const, vote({ date: "1974-12-09", roll: 660, session: 2, yea: 357, nay: 1 })]]);
    expect(resolveVotes(law("93-pub-527", 93, "S4040"), votes, idx, []).get("House")!.check).toBe("minor");
  });
  it("rejects a tally larger than the chamber can cast", () => {
    const votes = new Map([["House" as const, vote({ date: "1978-10-12", yea: 266, nay: 176, roll: 5, session: null })]]);
    expect(() => resolveVotes(law("95-pub-511", 95, "HR1"), votes, idx, [])).toThrow("more votes than");
  });
  it("takes Voteview's tally when the text has a roll but no count, and fails if it cannot", () => {
    const noCount = new Map([["House" as const, vote({ yea: null, nay: null, tally: null })]]);
    const r = resolveVotes(law("104-pub-229", 104, "HR3400"), noCount, idx, []);
    expect(r.get("House")!.vote).toMatchObject({ yea: 345, nay: 4, tally: "voteview" });
    expect(() => resolveVotes(law("104-pub-1", 104, "HR9"), new Map([["House" as const, vote({ yea: null, nay: null, tally: null, roll: 1 })]]), idx, [])).toThrow("no tally");
  });
  it("does not check a vote newer than Voteview's last roll call", () => {
    const old = indexRollcalls(rows, { H: "1990-01-01", S: "1990-01-01" });
    expect(resolveVotes(law("104-pub-229", 104, "HR3400"), new Map([["House" as const, vote({})]]), old, []).get("House")!.check).toBe("unchecked");
  });
});

describe("buildPassage", () => {
  const raw = (actions: RawAction[]): RawLaw => ({ law_id: "93-pub-1", congress: 93, number: 1, bill_type: "s", bill_number: "4040", origin_chamber: "Senate", title: "", introduced: null, sponsor: null, sponsor_name: null, cosponsors: [], policy_area: null, summary_html: null, summary_stage: null, became_law: [], latest_action_date: null, updated: null, actions, committees: [] });
  const idx = indexRollcalls([], { H: "2026-09-16", S: "2026-09-30" });
  it("builds the tuples, the band and the override votes", () => {
    const p = buildPassage(
      raw([
        a("1974-12-09", "Passed/agreed to in House: Measure passed House, roll call #660 (357-1).", { votes: [roll("House", 660, 2)] }),
        a("1974-12-10", "Passed/agreed to in Senate: Passed Senate by Voice Vote."),
        a("1974-12-20", "Passed House over veto: Motion to override veto passed House, roll call #700 (371-31).", { type: "Veto" }),
      ]),
      idx,
      [],
    );
    expect(p.house).toEqual([0, 357, 1, 660]);
    expect(p.senate).toEqual([1, null, null, null]);
    expect(p.band).toBe(4);
    expect(p.override_votes).toEqual([371, 31, null, null]);
  });
});
