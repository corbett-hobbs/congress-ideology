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
  return `${givenName(name, bioguideId)} ${name.last}`;
}
