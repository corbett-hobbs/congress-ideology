import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseScdb } from "./decisions";
import { ACRONYMS, prettyCaseName, repairEncoding } from "./case-names";

describe("prettyCaseName", () => {
  it.each([
    // agencies, unions and organisations come out as acronyms, whatever their length
    ["NLRB v. AFL-CIO", "NLRB v. AFL-CIO"],
    ["EPA v. EME HOMER CITY GENERATION", "EPA v. Eme Homer City Generation"],
    ["UNITED STEELWORKERS OF AMERICA, AFL-CIO-CLC v. WEBER", "United Steelworkers of America, AFL-CIO-CLC v. Weber"],
    ["LOCAL 761, AFLCIO v. NLRB", "Local 761, AFLCIO v. NLRB"],
    ["FEDERAL COMMUNICATIONS COMMISSION v. FCC", "Federal Communications Commission v. FCC"],
    ["UAW v. JOHNSON CONTROLS, INC.", "UAW v. Johnson Controls, Inc."],
    // company forms and tickers, including punctuation around them
    ["CREDIT SUISSE SECURITIES (USA) LLC v. BILLING", "Credit Suisse Securities (USA) LLC v. Billing"],
    ["CSX TRANSPORTATION, INC. v. MCBRIDE", "CSX Transportation, Inc. v. McBride"],
    ["AT&T CORP. v. HULTEEN", "AT&T Corp. v. Hulteen"],
    ["BNSF RAILWAY CO. v. LOOS", "BNSF Railway Co. v. Loos"],
    // a vowel-less word is an acronym, unless it is an abbreviation
    ["MATSUSHITA ELECTRIC INDUSTRIAL CO., LTD. v. ZENITH", "Matsushita Electric Industrial Co., Ltd. v. Zenith"],
    ["OVERSIGHT AND MANAGEMENT BD FOR PUERTO RICO v. CENTRO", "Oversight and Management Bd for Puerto Rico v. Centro"],
    // real words stay words
    ["POLAR ICE CREAM CO. v. ANDREWS", "Polar Ice Cream Co. v. Andrews"],
    ["UNITED STATES v. YELLOW CAB CO.", "United States v. Yellow Cab Co."],
    // initials, dotted acronyms, small words, Mc/O' names, Roman numerals
    ["SMITH, ET AL. v. U.S. DEPT. OF STATE", "Smith, et al. v. U.S. Dept. of State"],
    ["J. E. M. AG SUPPLY, INC., DBA FARM ADVANTAGE v. PIONEER", "J. E. M. AG Supply, Inc., dba Farm Advantage v. Pioneer"],
    ["O'BRIEN v. MCDONNELL DOUGLAS CORP.", "O'Brien v. McDonnell Douglas Corp."],
    ["MONTGOMERY v. CARIBE TRANSPORT II, LLC", "Montgomery v. Caribe Transport II, LLC"],
    ["WATSON v. WASHINGTON, D.C.", "Watson v. Washington, D.C."],
    // already cased by SCDB: left exactly as written
    ["Apple Inc. v. Pepper (iPhone) et al.", "Apple Inc. v. Pepper (iPhone) et al."],
    ["Sandoz Inc. v. AMGEN Inc.", "Sandoz Inc. v. Amgen Inc."],
  ])("%s", (raw, want) => {
    expect(prettyCaseName(raw)).toBe(want);
  });

  it("repairs UTF-8 that was read as latin-1", () => {
    expect(repairEncoding("DANâ\u0080\u0099S")).toBe("DAN’S");
    expect(repairEncoding("MUÃ±OZ")).toBe("MUñOZ");
    expect(repairEncoding("PLAIN")).toBe("PLAIN");
    expect(prettyCaseName("WILLIAMSâ\u0080\u0093YULEE v. FLORIDA BAR")).toBe("Williams–Yulee v. Florida Bar");
  });

  it("never mangles a curated acronym anywhere in the real data", () => {
    const text = readFileSync("pipeline/raw/scdb/SCDB_2026_01_caseCentered_Citation.csv").toString("latin1");
    const names = parseScdb(text).map((r) => prettyCaseName(r.caseName));
    const title = (a: string) => a[0] + a.slice(1).toLowerCase();
    // Acronyms that are also ordinary words or abbreviations in some names are skipped (a "Sec." is the full-stop form).
    const wordLike = new Set(["US", "AG", "SA", "NV", "ICE", "GM", "NY", "NJ", "DC", "II", "IV", "VI"]);
    const bad: string[] = [];
    for (const n of names) {
      for (const tok of n.split(/[\s(),;]+/)) {
        for (const a of ACRONYMS) if (!wordLike.has(a) && tok === title(a) && a.length >= 3) bad.push(`${tok} in "${n}"`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    // And no name keeps a shouted word of its own: everything left in capitals is a short acronym.
    const shouted = names.flatMap((n) => n.split(/[\s(),;]+/).filter((t) => /^[A-Z]{7,}$/.test(t)));
    expect(shouted).toEqual([]);
  });
});
