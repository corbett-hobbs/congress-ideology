/**
 * Senator profile URLs: /congress/senators/<bioguide_id>/<name-slug>
 *
 * The `bioguide_id` segment is canonical and resolves the page on its own. The
 * `name-slug` is for humans and search engines; a request with the wrong slug
 * (but a valid id) is redirected to the canonical URL. Pure and isomorphic —
 * used by generateStaticParams and by link-building in client components.
 */

const SENATORS_BASE = "/congress/senators";

/**
 * Lowercase, strip accents and punctuation, spaces to hyphens. Fed the
 * display name ("Chuck Schumer", "J.D. Vance", "Angus King") — nickname +
 * last name, with middle names and suffixes (Jr., III) already dropped.
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

export interface SenatorRef {
  bioguideId: string;
  /** Display name — the same string charts show. */
  name: string;
}

export function senatorSlug(ref: SenatorRef): string {
  return slugifyName(ref.name);
}

export function senatorPath(ref: SenatorRef): string {
  return `${SENATORS_BASE}/${ref.bioguideId}/${senatorSlug(ref)}`;
}
