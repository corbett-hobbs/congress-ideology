import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { displayCountryName } from "./trade-names";

describe("displayCountryName", () => {
  it("replaces legal qualifiers and passes everything else through", () => {
    expect(displayCountryName("DEU", "Germany (Federal Republic of Germany)")).toBe("Germany");
    expect(displayCountryName("KOR", "South Korea (Republic of Korea)")).toBe("South Korea");
    expect(displayCountryName("CAN", "Canada")).toBe("Canada");
  });
  it("leaves no parenthetical legal qualifier or truncated name on any real partner", () => {
    const rows = JSON.parse(readFileSync("pipeline/output/countries.json", "utf8")) as { country_code: string; name: string; is_aggregate: boolean }[];
    for (const r of rows.filter((x) => !x.is_aggregate)) {
      const shown = displayCountryName(r.country_code, r.name);
      expect(shown, r.country_code).not.toMatch(/Republic of|formerly|administered by|, except|Federal Republic|\(former\)/);
    }
  });
});
