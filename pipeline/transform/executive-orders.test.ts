import { describe, expect, it } from "vitest";
import type { ExecutiveOrder, RawExecutiveOrder } from "../../lib/executive-orders-entities";
import { ADMINISTRATIONS } from "./administrations";
import {
  ANCHORS,
  ExecutiveOrderDataError,
  inheritanceParents,
  normalizeRaw,
  parseNotes,
  termFor,
  validateExecutiveOrders,
} from "./executive-orders";

describe("parseNotes", () => {
  it("keeps forward labels and ignores inverse/see labels", () => {
    const n = "Federal Register correction page and date: 75 FR 1013, January 8, 2010, Executive Order 13526 - Correction; Revokes: EO 12958, April 17, 1995; EO 13292, March 25, 2003;  See: EO 12333, December 4, 1981\nRevoked by: EO 99999, May 1, 2012";
    expect(parseNotes(n)).toEqual({ amends: [], revokes: [12958, 13292] });
  });
  it("treats partial revocation and supplementing as amending", () => {
    expect(parseNotes("Revokes in part: EO 12000, May 1, 1990\nAmends: EO 13100, May 1, 1998")).toEqual({ amends: [12000, 13100], revokes: [] });
    expect(parseNotes("Amended by: EO 13500, May 1, 2009")).toEqual({ amends: [], revokes: [] });
  });
  it("handles null / empty", () => {
    expect(parseNotes(null)).toEqual({ amends: [], revokes: [] });
  });
});

describe("termFor", () => {
  it("splits January of a transition year between two presidents", () => {
    expect(termFor("2021-01-19", ADMINISTRATIONS).president_slug).toBe("donald-trump");
    expect(termFor("2021-01-19", ADMINISTRATIONS).term_id).toBe("2017-01-20");
    expect(termFor("2021-01-20", ADMINISTRATIONS).president_slug).toBe("joe-biden");
    expect(termFor("2025-01-19", ADMINISTRATIONS).president_slug).toBe("joe-biden");
    expect(termFor("2025-01-20", ADMINISTRATIONS).term_id).toBe("2025-01-20");
  });
  it("gives Trump's two terms two rows", () => {
    expect(ADMINISTRATIONS.filter((a) => a.president_slug === "donald-trump")).toHaveLength(2);
  });
  it("rejects a date before the first tenure", () => {
    expect(() => termFor("1990-01-01", ADMINISTRATIONS)).toThrow(ExecutiveOrderDataError);
  });
});

describe("inheritanceParents", () => {
  it("inherits when the title is only a pointer to another EO", () => {
    expect(inheritanceParents({ title: "Amendment to Executive Order 13212", amends: [13212], revokes: [] })).toEqual([13212]);
    expect(inheritanceParents({ title: "Executive Order 13033 of December 27, 1996", amends: [12961], revokes: [] })).toEqual([12961]);
  });
  it("does not inherit for a substantive order that happens to revoke another", () => {
    expect(inheritanceParents({ title: "Classified National Security Information", amends: [], revokes: [12958] })).toEqual([]);
  });
});

const raw = (over: Partial<RawExecutiveOrder>): RawExecutiveOrder => ({
  executive_order_number: "13000",
  document_number: "96-1",
  title: "T",
  abstract: null,
  signing_date: "1996-01-01",
  publication_date: "1996-01-04",
  president: { identifier: "william-j-clinton", name: "Bill Clinton" },
  agencies: [],
  executive_order_notes: null,
  html_url: "https://example.gov/x",
  pdf_url: null,
  citation: null,
  ...over,
});

describe("normalizeRaw", () => {
  it("drops documents without an EO number and C1-/R1- corrections", () => {
    const n = normalizeRaw([
      raw({}),
      raw({ executive_order_number: null, document_number: "95-2" }),
      raw({ document_number: "C1-2009-3" }),
      raw({ document_number: "R1-2016-3" }),
    ]);
    expect(n.rows).toHaveLength(1);
    expect(n.droppedNoNumber).toHaveLength(1);
    expect(n.droppedCorrections).toHaveLength(2);
  });
});

describe("validateExecutiveOrders", () => {
  const row = (eo_number: number, signing_date: string, term_id: string): ExecutiveOrder => ({
    eo_number, document_number: `d${eo_number}`, title: "T", abstract: null, signing_date,
    publication_date: signing_date, term_id, agencies: [], amends: [], revokes: [],
    topic: "civil_rights_civic", topic_method: "manual", needs_review: false,
  });
  /** A synthetic set that satisfies every anchor. */
  const base = (): ExecutiveOrder[] => {
    // Biden: 162 total numbered 13985..14146, the last 13 signed in January 2025.
    const out: ExecutiveOrder[] = [];
    for (let i = 0; i < ANCHORS.bidenCount; i++) {
      out.push(row(ANCHORS.bidenFirst + i, i < ANCHORS.bidenCount - 13 ? "2022-06-01" : "2025-01-10", "2021-01-20"));
    }
    for (let i = 0; i < ANCHORS.trump2025Count; i++) out.push(row(14147 + i, "2025-06-01", "2025-01-20"));
    return out;
  };
  it("passes the anchors on a consistent set", () => {
    expect(validateExecutiveOrders(base(), ADMINISTRATIONS).total2025).toBe(ANCHORS.total2025);
  });
  it("fails on a Biden count mismatch", () => {
    expect(() => validateExecutiveOrders(base().slice(1), ADMINISTRATIONS)).toThrow(/count anchor failed/);
  });
  it("fails on a non-monotonic number that is not allowlisted", () => {
    const rows = base();
    rows[5] = { ...rows[5], signing_date: "2020-01-01" };
    expect(() => validateExecutiveOrders(rows, ADMINISTRATIONS)).toThrow(/not monotonic/);
  });
  it("fails on a duplicate eo_number", () => {
    const rows = base();
    rows.push({ ...rows[0] });
    expect(() => validateExecutiveOrders(rows, ADMINISTRATIONS)).toThrow(/duplicate|ascending/);
  });
});
