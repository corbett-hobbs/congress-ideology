/**
 * Editable facts for the About page and the footer, in one place.
 *
 * A blank string means "omit that sentence": the About page never prints a
 * placeholder. Fill a value in and the matching sentence appears.
 */
export const siteInfo = {
  /** Who builds and maintains the site, e.g. "one person" or a name. Blank = the "Who's behind it" section is left out. */
  builderName: "",
  /** One sentence on funding / ads, shown under Independence. Blank = omitted. */
  fundingStatement: "",
  /** One or two sentences on why it was built, shown under "Why it exists". Blank = omitted. */
  whyIBuiltIt: "",
  /** The public repo (the old congress-ideology name redirects here). */
  githubUrl: "https://github.com/corbett-hobbs/insidegov",
} as const;

/** Link to a methodology write-up in the public repo, on `main`. */
export function docUrl(docPath: string): string {
  return `${siteInfo.githubUrl}/blob/main/${docPath}`;
}

/** Top-level pages that sit outside every vertical: no tab is active, no section nav,
 *  and the wordmark is a plain link to "/" (like the hub). */
export const STATIC_PAGES = ["/about", "/methodology", "/contact"] as const;
