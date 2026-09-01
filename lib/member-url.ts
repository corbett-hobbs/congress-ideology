/**
 * Member profile URLs:
 *   Senate  /congress/senators/<bioguide_id>/<name-slug>
 *   House   /congress/house/<bioguide_id>/<name-slug>
 *
 * The `bioguide_id` segment is canonical and resolves the page on its own. The
 * `name-slug` is for humans and search engines; a request with the wrong slug
 * (but a valid id) is redirected to the canonical URL. Pure and isomorphic.
 */
import type { Chamber } from "./chamber";

export function chamberBasePath(chamber: Chamber): string {
  return chamber === "house" ? "/congress/house" : "/congress/senators";
}

/**
 * Lowercase, strip accents and punctuation, spaces to hyphens. Fed the display
 * name ("Chuck Schumer", "J.D. Vance", "Marjorie Taylor Greene") — nickname +
 * last name, middle names and suffixes (Jr., III) already dropped.
 */
export function slugifyName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // combining marks: Luján -> Lujan
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // "j.d." -> "jd", "o'brien" -> "obrien"
    .trim()
    .replace(/[\s-]+/g, "-");
}

export interface MemberRef {
  bioguideId: string;
  chamber: Chamber;
  /** Display name — the same string charts show. */
  name: string;
}

export function memberSlug(ref: Pick<MemberRef, "name">): string {
  return slugifyName(ref.name);
}

export function memberPath(ref: MemberRef): string {
  return `${chamberBasePath(ref.chamber)}/${ref.bioguideId}/${memberSlug(ref)}`;
}
