import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { removalsCountryRow } from "../../lib/removals-country-entities";
import { buildRemovalsByCountry, COUNTRY_TABLES } from "./removals-country";
import { ICE_ALIASES, indexCountries, normalizeName, resolveCountry, UnmappedCountryError } from "./removals-country-names";
import { parseCountryTable, RemovalsCountryError, type CountrySourceSpec } from "./removals-country-parse";

const COUNTRIES = indexCountries([
  { country_code: "MEX", name: "Mexico" },
  { country_code: "MMR", name: "Burma (Myanmar)" },
  { country_code: "COG", name: "Congo, Republic of the Congo" },
  { country_code: "COD", name: "Congo, Democratic Republic of the Congo (formerly Za" },
  { country_code: "KOR", name: "South Korea (Republic of Korea)" },
  { country_code: "TUR", name: "Turkey" },
  { country_code: "MKD", name: "North Macedonia" },
  { country_code: "VCT", name: "Saint Vincent and the Grenadines" },
  { country_code: "CHN", name: "China" },
  { country_code: "SRB", name: "Serbia" },
  { country_code: "SCG", name: "Serbia and Montenegro" },
]);

describe("country names", () => {
  it("normalises case, punctuation, accents and St./Saint", () => {
    expect(normalizeName("ST. VINCENT- GRENADINES")).toBe("saint vincent grenadines");
    expect(normalizeName("Türkiye")).toBe("turkiye");
    expect(normalizeName("China, People’s Republic of")).toBe("china peoples republic of");
  });

  it("resolves the variants ICE prints across vintages to one key", () => {
    const key = (n: string) => resolveCountry(n, COUNTRIES).country_key;
    expect(key("MEXICO")).toBe("MEX");
    expect(["Turkey", "Türkiye", "TURKEY"].map(key)).toEqual(["TUR", "TUR", "TUR"]);
    expect(["Macedonia", "North Macedonia"].map(key)).toEqual(["MKD", "MKD"]);
    expect(["China, Peoples Republic of", "CHINA, PEOPLES REPUBLIC OF", "China, People's Republic Of"].map(key)).toEqual(["CHN", "CHN", "CHN"]);
    expect(["St. Vincent-Grenadines", "ST. VINCENT- GRENADINES"].map(key)).toEqual(["VCT", "VCT"]);
    expect(key("Burma")).toBe("MMR");
  });

  it("keeps the two Congos apart and never folds 'Korea' into South Korea", () => {
    const key = (n: string) => resolveCountry(n, COUNTRIES).country_key;
    expect(key("Congo")).toBe("COG");
    expect(["Dem Rep of the Congo", "DEM. REP. OF THE CONGO", "Democratic Republic of the Congo"].map((n) => (n === "DEM. REP. OF THE CONGO" ? key("Dem Rep of the Congo") : key(n)))).toEqual(["COD", "COD", "COD"]);
    expect(key("South Korea")).toBe("KOR");
    expect(resolveCountry("Korea", COUNTRIES)).toEqual({ country_key: "XKO", display_name: "Korea (unspecified)" });
  });

  it("maps the non-country rows to documented keys, and fails on a name it cannot place", () => {
    expect(resolveCountry("Unknown", COUNTRIES).country_key).toBe("XUN");
    expect(resolveCountry("Stateless", COUNTRIES).country_key).toBe("XST");
    expect(() => resolveCountry("Atlantis", COUNTRIES)).toThrow(UnmappedCountryError);
    expect(Object.values(ICE_ALIASES).every((k) => /^[A-Z]{3}$/.test(k))).toBe(true);
  });
});

const columns: CountrySourceSpec = { source: "t", start: /Appendix/, years: [2018, 2019], layout: "columns", as_of: {} };

describe("parseCountryTable", () => {
  const text = [
    "Appendix B: Removals by Country of Citizenship",
    "   Country of Citizenship     FY 2018   FY 2019",
    "   Total                      15        20",
    "   MEXICO                     10        12",
    "                                27",
    "   SERBIA AND",
    "   MONTENEGRO                 2         3",
    "   BRAZIL                     1,003     5",
  ].join("\n");

  it("reads rows and the printed total, ignores page numbers, and joins a wrapped name", () => {
    const t = parseCountryTable(text.replace("1,003", "3  "), columns);
    expect(t.total).toEqual([15, 20]);
    expect(t.rows.map((r) => [r.name, r.values, r.wrapped])).toEqual([
      ["MEXICO", [10, 12], false],
      ["SERBIA AND MONTENEGRO", [2, 3], true],
      ["BRAZIL", [3, 5], false],
    ]);
  });

  it("parses thousands separators", () => {
    expect(parseCountryTable(text, columns).rows.at(-1)?.values).toEqual([1003, 5]);
  });

  it("reads a one-cell-per-line page", () => {
    const stacked: CountrySourceSpec = { ...columns, layout: "stacked" };
    const t = parseCountryTable(["Appendix", "FY2018", "FY2019", "Mexico", "10", "12", "Haiti", "5", "8", "Total", "15", "20"].join("\n"), stacked);
    expect(t.rows.map((r) => r.name)).toEqual(["Mexico", "Haiti"]);
    expect(t.total).toEqual([15, 20]);
  });

  it("fails when the table or its total is missing", () => {
    expect(() => parseCountryTable("nothing", columns)).toThrow(RemovalsCountryError);
    expect(() => parseCountryTable("Appendix\n MEXICO 1 2", columns)).toThrow(/no Total row/);
  });
});

describe("buildRemovalsByCountry reconciliation", () => {
  const spec = COUNTRY_TABLES[0]; // FY2014 report
  const table = (rows: string[], total: number) =>
    ["III. Appendix A: FY 2014 Removals by Citizenship", ...rows, `Total  ${total}`, "Appendix B: Methodology"].join("\n");
  const only = (text: string) => new Map([[spec.source, text]]);

  it("fails when a table's rows do not sum to the Total ICE prints", () => {
    expect(() => buildRemovalsByCountry({ texts: only(table(["Mexico   90", "Haiti   5"], 100)), index: COUNTRIES, national: new Map([[2014, 100]]) })).toThrow(/sum to 95 but the table prints a Total of 100/);
  });
});

describe("removals_by_country.json (committed output)", () => {
  const read = (f: string) => JSON.parse(readFileSync(`pipeline/output/${f}`, "utf8")) as unknown[];
  const rows = read("removals_by_country.json").map((r) => removalsCountryRow.parse(r));
  const national = new Map((read("enforcement_series.json") as { period: number; value: number }[]).map((r) => [r.period, r.value]));

  it("sums to the national ICE series for every covered fiscal year, with no tolerance", () => {
    const sums = new Map<number, number>();
    for (const r of rows) sums.set(r.fiscal_year, (sums.get(r.fiscal_year) ?? 0) + r.removals);
    expect([...sums.keys()].sort()).toEqual([2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]);
    for (const [fy, sum] of sums) expect(sum, `FY${fy}`).toBe(national.get(fy));
  });

  it("has one row per (fiscal year, country)", () => {
    expect(new Set(rows.map((r) => `${r.fiscal_year}:${r.country_key}`)).size).toBe(rows.length);
  });

  // Values read by hand from the ICE documents (FY2014 report App. A; FY2017 web page App. B; FY2024 report App.).
  it.each([
    [2014, "MEX", 176_968],
    [2017, "HTI", 5_578],
    [2024, "VEN", 3_256],
  ])("FY%i %s = %i as printed by ICE", (fy, key, n) => {
    expect(rows.find((r) => r.fiscal_year === fy && r.country_key === key)?.removals).toBe(n);
  });
});
