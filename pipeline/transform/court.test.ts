import { describe, expect, it } from "vitest";
import type { Justice } from "../../lib/court-entities";
import type { CourtValidationInput, FjcJustice, MqJusticeRow } from "./court";
import {
  CourtDataError,
  buildIdentityMap,
  buildJustices,
  buildMqScores,
  mqSpans,
  parseMqCourt,
  parseMqJustices,
  parseTermLabel,
  resolveCrosswalk,
  validateCourtData,
} from "./court";

const mq = (over: Partial<MqJusticeRow> & { scdb_id: number; scdb_name: string; term: number }): MqJusticeRow => ({
  post_mn: 0,
  post_sd: 0.3,
  post_med: 0,
  post_025: -0.5,
  post_975: 0.5,
  ...over,
});

const fjc = (over: Partial<FjcJustice> & { nid: number; last: string; start: string }): FjcJustice => ({
  first: "A",
  middle: null,
  suffix: null,
  birth_year: 1900,
  death_year: null,
  end: null,
  appointments: [
    { title: "Associate Justice", president: "P", party: "Republican", nomination: null, confirmation: null, start: over.start, end: over.end ?? null },
  ],
  ...over,
});

describe("parseTermLabel", () => {
  it("keeps turnover segments distinct", () => {
    expect(parseTermLabel("1937a")).toEqual({ term: 1937, segment: "a" });
    expect(parseTermLabel("1958")).toEqual({ term: 1958, segment: null });
    expect(() => parseTermLabel("1937c")).toThrow(CourtDataError);
  });
});

describe("parseMqJustices", () => {
  it("fails on a non-finite score", () => {
    const row = { term: "2000", justice: "1", justiceName: "XY", post_mn: "", post_sd: "1", post_med: "0", post_025: "0", post_975: "1" };
    expect(() => parseMqJustices([row])).toThrow(/post_mn/);
  });
});

describe("identity", () => {
  it("accepts one person across roles/terms under one id", () => {
    const rows = [mq({ scdb_id: 102, scdb_name: "WHRehnquist", term: 1971 }), mq({ scdb_id: 102, scdb_name: "WHRehnquist", term: 1990 })];
    expect(buildIdentityMap(rows).get("WHRehnquist")).toBe(102);
  });
  it("rejects one person under two ids, and two people under one id", () => {
    expect(() =>
      buildIdentityMap([mq({ scdb_id: 1, scdb_name: "HFStone", term: 1937 }), mq({ scdb_id: 2, scdb_name: "HFStone", term: 1941 })]),
    ).toThrow(/two SCDB ids/);
    expect(() =>
      buildIdentityMap([mq({ scdb_id: 1, scdb_name: "AB", term: 1937 }), mq({ scdb_id: 1, scdb_name: "CD", term: 1938 })]),
    ).toThrow(/two names/);
  });
  it("rejects duplicate (justice, term)", () => {
    expect(() => buildMqScores([mq({ scdb_id: 1, scdb_name: "AB", term: 1937 }), mq({ scdb_id: 1, scdb_name: "AB", term: 1937 })])).toThrow(/duplicate/);
  });
});

describe("parseMqCourt turnover handling", () => {
  const ids = new Map([["AA", 1], ["BB", 2]]);
  const base = { med: "0.1", med_sd: "0.2", min: "-1", max: "1", justice: "AA", just_pr: "0.6" };
  it("preserves both records of a split term instead of deduping", () => {
    const { courtTerms, probabilities } = parseMqCourt(
      [
        { term: "1937a", ...base, AA: "0.6", BB: "0.4" },
        { term: "1937b", ...base, AA: "0.5", BB: "0.5" },
      ],
      ids,
    );
    expect(courtTerms.map((c) => [c.term, c.segment])).toEqual([[1937, "a"], [1937, "b"]]);
    expect(probabilities).toHaveLength(4);
  });
  it("rejects a repeated key, an unknown median justice, and probabilities not summing to 1", () => {
    const r = { term: "1958", ...base, AA: "0.6", BB: "0.4" };
    expect(() => parseMqCourt([r, r], ids)).toThrow(/duplicate court record/);
    expect(() => parseMqCourt([{ ...r, justice: "ZZ" }], ids)).toThrow(/median justice/);
    expect(() => parseMqCourt([{ ...r, BB: "0.1" }], ids)).toThrow(/sum/);
  });
});

describe("resolveCrosswalk failure modes", () => {
  const rows = [mq({ scdb_id: 84, scdb_name: "RHJackson", term: 1941 }), mq({ scdb_id: 84, scdb_name: "RHJackson", term: 1953 })];
  const spans = mqSpans(rows);
  const robert = fjc({ nid: 10, last: "Jackson", start: "1941-07-11", end: "1954-10-09" });
  const howell = fjc({ nid: 11, last: "Jackson", start: "1893-02-18", end: "1895-08-08" });
  const ketanji = fjc({ nid: 12, last: "Jackson", start: "2022-04-08" });
  const entry = { justice_id: 84, scdb_name: "RHJackson", last_name: "Jackson", fjc_nid: 10 };

  it("disambiguates a shared last name by service window", () => {
    expect(resolveCrosswalk([entry], spans, [robert, howell, ketanji]).get(84)?.nid).toBe(10);
  });
  it("fails on a missing entry", () => {
    expect(() => resolveCrosswalk([], spans, [robert])).toThrow(/no entry for MQ justice 84/);
  });
  it("fails when the window still leaves two candidates", () => {
    const twin = fjc({ nid: 13, last: "Jackson", start: "1950-01-01", end: "1960-01-01" });
    expect(() => resolveCrosswalk([entry], spans, [robert, twin])).toThrow(/ambiguous/);
  });
  it("fails when nobody matches", () => {
    expect(() => resolveCrosswalk([entry], spans, [howell])).toThrow(/matches no FJC/);
  });
  it("fails when the committed nid disagrees with the rule", () => {
    expect(() => resolveCrosswalk([{ ...entry, fjc_nid: 11 }], spans, [robert, howell])).toThrow(/resolves to nid 10/);
  });
});

describe("buildJustices", () => {
  it("uses the appointment in effect at the first scored term (Stone -> Coolidge, not FDR)", () => {
    const stone = fjc({
      nid: 1,
      last: "Stone",
      start: "1925-02-05",
      end: "1946-04-22",
      appointments: [
        { title: "Associate Justice", president: "Calvin Coolidge", party: "Republican", nomination: "1925-01-05", confirmation: "1925-02-05", start: "1925-02-05", end: "1941-07-03" },
        { title: "Chief Justice", president: "Franklin D. Roosevelt", party: "Democratic", nomination: "1941-06-12", confirmation: "1941-06-27", start: "1941-07-03", end: "1946-04-22" },
      ],
    });
    const span = { justice_id: 74, scdb_name: "HFStone", first_term: 1937, last_term: 1945 };
    const [j] = buildJustices([span], new Map([[74, stone]]));
    expect(j.appointing_president).toBe("Calvin Coolidge");
    expect(j.service_end).toBe("1946-04-22");
  });
});

// --- whole-dataset validation ---------------------------------------------

function dataset(): CourtValidationInput {
  const names = [[108, "Thomas"], [113, "Sotomayor"], [105, "Scalia"], [109, "Ginsburg"]] as const;
  const justices: Justice[] = names.map(([id, last]) => ({
    justice_id: id, name: { first: "X", last, full: `X ${last}` }, birth_year: 1950, death_year: null,
    appointing_president: "P", appointing_party: "Republican" as const, nomination_date: null, confirmation_date: null,
    service_start: "1990-01-01", service_end: null,
  }));
  const scores = [];
  const courtTerms = [];
  // 9 filler justices per term would be needed; use ids 200-208 for filler.
  for (let t = 1937; t <= 1940; t++) {
    const set = [108, 113, 105, 109, 200, 201, 202, 203, 204];
    for (const id of set) {
      const s = id === 108 ? 3 : id === 105 ? 2 : id === 113 ? -3 : id === 109 ? -2 : 0;
      scores.push({ justice_id: id, term: t, mq_score: s, mq_sd: 0.3, mq_median: s, mq_lo95: s - 1, mq_hi95: s + 1 });
    }
    courtTerms.push({ term: t, segment: null, median_score: 0, median_sd: 0.2, min_score: -3, max_score: 3, median_justice_id: 200, median_justice_probability: 0.5 });
  }
  for (let id = 200; id <= 204; id++) {
    justices.push({ justice_id: id, name: { first: "F", last: `F${id}`, full: `F F${id}` }, birth_year: 1900, death_year: null, appointing_president: "P", appointing_party: "Democratic" as const, nomination_date: null, confirmation_date: null, service_start: "1930-01-01", service_end: null });
  }
  return { justices, scores, courtTerms, probabilities: [] };
}

describe("validateCourtData", () => {
  it("passes a consistent dataset", () => {
    expect(validateCourtData(dataset(), {}).lastTerm).toBe(1940);
  });
  it("accepts a documented turnover count and rejects one that drifts", () => {
    const d = dataset();
    d.scores.push({ ...d.scores[0], justice_id: 205, term: 1938 });
    d.justices.push({ ...d.justices[4], justice_id: 205 });
    const explained = { 1938: { count: 10, reason: "test" } };
    expect(validateCourtData(d, explained).explainedExceptions).toHaveLength(1);
    expect(() => validateCourtData(d, { 1938: { count: 11, reason: "test" } })).toThrow(/documented turnover count is 11/);
  });
  it("fails on a term gap", () => {
    const d = dataset();
    d.scores = d.scores.filter((s) => s.term !== 1939);
    expect(() => validateCourtData(d, {})).toThrow(/term 1939 is missing/);
  });
  it("fails on an unexplained justice count", () => {
    const d = dataset();
    d.scores = d.scores.filter((s) => !(s.term === 1938 && s.justice_id === 204));
    expect(() => validateCourtData(d, {})).toThrow(/term 1938: 8 justices/);
  });
  it("fails when a justice has no scores or a score references an unknown justice", () => {
    const d = dataset();
    d.scores = d.scores.filter((s) => s.justice_id !== 204);
    expect(() => validateCourtData(d, {})).toThrow();
    const e = dataset();
    e.scores.push({ ...e.scores[0], justice_id: 999, term: 1937 });
    expect(() => validateCourtData(e, {})).toThrow(/not in justices.json/);
  });
  it("trips the sign-convention tripwire when scores are flipped", () => {
    const d = dataset();
    d.scores = d.scores.map((s) => ({ ...s, mq_score: -s.mq_score, mq_lo95: -s.mq_score - 1, mq_hi95: -s.mq_score + 1 }));
    expect(() => validateCourtData(d, {})).toThrow(/SIGN CONVENTION FLIPPED/);
  });
});
