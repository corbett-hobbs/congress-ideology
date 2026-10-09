import { describe, expect, it } from "vitest";
import { parseBillStatus, summaryHtml, tagText, zipEntries } from "./billstatus-lib";
import { deflateRawSync } from "node:zlib";

const bill = (extra = "", laws = "<item><type>Public Law</type><number>118-90</number></item>") => `<?xml version="1.0"?>
<billStatus><bill>
  <number>3764</number><originChamber>Senate</originChamber><type>S</type><introducedDate>2024-02-07</introducedDate><congress>118</congress>
  <updateDate>2025-12-05T08:22:44Z</updateDate>
  <actions>
    <item><actionDate>2024-09-11</actionDate><sourceSystem><code>9</code><name>Library of Congress</name></sourceSystem><text>Passed/agreed to in Senate: Passed Senate &amp; sent to House.</text><type>Floor</type>
      <recordedVotes><recordedVote><rollNumber>154</rollNumber><chamber>Senate</chamber><congress>118</congress><date>2024-09-12T01:44:19Z</date><sessionNumber>2</sessionNumber></recordedVote></recordedVotes></item>
    <item><actionDate>2024-09-12</actionDate><text>Referred to the Committee on Rules.</text><type>IntroReferral</type></item>
    <item><actionDate>2024-09-30</actionDate><sourceSystem><code>9</code></sourceSystem><text>Became Public Law No: 118-90.</text><type>BecameLaw</type></item>
    <item><actionDate>2024-09-30</actionDate><sourceSystem><code>9</code></sourceSystem><text>Became Public Law No: 118-90.</text><type>BecameLaw</type></item>
  </actions>
  <committees><item><systemCode>hsif00</systemCode><name>Energy and Commerce Committee</name><chamber>House</chamber><type>Standing</type>
    <subcommittees><item><systemCode>hsif14</systemCode><name>Health Subcommittee</name><activities><item><name>Referred to</name><date>2024-02-10T10:00:00Z</date></item></activities></item></subcommittees>
    <activities><item><name>Referred to</name><date>2024-02-09T10:00:00Z</date></item><item><name>Reported By</name><date>2024-03-01T10:00:00Z</date></item></activities></item></committees>
  <amendments><amendment><sponsors><item><bioguideId>Z999999</bioguideId></item></sponsors><type>SAMDT</type></amendment></amendments>
  <sponsors><item><bioguideId>R000595</bioguideId><fullName>Sen. Rubio, Marco [R-FL]</fullName></item></sponsors>
  <cosponsors>
    <item><bioguideId>A000001</bioguideId></item>
    <item><bioguideId>B000002</bioguideId><sponsorshipWithdrawnDate>2024-03-01</sponsorshipWithdrawnDate></item>
  </cosponsors>
  <laws>${laws}</laws>
  <policyArea><name>International Affairs</name></policyArea>
  <summaries>
    <summary><versionCode>00</versionCode><actionDate>2024-02-07</actionDate><actionDesc>Introduced in Senate</actionDesc><cdata><text>&lt;p&gt;Introduced text.&lt;/p&gt;</text></cdata></summary>
    <summary><versionCode>49</versionCode><actionDate>2023-09-30</actionDate><actionDesc>Public Law</actionDesc><cdata><text>&lt;p&gt;&lt;strong&gt;The Act&lt;/strong&gt;&lt;/p&gt;&lt;p&gt;This act does a thing.&lt;/p&gt;</text></cdata></summary>
  </summaries>
  <title>United States Commission Reauthorization Act of 2024</title>
  <latestAction><actionDate>2024-09-30</actionDate><text>Became Public Law No: 118-90.</text></latestAction>${extra}
</bill></billStatus>`;

describe("parseBillStatus", () => {
  it("reads a bill that became law", () => {
    const [l, ...rest] = parseBillStatus(bill());
    expect(rest).toEqual([]);
    expect(l).toMatchObject({
      law_id: "118-pub-90",
      congress: 118,
      number: 90,
      bill_type: "s",
      bill_number: "3764",
      origin_chamber: "Senate",
      introduced: "2024-02-07",
      sponsor: "R000595",
      policy_area: "International Affairs",
      became_law: ["2024-09-30"],
      latest_action_date: "2024-09-30",
      updated: "2025-12-05",
      summary_stage: "Public Law",
    });
  });

  it("ignores amendment sponsors, withdrawn cosponsors and procedural actions", () => {
    const l = parseBillStatus(bill())[0]!;
    expect(l.sponsor).toBe("R000595");
    expect(l.cosponsors).toEqual(["A000001"]);
    expect(l.actions.map((a) => a.type)).toEqual(["Floor", "BecameLaw"]);
  });

  it("reads committees with their nested subcommittees and steps", () => {
    expect(parseBillStatus(bill())[0]!.committees).toEqual([
      {
        code: "hsif00",
        name: "Energy and Commerce Committee",
        chamber: "House",
        activities: [{ name: "Referred to", date: "2024-02-09" }, { name: "Reported By", date: "2024-03-01" }],
        subcommittees: [{ code: "hsif14", name: "Health Subcommittee", activities: [{ name: "Referred to", date: "2024-02-10" }] }],
      },
    ]);
  });

  it("keeps roll-call references and decodes entities", () => {
    const a = parseBillStatus(bill())[0]!.actions[0]!;
    expect(a.text).toBe("Passed/agreed to in Senate: Passed Senate & sent to House.");
    expect(a.votes).toEqual([{ chamber: "Senate", roll: 154, session: 2, date: "2024-09-12" }]);
    expect(a.src).toBe(9);
  });

  it("prefers the enacted summary", () => {
    expect(parseBillStatus(bill())[0]!.summary_html).toContain("This act does a thing.");
  });

  it("returns one record per public law a bill carries", () => {
    const two = bill("", "<item><type>Public Law</type><number>118-90</number></item><item><type>Public Law</type><number>118-91</number></item>");
    expect(parseBillStatus(two).map((l) => l.law_id)).toEqual(["118-pub-90", "118-pub-91"]);
  });

  it("returns nothing for a bill that did not become law", () => {
    expect(parseBillStatus(bill().replaceAll("<type>Public Law</type>", "<type>Private Law</type>"))).toEqual([]);
  });
});

describe("tagText", () => {
  it("returns null for an absent or empty tag", () => {
    expect(tagText("<a></a>", "a")).toBeNull();
    expect(tagText("<a>x</a>", "b")).toBeNull();
  });
});

describe("zipEntries", () => {
  it("walks a zip with stored and deflated entries", () => {
    const entries = [
      { name: "a.xml", data: Buffer.from("<a/>"), method: 0 },
      { name: "b.xml", data: Buffer.from("<b>hello</b>".repeat(10)), method: 8 },
    ];
    const parts: Buffer[] = [];
    const central: Buffer[] = [];
    let offset = 0;
    for (const e of entries) {
      const body = e.method === 8 ? deflateRawSync(e.data) : e.data;
      const name = Buffer.from(e.name);
      const lh = Buffer.alloc(30);
      lh.writeUInt32LE(0x04034b50, 0);
      lh.writeUInt16LE(e.method, 8);
      lh.writeUInt32LE(body.length, 18);
      lh.writeUInt32LE(e.data.length, 22);
      lh.writeUInt16LE(name.length, 26);
      parts.push(lh, name, body);
      const ch = Buffer.alloc(46);
      ch.writeUInt32LE(0x02014b50, 0);
      ch.writeUInt16LE(e.method, 10);
      ch.writeUInt32LE(body.length, 20);
      ch.writeUInt32LE(e.data.length, 24);
      ch.writeUInt16LE(name.length, 28);
      ch.writeUInt32LE(offset, 42);
      central.push(ch, name);
      offset += 30 + name.length + body.length;
    }
    const cd = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(cd.length, 12);
    end.writeUInt32LE(offset, 16);
    const zip = Buffer.concat([...parts, cd, end]);
    const got = [...zipEntries(zip)].map((e) => [e.name, e.data().toString()]);
    expect(got).toEqual([
      ["a.xml", "<a/>"],
      ["b.xml", "<b>hello</b>".repeat(10)],
    ]);
  });
});

describe("summaryHtml", () => {
  it("reads both ways Bill Status wraps the summary", () => {
    expect(summaryHtml("<summary><text><![CDATA[ <p>Amends the <b>Act</b>.</p> ]]></text></summary>")).toBe("<p>Amends the <b>Act</b>.</p>");
    expect(summaryHtml("<summary><cdata><text>&lt;p&gt;This act does a thing.&lt;/p&gt;</text></cdata></summary>")).toBe("<p>This act does a thing.</p>");
    expect(summaryHtml("<summary></summary>")).toBe("");
  });
  it("is what parseBillStatus keeps for an older-format file", () => {
    const xml = `<billStatus><bill><number>2</number><type>HR</type><congress>114</congress><laws><item><type>Public Law</type><number>114-10</number></item></laws><actions><item><actionDate>2015-04-16</actionDate><text>Became Public Law No: 114-10.</text><type>BecameLaw</type></item></actions><summaries><summary><actionDesc>Introduced in House</actionDesc><actionDate>2015-03-24</actionDate><text><![CDATA[ <p>Amends title XVIII to remove the formula.</p> ]]></text></summary></summaries></bill></billStatus>`;
    expect(parseBillStatus(xml)[0]!.summary_html).toBe("<p>Amends title XVIII to remove the formula.</p>");
  });
});
