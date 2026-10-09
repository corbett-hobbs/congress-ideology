/**
 * Law page URLs: /congress/laws/<law_id>/<title-slug>.
 * `law_id` (`118-pub-90`) is canonical and resolves the page on its own; a wrong slug with a valid id redirects to the
 * canonical URL, like the member, committee and justice routes. Pure and isomorphic.
 */
import { slugifyName } from "./member-url";

export const LAWS_BASE_PATH = "/congress/laws";
const MAX_SLUG = 70;

/** The title as a slug, cut at a word boundary so a long old title ("A joint resolution to provide for ...") stays a usable URL. */
export function lawSlug(title: string): string {
  const full = slugifyName(title);
  if (!full) return "law";
  if (full.length <= MAX_SLUG) return full;
  const cut = full.slice(0, MAX_SLUG);
  const at = cut.lastIndexOf("-");
  return (at > 20 ? cut.slice(0, at) : cut).replace(/-+$/, "");
}

export const lawId = (congress: number, number: number) => `${congress}-pub-${number}`;

export const lawPath = (id: string, title: string) => `${LAWS_BASE_PATH}/${id}/${lawSlug(title)}`;

/** `118-pub-90` -> `{ congress: 118, number: 90 }`; null for anything else. */
export function parseLawId(raw: string): { congress: number; number: number } | null {
  const m = /^(\d{1,3})-pub-(\d{1,5})$/.exec(raw);
  return m ? { congress: Number(m[1]), number: Number(m[2]) } : null;
}

const BILL_SLUG: Record<string, string> = { hr: "house-bill", s: "senate-bill", hjres: "house-joint-resolution", sjres: "senate-joint-resolution" };

/** The bill's page on Congress.gov, or null for a bill type we cannot map. */
export function congressGovBillUrl(congress: number, billType: string, billNumber: string): string | null {
  const slug = BILL_SLUG[billType];
  if (!slug) return null;
  const v = congress % 100;
  const ord = `${congress}${v >= 11 && v <= 13 ? "th" : (["th", "st", "nd", "rd"][congress % 10] ?? "th")}`;
  return `https://www.congress.gov/bill/${ord}-congress/${slug}/${billNumber}`;
}
