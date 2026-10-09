import { describe, expect, it } from "vitest";
import { parseActList } from "./wikipedia-laws-lib";

const row = (id: string, cell: string) => `<tr>\n<td>${id}\n</td>\n<td><span data-sort-value="000000002021-05-01-0000">May 1, 2021</span></td>\n<td>${cell}\n</td>\n<td>x</td>\n<td><abbr title="Public Law">Pub. L.</abbr> ${id}</td></tr>`;

describe("parseActList", () => {
  it("reads the law id, the article title and the printed name", () => {
    const html = [
      row("117-2", '<a href="/wiki/American_Rescue_Plan_Act_of_2021" title="x">American Rescue Plan Act of 2021</a>'),
      row("117-3", "<small>(No short title)</small>"),
      row("117-4", '<a href="/wiki/Missing" class="new" title="Missing">Missing Act</a>'),
    ].join("");
    expect(parseActList(`<table>${html}</table>`)).toEqual([
      { law_id: "117-2", title: "American Rescue Plan Act of 2021", name: "American Rescue Plan Act of 2021" },
      { law_id: "117-3", title: null, name: null },
      { law_id: "117-4", title: null, name: "Missing Act" },
    ]);
  });
});
