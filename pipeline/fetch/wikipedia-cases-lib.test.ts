import { describe, expect, it } from "vitest";
import { parseTermPage, parseVolumePage } from "./wikipedia-cases-lib";

const TABLE = `<table class="wikitable"><tbody><tr><th>Case name</th></tr>
<tr class="vevent">
<td class="summary"><i><a href="/wiki/Allen_v._Milligan" title="Allen v. Milligan">Allen v. Milligan</a></i>
</td>
<td style="white-space:nowrap;"><a rel="nofollow" class="external text" href="https://supreme.justia.com/cases/federal/us/599/21-1086/">21–1086</a>
</td>
<td>June 8,&#32;<span class="dtstart">2023</span>
</td></tr>
<tr style="background: white"><td colspan="3">Summary.</td></tr>
<tr class="vevent">
<td class="summary"><i><a href="/w/index.php?title=Halliburton&amp;action=edit&amp;redlink=1" class="new" title="Halliburton (page does not exist)">Halliburton Oil Well Cementing Company v. Walker</a></i>
</td>
<td style="white-space:nowrap;"><a rel="nofollow" class="external text" href="https://supreme.justia.com/cases/federal/us/329/1/">329 U.S. 1</a>
</td>
<td><span class="dtstart">1946</span>
</td></tr></tbody></table>`;

describe("wikipedia-cases-lib", () => {
  it("reads a volume table: article or red link, page or docket, year", () => {
    expect(parseVolumePage(TABLE, 599, "v599")).toEqual([
      { title: "Allen v. Milligan", name: "Allen v. Milligan", volume: 599, page: null, docket: "21-1086", year: 2023, source: "v599" },
      { title: null, name: "Halliburton Oil Well Cementing Company v. Walker", volume: 329, page: 1, docket: null, year: 1946, source: "v599" },
    ]);
  });
  it("reads a bullet-list volume page", () => {
    const html = `<ul><li><i><a href="/wiki/Brady_v._Maryland" title="Brady v. Maryland">Brady v. Maryland</a></i>, <a class="mw-selflink selflink">373</a>&#32;<a href="/wiki/United_States_Reports">U.S.</a> <a class="external text" href="https://supreme.justia.com/cases/federal/us/373/83/">83</a>&#32;(1963)</li></ul>`;
    expect(parseVolumePage(html, 373, "v373")).toEqual([{ title: "Brady v. Maryland", name: "Brady v. Maryland", volume: 373, page: 83, docket: null, year: 1963, source: "v373" }]);
  });
  it("reads a term list, with and without a page number", () => {
    const html = `<table><tr><td class="scotus-termlist-no">1</td><td class="scotus-termlist-case"><i><a href="/wiki/Pung_v._Isabella_County" title="Pung v. Isabella County">Pung v. Isabella County</a></i>, <span class="nowrap">609 U.S. 30</span></td><td class="scotus-termlist-date">March 3, 2026</td><td class="scotus-termlist-date">June 23, 2026</td></tr>
<tr><td class="scotus-termlist-no">2</td><td class="scotus-termlist-case"><i><a href="/w/index.php?title=X_v._Y&amp;action=edit&amp;redlink=1" class="new" title="X v. Y (page does not exist)">X v. Y</a></i>, <span class="nowrap">609 U.S. ___</span></td><td class="scotus-termlist-date"></td><td class="scotus-termlist-date">June 24, 2026</td></tr></table>`;
    expect(parseTermPage(html, "t")).toEqual([
      { title: "Pung v. Isabella County", name: "Pung v. Isabella County", volume: 609, page: 30, docket: null, year: 2026, source: "t" },
      { title: null, name: "X v. Y", volume: 609, page: null, docket: null, year: 2026, source: "t" },
    ]);
  });
});
