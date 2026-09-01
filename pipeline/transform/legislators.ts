import type { Legislator as RawLegislator } from "../validate/schemas";
import type { Legislator } from "../../lib/entities";

function birthYear(birthday: string | undefined): number | undefined {
  if (!birthday) return undefined;
  const y = Number(birthday.slice(0, 4));
  return Number.isInteger(y) ? y : undefined;
}

/** Drop keys whose value is `undefined` so JSON output is stable and minimal. */
function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as T;
}

/** One `legislators.json` row per person: stable identity only. */
export function buildLegislators(raw: readonly RawLegislator[]): Legislator[] {
  return raw
    .map((L): Legislator => {
      const name = compact({
        first: L.name.first,
        last: L.name.last,
        middle: L.name.middle,
        nickname: L.name.nickname,
        suffix: L.name.suffix,
        official_full: L.name.official_full,
      });
      return compact({
        bioguide_id: L.id.bioguide,
        name,
        birth_year: birthYear(L.bio.birthday),
        gender: L.bio.gender,
      });
    })
    .sort((a, b) => a.bioguide_id.localeCompare(b.bioguide_id));
}
