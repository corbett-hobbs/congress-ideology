import { describe, expect, it } from "vitest";
import { filterCountries } from "./trade-country-search";
import type { TradeCountryRef } from "./trade-types";

const c = (code: string, name: string): TradeCountryRef => ({ code, name, firstYear: 1991, lastYear: 2026 });
const list = [c("CAN", "Canada"), c("CHN", "China"), c("COD", "Congo (Kinshasa)"), c("CIV", "Cote d'Ivoire"), c("TUR", "Türkiye"), c("KOR", "South Korea"), c("PRK", "North Korea"), c("ZAF", "South Africa")];
const names = (q: string) => filterCountries(list, q).map((x) => x.name);

describe("filterCountries", () => {
  it("returns everything for an empty or blank query", () => {
    expect(names("")).toHaveLength(list.length);
    expect(names("   ")).toHaveLength(list.length);
  });
  it("ranks names that start with the text first, then later words, then substrings", () => {
    expect(names("ko")).toEqual(["South Korea", "North Korea"]);
    expect(names("c")).toEqual(["Canada", "China", "Congo (Kinshasa)", "Cote d'Ivoire", "South Africa"]);
    expect(names("k")).toEqual(["Congo (Kinshasa)", "South Korea", "North Korea", "Türkiye"]); // word starts before plain substrings
  });
  it("ignores case and accents", () => {
    expect(names("TURK")).toEqual(["Türkiye"]);
    expect(names("turkiye")).toEqual(["Türkiye"]);
  });
  it("finds a later word", () => expect(names("africa")).toEqual(["South Africa"]));
  it("returns nothing for no match", () => expect(names("zzz")).toEqual([]));
});
