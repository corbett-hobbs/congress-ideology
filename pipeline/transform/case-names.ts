/**
 * Re-casing SCDB case names (all capitals) for reading: "NLRB v. AFL-CIO" must not become "Nlrb v. Afl-Cio" and
 * "SMITH v. U.S. DEPT. OF STATE" must not become "Smith V. U.S. Dept. Of State".
 *
 * Four layers, in order, so a reviewer can see why any word came out as it did:
 *  0. A word that already has a lower-case letter in the source is left exactly as written (newer SCDB names are partly cased:
 *     "Yellow CAB Co." stays; so does "Sandoz Inc.").
 *  1. ACRONYMS: a curated lookup (federal agencies, unions and organisations, company forms and tickers). Add to it when a
 *     new release brings one (`decisions.test.ts` lists the ones the data uses and fails if a listed one regresses).
 *  2. Structure: dotted initials and acronyms ("U.S.", "D.C.", "J."), Roman numerals, a token with no vowel ("CSX", "BNSF",
 *     "MBNA", "BP") and a name part after an apostrophe or hyphen ("O'BRIEN", "SMITH-JONES").
 *  3. Small words stay lower case mid-name ("v.", "of", "the", "et al.", "dba").
 *  4. Everything else is Title Case, with "Mc" names capitalised ("McDonnell").
 * Unusual company acronyms outside the lookup come out as ordinary words ("Amgen", "Asarco" are in it; "Xyz" would not be).
 */

const AGENCIES = ["EEOC", "EPA", "FEC", "FCC", "FDA", "FERC", "FTC", "SEC", "IRS", "INS", "HUD", "NLRB", "OSHA", "USDA", "TVA", "FAA", "FBI", "CIA", "NSA", "DEA", "ATF", "SSA", "HHS", "DOJ", "DOD", "DHS", "NASA", "NOAA", "OPM", "GSA", "FDIC", "FHA", "FEMA", "NRC", "ICC", "FPC", "FRB", "RFC", "NTSB", "FMC", "USPS", "TSA", "CFPB", "OMB"];
const ORGANISATIONS = ["AFL", "CIO", "CLC", "AFLCIO", "AFL-CIO", "UAW", "NAACP", "NCAA", "ACLU", "NFL", "NBA", "PGA", "IBEW", "SEIU", "AFSCME", "UMW", "ILA", "AARP", "NRA", "YMCA", "YWCA", "ABC", "CBS", "NBC", "NAFTA", "OPEC", "NATO"];
const COMPANIES = ["LLC", "LLP", "LP", "PLC", "AG", "SA", "NV", "USA", "USAA", "US", "IBM", "AT&T", "ITT", "GTE", "GMC", "GM", "BP", "CSX", "BNSF", "ERISA", "PPL", "MBNA", "FSB", "CTS", "ANR", "TWA", "UPS", "CVS", "HBO", "CNN", "ASARCO", "NY", "NJ", "DC"];
const ROMAN = ["II", "III", "IV", "VI", "VII", "VIII", "IX"];

export const ACRONYMS: ReadonlySet<string> = new Set([...AGENCIES, ...ORGANISATIONS, ...COMPANIES, ...ROMAN, "U.S.", "U.S.A.", "D.C.", "N.Y."]);

/** Lower case when not the first word (the ones that carry a trailing comma or period are matched without it). */
const SMALL_WORDS = new Set(["v.", "vs.", "of", "the", "and", "for", "in", "on", "to", "a", "an", "at", "by", "ex", "rel.", "de", "la", "et", "al.", "al", "dba", "aka", "fka", "ux.", "vir", "etc.", "etc"]);

/** Vowel-less abbreviations that are not acronyms ("LTD", "BD"): Title Case, not capitals. */
const ABBREVIATIONS = new Set(["LTD", "MFG", "MGMT", "ASSN", "BD", "BROS", "SR", "JR", "ST", "MT", "FT", "DR", "MR", "MRS", "CTR", "CNTY", "SYS", "CONSTR", "COMM", "DEPT", "DIST", "HWY", "BLDG"]);

const VOWEL = /[AEIOUY]/i;

/** Re-read a name whose UTF-8 bytes were decoded as latin-1 ("Womenâ\u0080\u0099s" -> "Women’s"). */
export function repairEncoding(input: string): string {
  if (!/[ÂÃâ]/.test(input)) return input;
  const fixed = Buffer.from(input, "latin1").toString("utf8");
  return fixed.includes("�") ? input : fixed;
}

const capitaliseParts = (lower: string): string =>
  lower
    .replace(/(^|[-/(–’'&])([a-zà-ÿ])/g, (m, pre: string, c: string, off: number) => ((pre === "'" || pre === "’") && off > 1 ? m : pre + c.toUpperCase()))
    .replace(/^Mc([a-z])/, (_m, c: string) => `Mc${c.toUpperCase()}`);

function word(w: string, first: boolean): string {
  // Peel punctuation off both ends ("(USA)", "Co.,") so the lookup sees the bare word; it goes back on untouched.
  const lead = /^[("'\[]+/.exec(w)?.[0] ?? "";
  const trail = /[,;:)\]"]+$/.exec(w.slice(lead.length))?.[0] ?? "";
  const core = w.slice(lead.length, w.length - trail.length);
  if (!core) return w;
  return lead + bare(core, first && !lead) + trail;
}

function bare(core: string, first: boolean): string {
  const upper = core.toUpperCase();
  const lower = core.toLowerCase();
  if (/[a-z]/.test(core) && !SMALL_WORDS.has(lower)) return core; // 0. already cased by SCDB
  if (ACRONYMS.has(upper)) return upper; // 1. curated
  // A chain with an acronym in it ("AFL-CIO-CLC", "AFL-CIO"'s cousins) is cased part by part.
  if (/^[A-Za-z&]+(-[A-Za-z&]+)+$/.test(core) && core.split("-").some((p) => ACRONYMS.has(p.toUpperCase()))) return core.split("-").map((p) => bare(p, false)).join("-");
  if (/^([A-Z]\.)+[A-Z]?\.?$/.test(core) || /^[A-Z]\.$/.test(core)) return core; // 2. "U.S.", "J.", "D.C."
  if (!first && SMALL_WORDS.has(lower)) return lower; // 3. small words
  if (core.length >= 2 && core.length <= 6 && /^[A-Z]+$/.test(core) && !VOWEL.test(core) && !ABBREVIATIONS.has(core)) return core; // 2. vowel-less: "CSX"
  return capitaliseParts(lower); // 4. Title Case
}

/** SCDB capitalises case names; make them readable (see the layers above). */
export function prettyCaseName(input: string): string {
  return repairEncoding(input)
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w, i) => word(w, i === 0))
    .join(" ");
}
