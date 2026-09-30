/**
 * Justice profile URLs: /supreme-court/justices/<justice_id>/<name-slug>.
 * `justice_id` (SCDB) resolves the page; a wrong slug with a valid id redirects
 * to the canonical URL, exactly like the member routes (lib/member-url.ts).
 */
import { slugifyName } from "./member-url";

export interface JusticeRefLike {
  id: number;
  /** Display name ("John Stevens"). */
  name: string;
}

export const justiceSlug = (j: Pick<JusticeRefLike, "name">) => slugifyName(j.name);

export const justicePath = (j: JusticeRefLike) =>
  `/supreme-court/justices/${j.id}/${justiceSlug(j)}`;
