import type { Legislator } from "./entities";

/**
 * The first name a member goes by. Preference order:
 *  1. `nickname` ("Chuck")
 *  2. a parenthetical inside `first` ("Charles (Chuck)" -> "Chuck")
 *  3. `middle` when `first` is only an initial ("J." + "French" -> "French")
 *  4. `first`
 */
export function givenName(name: Legislator["name"]): string {
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
export function displayName(name: Legislator["name"]): string {
  return `${givenName(name)} ${name.last}`;
}
