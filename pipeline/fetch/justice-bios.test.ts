import { describe, expect, it } from "vitest";
import { candidateTitles, isPublicDomainLicense, judgeMatch } from "./justice-bios";
import type { Justice } from "../../lib/court-entities";

const j = (over: Partial<Justice["name"]> = {}) =>
  ({ name: { first: "John", middle: "Paul", last: "Stevens", full: "John Paul Stevens", ...over } }) as Justice;

const api = (extract: string, type = "standard") => ({ type, extract, description: "" });
const ok = { birth: 1920, death: 2019 };

describe("judgeMatch", () => {
  const person = { birth_year: 1920, death_year: 2019 };
  it("accepts a Supreme Court lead whose Wikidata years match FJC", () => {
    expect(judgeMatch(person, api("He served as an associate justice of the Supreme Court."), ok).ok).toBe(true);
  });
  it("rejects a namesake born in another year (John Marshall Harlan vs. II)", () => {
    const v = judgeMatch(person, api("an associate justice of the Supreme Court"), { birth: 1833, death: 1911 });
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/birth year 1833/);
  });
  it("rejects a disambiguation page and a non-justice lead", () => {
    expect(judgeMatch(person, api("John Stevens may refer to", "disambiguation"), ok).ok).toBe(false);
    expect(judgeMatch(person, api("an American sailor"), ok).ok).toBe(false);
  });
  it("rejects a matching birth year with a wrong or missing death year", () => {
    expect(judgeMatch(person, api("the Supreme Court"), { birth: 1920, death: 2010 }).ok).toBe(false);
    expect(judgeMatch(person, api("the Supreme Court"), { birth: 1920, death: null }).ok).toBe(false);
    expect(judgeMatch({ birth_year: 1920, death_year: null }, api("Chief Justice"), { birth: 1920, death: null }).ok).toBe(true);
  });
});

describe("isPublicDomainLicense", () => {
  it("takes public domain and CC0, nothing else", () => {
    expect(isPublicDomainLicense({ LicenseShortName: "Public domain" })).toBe(true);
    expect(isPublicDomainLicense({ LicenseShortName: "CC0" })).toBe(true);
    expect(isPublicDomainLicense({ LicenseShortName: "PD-US-Gov" })).toBe(true);
    expect(isPublicDomainLicense({ LicenseShortName: "CC BY-SA 3.0" })).toBe(false);
    expect(isPublicDomainLicense({ LicenseShortName: "Fair use" })).toBe(false);
    expect(isPublicDomainLicense({})).toBe(false);
  });
});

describe("candidateTitles", () => {
  it("tries the fullest name first and dedupes", () => {
    const c = candidateTitles(j());
    expect(c[0]).toBe("John Paul Stevens");
    expect(c).toContain("John P. Stevens");
    expect(c).toContain("John Stevens (justice)");
    expect(new Set(c).size).toBe(c.length);
  });
});
