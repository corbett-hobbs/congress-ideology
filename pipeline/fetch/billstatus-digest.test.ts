import { describe, expect, it } from "vitest";
import { parseBillDigest, slimBillAction } from "./billstatus-lib";

const xml = (type = "HR") => `<?xml version="1.0"?>
<billStatus><bill>
  <number>26</number><originChamber>House</originChamber><type>${type}</type><introducedDate>2025-01-03</introducedDate><congress>119</congress>
  <updateDate>2026-06-11T08:22:44Z</updateDate>
  <committees><item><systemCode>hsii00</systemCode><name>Natural Resources Committee</name><chamber>House</chamber><type>Standing</type>
    <subcommittees><item><systemCode>hsii13</systemCode><name>Federal Lands Subcommittee</name><activities><item><name>Hearings By (subcommittee)</name><date>2025-03-05T10:00:00Z</date></item></activities></item></subcommittees>
    <activities><item><name>Referred To</name><date>2025-01-03T10:00:00Z</date></item><item><name>Markup By</name><date>2025-04-01T10:00:00Z</date></item></activities></item></committees>
  <actions>
    <item><actionDate>2025-04-01</actionDate><committees><item><systemCode>hsii00</systemCode><name>Natural Resources Committee</name></item></committees><text>Ordered to be Reported (Amended) by the Yeas and Nays: 24 - 11.</text><type>Committee</type></item>
    <item><actionDate>2025-04-01</actionDate><committees><item><systemCode>hsii00</systemCode></item></committees><text>Ordered to be Reported (Amended) by the Yeas and Nays: 24 - 11.</text><type>Committee</type></item>
    <item><actionDate>2025-04-10</actionDate><text>Placed on the Union Calendar, Calendar No. 12.</text><type>Calendars</type></item>
    <item><actionDate>2025-05-01</actionDate><text>Passed/agreed to in House: On passage Passed by the Yeas and Nays: 220 - 200.</text><type>Floor</type></item>
    <item><actionDate>2025-05-02</actionDate><text>Motion to reconsider laid on the table Agreed to without objection.</text><type>Floor</type></item>
    <item><actionDate>2025-06-01</actionDate><text>Became Public Law No: 119-5.</text><type>BecameLaw</type></item>
  </actions>
  <amendments><amendment><sponsors><item><bioguideId>Z999999</bioguideId></item></sponsors><type>HAMDT</type></amendment></amendments>
  <sponsors><item><bioguideId>P000048</bioguideId><fullName>Rep. Pfluger, August [R-TX-11]</fullName></item></sponsors>
  <cosponsors>
    <item><bioguideId>A000001</bioguideId><party>R</party></item>
    <item><bioguideId>B000002</bioguideId><party>D</party></item>
    <item><bioguideId>C000003</bioguideId><party>D</party></item>
    <item><bioguideId>D000004</bioguideId><party>I</party></item>
    <item><bioguideId>E000005</bioguideId><party>D</party><sponsorshipWithdrawnDate>2025-02-01</sponsorshipWithdrawnDate></item>
  </cosponsors>
  <committeeReports><committeeReport><citation>H. Rept. 119-12</citation></committeeReport></committeeReports>
  <cboCostEstimates><item><title>x</title></item><item><title>y</title></item></cboCostEstimates>
  <laws><item><type>Public Law</type><number>119-5</number></item></laws>
  <policyArea><name>Energy</name></policyArea>
  <title>Protecting American Energy Production Act</title>
  <latestAction><actionDate>2025-06-01</actionDate><text>Became Public Law No: 119-5.</text></latestAction>
</bill></billStatus>`;

describe("slimBillAction", () => {
  it("keeps committee steps with their text and drops other procedure", () => {
    expect(slimBillAction("Committee", "Committee Consideration and Mark-up Session Held", ["hsju00"])).toMatchObject({ text: "Committee Consideration and Mark-up Session Held", committees: ["hsju00"] });
    expect(slimBillAction("Committee", "Ordered to be Reported by Voice Vote.", [])).not.toBeNull();
    expect(slimBillAction("Floor", "Motion to reconsider laid on the table Agreed to without objection.", [])).toBeNull();
    expect(slimBillAction("IntroReferral", "Referred to the Committee on Rules.", ["hsru00"])).toBeNull();
  });
  it("keeps calendars, passage, vetoes and the signing as markers", () => {
    expect(slimBillAction("Calendars", "Placed on the Union Calendar, Calendar No. 12.", [])).toEqual({ type: "Calendars", text: "", committees: [] });
    expect(slimBillAction("Floor", "Passed/agreed to in Senate: Passed Senate without amendment.", [])).toMatchObject({ text: "Passed/agreed to in Senate" });
    expect(slimBillAction("Veto", "Vetoed by President.", [])).toMatchObject({ type: "Veto" });
    expect(slimBillAction("BecameLaw", "Became Public Law No: 119-5.", [])).toMatchObject({ type: "BecameLaw" });
    expect(slimBillAction("President", "Became Public Law No: 119-5.", [])).toMatchObject({ text: "Became Public Law" });
    expect(slimBillAction("President", "Signed by President.", [])).toBeNull();
  });
});

describe("parseBillDigest", () => {
  const d = parseBillDigest(xml())!;
  it("reads the bill's own fields, not an amendment's", () => {
    expect(d).toMatchObject({ type: "hr", number: "26", title: "Protecting American Energy Production Act", introduced: "2025-01-03", origin_chamber: "House", policy_area: "Energy", cbo_estimates: 2 });
    expect(d.sponsor).toEqual({ id: "P000048", name: "Rep. Pfluger, August [R-TX-11]" });
  });
  it("counts current cosponsors by party and leaves withdrawn ones out", () => {
    expect(d.cosponsors).toEqual([2, 1, 1]);
  });
  it("keeps committees with their subcommittees and dated steps", () => {
    expect(d.committees).toHaveLength(1);
    expect(d.committees[0]).toMatchObject({ code: "hsii00", chamber: "House" });
    expect(d.committees[0]!.activities.map((a) => [a.name, a.date])).toContainEqual(["Markup By", "2025-04-01"]);
    expect(d.committees[0]!.subcommittees[0]).toMatchObject({ code: "hsii13" });
  });
  it("keeps only the actions the stage logic reads, once each, oldest first", () => {
    expect(d.actions.map((a) => [a.date, a.type])).toEqual([
      ["2025-04-01", "Committee"],
      ["2025-04-10", "Calendars"],
      ["2025-05-01", "Floor"],
      ["2025-06-01", "BecameLaw"],
    ]);
    expect(d.actions[0]).toMatchObject({ committees: ["hsii00"] });
  });
  it("reads laws, reports and the latest action", () => {
    expect(d.laws).toEqual(["119-5"]);
    expect(d.reports).toEqual(["H. Rept. 119-12"]);
    expect(d.latest_action).toEqual({ date: "2025-06-01", text: "Became Public Law No: 119-5." });
  });
  it("skips a bill type that is not a bill or joint resolution", () => {
    expect(parseBillDigest(xml("HRES"))).toBeNull();
  });
});
