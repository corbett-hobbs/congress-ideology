import { displayCountryName } from "../../lib/trade-names";

/**
 * ICE country-of-citizenship names -> the site's `country_key` (the trade pipeline's
 * `country_code`, ISO 3166-1 alpha-3 plus the same user-assigned codes: `XKX` Kosovo, the former
 * entities `CSK`/`SUN`/`YUG`/`SCG`/`ANT`). ICE's spelling changes between report vintages
 * (upper-case in FY2019/20, "Peoples Republic" with and without an apostrophe, "Macedonia" ->
 * "North Macedonia", "Turkey" -> "Türkiye"), so a name is normalised first, then looked up in the
 * trade crosswalk by name, then in `ICE_ALIASES`. A name that resolves nowhere fails the build; it is
 * never guessed.
 *
 * Non-ISO entities ICE counts, with user-assigned keys (all `X` + two letters, the ISO-reserved range):
 *   XUN  Unknown       the person did not or could not state a citizenship (ICE glossary)
 *   XST  Stateless     (kept apart from Unknown; ICE prints both)
 *   XKO  Korea (unspecified)  ICE prints "Korea" as its own row beside North and South Korea; which
 *        it is cannot be told from the table, so it is not folded into either.
 * ICE's "Palestine" row maps to PSE; the trade crosswalk files the West Bank and Gaza separately.
 */

export interface CountryRef {
  country_code: string;
  name: string;
}

export const SPECIAL_ENTITIES: Readonly<Record<string, string>> = {
  XUN: "Unknown",
  XST: "Stateless",
  XKO: "Korea (unspecified)",
  PSE: "Palestine",
};

/** Normalised ICE name -> country_key, for names the trade names do not already match. */
export const ICE_ALIASES: Readonly<Record<string, string>> = {
  "antigua barbuda": "ATG",
  "bosnia herzegovina": "BIH",
  "cape verde": "CPV",
  "china peoples republic of": "CHN",
  "china peoples republic": "CHN",
  congo: "COG",
  "dem rep of the congo": "COD",
  "democratic republic of the congo": "COD",
  "east timor": "TLS",
  "ivory coast": "CIV",
  korea: "XKO",
  macau: "MAC",
  macedonia: "MKD",
  burma: "MMR",
  nauru: "NRU",
  palestine: "PSE",
  "sint maarten dutch": "SXM",
  "saint helena": "SHN",
  "saint kitts nevis": "KNA",
  "saint lucia": "LCA",
  "saint pierre and miquelon": "SPM",
  "saint vincent grenadines": "VCT",
  stateless: "XST",
  swaziland: "SWZ",
  turkiye: "TUR",
  turkey: "TUR",
  unknown: "XUN",
  "united states": "USA",
};

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/\bst\./g, "saint")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface CountryIndex {
  byName: ReadonlyMap<string, CountryRef>;
  byKey: ReadonlyMap<string, CountryRef>;
}

/** Index the trade crosswalk (`countries.json` rows that are countries or former entities). */
export function indexCountries(rows: readonly CountryRef[]): CountryIndex {
  const byName = new Map<string, CountryRef>();
  const byKey = new Map<string, CountryRef>();
  for (const r of rows) {
    byKey.set(r.country_code, r);
    const forms = [r.name, r.name.replace(/\s*\(.*\)/, "")];
    // "Name, qualifier": only when the part before the comma is unambiguous (the two Congos are not).
    if (!/^Congo,/.test(r.name)) forms.push(r.name.split(",")[0]);
    for (const f of forms) {
      const n = normalizeName(f);
      const prior = byName.get(n);
      if (prior && prior.country_code !== r.country_code) throw new Error(`ambiguous country name "${n}": ${prior.country_code} and ${r.country_code}`);
      byName.set(n, r);
    }
  }
  return { byName, byKey };
}

export class UnmappedCountryError extends Error {}

export interface ResolvedCountry {
  country_key: string;
  display_name: string;
}

export function resolveCountry(iceName: string, index: CountryIndex): ResolvedCountry {
  const n = normalizeName(iceName);
  const hit = index.byName.get(n);
  const key = hit?.country_code ?? ICE_ALIASES[n];
  if (!key) throw new UnmappedCountryError(`ICE country "${iceName}" has no country_key: add it to ICE_ALIASES in removals-country-names.ts`);
  const special = SPECIAL_ENTITIES[key];
  if (special) return { country_key: key, display_name: special };
  const ref = index.byKey.get(key);
  if (!ref) throw new UnmappedCountryError(`ICE country "${iceName}" maps to ${key}, which is not in countries.json`);
  return { country_key: key, display_name: displayCountryName(key, ref.name) };
}
