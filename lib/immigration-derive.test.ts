import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { enforcementNote, enforcementReport, enforcementRow } from "./enforcement-entities";
import { administration } from "./executive-orders-entities";
import { assertEnforcementInvariants, buildImmigrationData, filterYears, showsPendingSlot, termOptionLabel, termsNewestFirst, yDomainMax } from "./immigration-derive";
import { bandLabel, fyPosition, labelsBar, shadeSpan, slotLayout, termSegments, valueLabel, visibleMarkers, yearLabel, yearLabelMode } from "./immigration-chart";

const OUT = join(process.cwd(), "pipeline", "output");
const read = (f: string) => JSON.parse(readFileSync(join(OUT, f), "utf8"));
const rows = (read("enforcement_series.json") as unknown[]).map((r) => enforcementRow.parse(r));
const notes = (read("enforcement_notes.json") as unknown[]).map((r) => enforcementNote.parse(r));
const report = enforcementReport.parse(read("enforcement_report.json"));
const admins = (read("administrations.json") as unknown[]).map((r) => administration.parse(r));
const data = buildImmigrationData(rows, notes, report, admins);

describe("series invariants (real files)", () => {
  it("23 contiguous years, one preliminary, days and attribution consistent", () => {
    expect(rows).toHaveLength(23);
    expect(() => assertEnforcementInvariants(rows, report, admins)).not.toThrow();
  });
  it("fails loudly when the data drifts", () => {
    expect(() => assertEnforcementInvariants(rows.slice(1), report, admins)).toThrow(/starts at 2004/);
    const bad = rows.map((r) => (r.period === 2021 ? { ...r, administration_term_id: "2017-01-20" } : r));
    expect(() => assertEnforcementInvariants(bad, report, admins)).toThrow(/majority term/);
    const bad2 = rows.map((r) => (r.period === 2013 ? { ...r, value: 1 } : r));
    expect(() => assertEnforcementInvariants(bad2, report, admins)).toThrow(/anchor/);
  });
});

describe("page data", () => {
  it("y-domain is fixed from the full series", () => {
    expect(data.yMax).toBe(480_000);
    expect(yDomainMax([442_637])).toBe(480_000);
  });
  it("counts come from the data", () => {
    expect(data.finalCount).toBe(22);
    expect(data.corroboratedCount).toBe(10);
  });
  it("terms are oldest first, dropdown newest first", () => {
    expect(data.terms.map((t) => termOptionLabel(t))).toEqual([
      "George W. Bush (2001–2009)",
      "Barack Obama (2009–2017)",
      "Donald Trump (2017–2021)",
      "Joe Biden (2021–2025)",
      "Donald Trump (2025–)",
    ]);
    expect(termsNewestFirst(data.terms)[0].termId).toBe("2025-01-20");
  });
  it("filters by administration; the pending slot follows the newest one", () => {
    expect(filterYears(data.years, "all")).toHaveLength(23);
    expect(filterYears(data.years, "2021-01-20").map((y) => y.fy)).toEqual([2021, 2022, 2023, 2024]);
    expect(filterYears(data.years, "2025-01-20").map((y) => y.fy)).toEqual([2025]);
    expect(showsPendingSlot(data, "all")).toBe(true);
    expect(showsPendingSlot(data, "2025-01-20")).toBe(true);
    expect(showsPendingSlot(data, "2021-01-20")).toBe(false);
  });
  it("card notes exclude marker-covered and the Oct 5 note", () => {
    const withNotes = data.years.filter((y) => y.cardNotes.length).map((y) => y.fy);
    expect(withNotes).toEqual([2010, 2021, 2025]);
  });
  it("blended years carry both administrations", () => {
    const fy21 = data.years.find((y) => y.fy === 2021)!;
    expect(fy21.days.map((d) => `${d.last} ${d.days}`)).toEqual(["Trump 111", "Biden 254"]);
    expect(fy21.figureRead).toBe(true);
    expect(fy21.corroborated).toBe(false);
  });
});

describe("chart geometry", () => {
  it("caps slot at 80 and bar at 52", () => {
    expect(slotLayout(1032, 24).slotW).toBeCloseTo(43);
    expect(slotLayout(1032, 24).barW).toBeCloseTo(38);
    expect(slotLayout(1032, 2)).toEqual({ slotW: 80, barW: 52 });
  });
  it("positions dates on the fiscal-year axis like the mock", () => {
    expect(fyPosition("2006-10-01")).toBe(2007);
    expect(fyPosition("2003-03-01") - 2003).toBeCloseTo(151 / 365, 5);
    const x = (iso: string) => 44 + (fyPosition(iso) - 2003) * 43;
    expect(x("2003-03-01")).toBeCloseTo(61.8, 0);
    expect(x("2013-06-01")).toBeCloseTo(502.6, 0);
    expect(x("2020-03-01")).toBeCloseTo(792.9, 0);
    expect(x("2023-05-12")).toBeCloseTo(930.3, 0);
  });
  it("hides markers outside the shown years and clips the Title 42 shade", () => {
    const biden = visibleMarkers(data.markers, 2021, 2024).map((p) => p.marker.n);
    expect(biden).toEqual([5]);
    const trump = visibleMarkers(data.markers, 2017, 2020).map((p) => p.marker.n);
    expect(trump).toEqual([4]);
    const t42 = data.markers[3];
    expect(shadeSpan(t42, 2021, 4)![0]).toBe(0);
    expect(shadeSpan(t42, 2003, 6)).toBeNull();
  });
  it("label density", () => {
    expect(labelsBar(2015, 8)).toBe(true);
    expect(labelsBar(2015, 9)).toBe(false);
    expect(labelsBar(2021, 23)).toBe(true);
    expect(valueLabel(410_000, 35)).toBe("410k");
    expect(valueLabel(410_000, 45)).toBe("410,000");
    expect(yearLabelMode(43)).toBe("four");
    expect(yearLabelMode(25)).toBe("two");
    expect(yearLabelMode(14)).toBe("every4");
    expect([2003, 2004, 2007].map((y) => yearLabel(y, "every4"))).toEqual(["2003", null, "2007"]);
    expect(bandLabel(171, "Donald Trump", "Trump")).toBe("Donald Trump");
    expect(bandLabel(85, "Donald Trump", "Trump")).toBe("Trump");
    expect(bandLabel(30, "Donald Trump", "Trump")).toBeNull();
  });
  it("term segments break on administration changes and the pending slot extends the last", () => {
    const seg = termSegments(data.years, true);
    expect(seg.map((s) => [s.party, s.from, s.to])).toEqual([["R", 0, 6], ["D", 6, 14], ["R", 14, 18], ["D", 18, 22], ["R", 22, 24]]);
  });
});
