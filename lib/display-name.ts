import type { Legislator } from "./entities";

/**
 * Given names the upstream data lacks a `nickname` for, keyed by bioguide id.
 * Each matches how the member is styled in `official_full`.
 */
const GIVEN_NAME_OVERRIDES: Readonly<Record<string, string>> = {
  L000598: "Nick", // Nicolas LaLota
  C001131: "Greg", // Gregorio Casar
  H001094: "Val", // Valerie Hoyle
};

/**
 * Surnames shortened to match `official_full`, keyed by bioguide id. The
 * upstream `last` holds the fuller legal surname.
 */
const FAMILY_NAME_OVERRIDES: Readonly<Record<string, string>> = {
  G000608: "Graham", // Darline Graham Nordone
  H001103: "Hernández", // Pablo José Hernández Rivera
};

/** The surname a member goes by. */
export function familyName(
  name: Legislator["name"],
  bioguideId?: string,
): string {
  const override = bioguideId ? FAMILY_NAME_OVERRIDES[bioguideId] : undefined;
  return override ?? name.last;
}

/**
 * The first name a member goes by. Preference order:
 *  0. `GIVEN_NAME_OVERRIDES`
 *  1. `nickname` ("Chuck")
 *  2. a parenthetical inside `first` ("Charles (Chuck)" -> "Chuck")
 *  3. `middle` when `first` is only an initial ("J." + "French" -> "French")
 *  4. `first`
 */
export function givenName(
  name: Legislator["name"],
  bioguideId?: string,
): string {
  const override = bioguideId ? GIVEN_NAME_OVERRIDES[bioguideId] : undefined;
  if (override) return override;
  if (name.nickname) return name.nickname;
  const paren = name.first.match(/\(([^)]+)\)/);
  if (paren) return paren[1];
  const isInitial = /^(?:[A-Z]\.?)+$/.test(name.first);
  if (isInitial && name.middle && !/^(?:[A-Z]\.?)+$/.test(name.middle)) {
    return name.middle;
  }
  return name.first;
}

/** Display name, e.g. "French Hill" (given name + last, no suffix). */
export function displayName(
  name: Legislator["name"],
  bioguideId?: string,
): string {
  return `${givenName(name, bioguideId)} ${familyName(name, bioguideId)}`;
}
