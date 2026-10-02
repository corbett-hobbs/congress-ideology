import { describe, expect, it } from "vitest";
import { expectedFinalFiscalYear, iceCatalog, latestFinalFiscalYear, type IceCatalog } from "../../lib/enforcement-entities";
import { ADMINISTRATIONS } from "./administrations";
import {
  ANCHORS,
  EnforcementDataError,
  attributeFiscalYear,
  buildEnforcement,
  fiscalYearBounds,
  normalizeText,
  tableValue,
} from "./enforcement";

const days = (fy: number) => attributeFiscalYear(fy, ADMINISTRATIONS);
const share = (fy: number) => Object.fromEntries(days(fy).administration_days.map((d) => [d.term_id, d.days]));

const OBAMA = "2009-01-20";
const BUSH = "2001-01-20";
const TRUMP1 = "2017-01-20";
const BIDEN = "2021-01-20";
const TRUMP2 = "2025-01-20";

describe("fiscalYearBounds", () => {
  it("runs Oct 1 of the prior calendar year to Sep 30", () => {
    expect(fiscalYearBounds(2013)).toEqual({ start: "2012-10-01", end: "2013-09-30" });
  });
});

describe("attributeFiscalYear", () => {
  it("attributes a normal year wholly to the sitting administration", () => {
    expect(days(2013)).toEqual({ administration_term_id: OBAMA, blended: false, administration_days: [{ term_id: OBAMA, days: 365 }] });
    expect(days(2012).administration_days).toEqual([{ term_id: OBAMA, days: 366 }]); // leap year
    expect(days(2005).administration_term_id).toBe(BUSH);
  });

  // Jan 20 belongs to the incoming administration: 111 days (Oct 1–Jan 19) before, 254 after.
  it.each([
    [2009, BUSH, OBAMA],
    [2017, OBAMA, TRUMP1],
    [2021, TRUMP1, BIDEN],
    [2025, BIDEN, TRUMP2],
  ])("FY%i is blended and attributed to the incoming administration", (fy, outgoing, incoming) => {
    const a = days(fy);
    expect(a.blended).toBe(true);
    expect(a.administration_term_id).toBe(incoming);
    expect(share(fy)).toEqual({ [outgoing]: 111, [incoming]: 254 });
  });

  it("treats Trump's two terms as separate tenures", () => {
    expect(days(2020).administration_term_id).toBe(TRUMP1);
    expect(days(2026).administration_term_id).toBe(TRUMP2);
  });

  it("fails loudly outside every tenure", () => {
    expect(() => days(1990)).toThrow(EnforcementDataError);
  });
});

describe("tableValue", () => {
  const t = "FY2003 | FY2004 | FY2005\nTotal | 10 | 20 | 30\nAtlanta | 1 | 2 | 3";
  it("indexes the row by the header column", () => {
    expect(tableValue(t, "Total", 2003)).toBe(10);
    expect(tableValue(t, "Total", 2005)).toBe(30);
    expect(tableValue(t, "Total", 2099)).toBeNull();
  });
});

describe("normalizeText", () => {
  it("collapses whitespace and typographic punctuation", () => {
    expect(normalizeText("ICE’s  “x”\n 1–2")).toBe("ICE's \"x\" 1-2");
  });
});

// A tiny catalog over two sources: an xlsx-style table and a prose document.
const base = (): IceCatalog =>
  iceCatalog.parse({
    retrieved_at: "2026-09-30",
    sources: [
      { id: "tbl", title: "Table", publisher: "ICE", url: "https://example.gov/t.xlsx", file: "t.xlsx", text_file: "t.txt", kind: "xlsx" },
      { id: "doc", title: "Doc", publisher: "ICE", url: "https://example.gov/d.pdf", file: "d.pdf", text_file: "d.txt", kind: "pdf" },
    ],
    years: [
      { fy: 2013, value: 368644, status: "final", source: "tbl", evidence_kind: "text", evidence: "Total | 368644 | 315943", corroboration: [{ source: "doc", evidence: "ICE conducted a total of 368,644 removals." }], note_ids: ["n"] },
      { fy: 2014, value: 315943, status: "final", source: "tbl", evidence_kind: "text", evidence: "Total | 368644 | 315943" },
      { fy: 2023, value: 142580, status: "final", source: "doc", evidence_kind: "text", evidence: "ERO conducted 142,580 removals" },
    ],
    breakdowns: [
      { fy: 2013, source: "doc", interior: 133551, border: 235093, evidence_interior: "133,551 interior", evidence_border: "235,093 border" },
    ],
    notes: [{ id: "n", kind: "caveat", fy_start: 2013, fy_end: null, title: "t", text: "t", source: "doc" }],
  });
const texts = () =>
  new Map([
    ["tbl", "FY2013 | FY2014\nTotal | 368644 | 315943\n"],
    ["doc", "ICE conducted a total of\n368,644 removals. ERO conducted 142,580 removals. 133,551 interior; 235,093 border"],
  ]);
const build = (catalog = base(), t = texts()) =>
  buildEnforcement({ catalog, texts: t, figureFiles: new Set(), administrations: ADMINISTRATIONS });

describe("buildEnforcement", () => {
  it("builds rows, attributes them, and reports the anchors", () => {
    const { series, report } = build();
    expect(series.map((r) => [r.period, r.value, r.scope, r.metric])).toEqual([
      [2013, 368644, "ice", "removals"],
      [2014, 315943, "ice", "removals"],
      [2023, 142580, "ice", "removals"],
    ]);
    expect(series[0].administration_term_id).toBe(OBAMA);
    expect(report.missing_periods).toEqual([2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022]);
    expect(report.anchors.every((a) => a.ok)).toBe(true);
    expect(ANCHORS[2013]).toBe(368644);
  });

  it("does not interpolate: gaps stay gaps", () => {
    expect(build().series.map((r) => r.period)).not.toContain(2016);
  });

  it("fails when quoted evidence is not in the source", () => {
    const t = texts();
    t.set("doc", "something else entirely");
    expect(() => build(base(), t)).toThrow(/FY2013.*not found in doc/);
  });

  it("fails when the table disagrees with the catalog value", () => {
    const c = base();
    c.years[1].value = 315944;
    expect(() => build(c)).toThrow(/FY2014/);
  });

  it("fails when an anchor year differs from ICE's published figure", () => {
    const c = base();
    c.years[2].value = 142581;
    c.years[2].evidence = "ERO conducted 142,580 removals";
    expect(() => build(c)).toThrow(/FY2023/);
  });

  it("fails when interior + border does not equal the total", () => {
    const c = base();
    c.breakdowns[0].border = 235000;
    c.breakdowns[0].evidence_border = "235,093 border";
    expect(() => build(c)).toThrow(/FY2013/);
  });

  it("requires the in-progress fiscal year to be preliminary", () => {
    const c = base();
    c.retrieved_at = "2023-06-01";
    expect(() => build(c)).toThrow(/in progress/);
  });

  it("rejects unknown note ids and duplicate periods", () => {
    const c = base();
    c.years[0].note_ids = ["nope"];
    expect(() => build(c)).toThrow(/unknown note id/);
    const d = base();
    d.years.push({ ...d.years[1] });
    expect(() => build(d)).toThrow(/duplicate/);
  });
});

describe("ICE annual-report freshness", () => {
  it("expects a fiscal year to be final only after the grace period", () => {
    expect(expectedFinalFiscalYear("2026-10-01")).toBe(2025);
    expect(expectedFinalFiscalYear("2026-11-29")).toBe(2025);
    expect(expectedFinalFiscalYear("2026-11-30")).toBe(2026);
    expect(expectedFinalFiscalYear("2027-06-15")).toBe(2026);
  });
  it("ignores preliminary years", () => {
    expect(latestFinalFiscalYear([{ fy: 2024, status: "final" }, { fy: 2025, status: "preliminary" }])).toBe(2024);
    expect(latestFinalFiscalYear([])).toBeNull();
  });
});
