/**
 * InsideGov's own "commemorative law" flag for the Laws track (no file I/O). Congress.gov's policy area "Commemorations" was
 * applied in only two stretches (1985-88 and 1997-2008), so the same kind of law sits under other areas in every other year.
 * This reads the law's title instead, with the same rules for every year, so the Commemorations series can be compared across time.
 *
 * A law is commemorative when CRS itself filed it under "Commemorations", or when its title:
 *   - observance: designates, proclaims or recognizes a day, week, month, year or anniversary;
 *   - naming:     names or renames a post office, building, facility, road, bridge, dam or similar;
 *   - honor:      awards a medal, authorizes a commemorative coin, confers an honor, or congratulates, commends or pays tribute;
 *   - memorial:   authorizes or approves the location of a memorial, or accepts a statue for the Capitol.
 * Laws that only create or relabel protected land (wilderness, wild and scenic rivers, national park units and the like) are not
 * commemorative, whatever their wording. The CRS area stays on the law as `crs_area_id`; nothing is removed from the source.
 * Rules and the check against the years CRS did label: docs/LAWS_METHODOLOGY.md.
 */

export const COMMEMORATIVE_BASES = ["observance", "naming", "honor", "memorial"] as const;
export type CommemorativeBasis = (typeof COMMEMORATIVE_BASES)[number];

const VERB = "(?:designat\\w*|proclaim\\w*|declar\\w*|recogniz\\w*|commemorat\\w*|celebrat\\w*|observ\\w*|marking)";
const NOUN = "(?:week|day|month|year|decade|anniversary|bicentennial|centennial|sesquicentennial|bicentenary|quincentenary|observance|jubilee|celebration|birthday)";
const PLACE =
  "(?:post office|postal|federal (?:building|office|record)|courthouse|court house|building|medical center|clinic|facility|facilities|bridge|dam|lock|reservoir|visitor|center|station|highway|road|route|way|park|pier|lighthouse|hospital|laborator|terminal|trail|plaza|tunnel|airport|annex|campus|ship|vessel|room|hall|library|museum|boulevard|street|avenue|overlook|lake|river|mountain|peak|island|canal|channel|harbor|school|headquarters|armory|depot|range|segment|portion|corridor)";

const RULES: { basis: CommemorativeBasis; re: RegExp }[] = [
  {
    basis: "observance",
    re: new RegExp(`\\b${VERB}\\b.*\\b${NOUN}\\b|\\b(?:national|heritage|remembrance|awareness|observance) (?:day|week|month)\\b|patriotic and national observances|flag .* on (?:father|mother)'s day|\\b(?:centennial|bicentennial|sesquicentennial|quincentenary|quincentennial) (?:commission|celebration|jubilee)|\\b(?:commemoration|centennial|bicentennial|anniversary) commission`, "i"),
  },
  {
    basis: "naming",
    re: new RegExp(
      `\\b(?:designat\\w*|redesignat\\w*|nam(?:e|ing)|renam\\w*)\\b.*(?:\\b${PLACE}\\b.*\\bas (?:the|an?)\\b|\\bas (?:the|"|“|')|\\bthe ["“])|\\b(?:name|rename|redesignat\\w*|designat\\w*)\\b[^,]{0,120}\\b(?:federal (?:building|office)|post office|clinic|control tower|aeronautical center|dam)\\b|\\bchange the name of\\b.*\\b(?:dam|lake|reservoir|strip|building|center)\\b|facilit(?:y|ies) of the (?:united states )?postal service|designations? for united states postal service|\\b(?:designation|naming|renaming|redesignation) act\\b`,
      "i",
    ),
  },
  {
    basis: "honor",
    re: /commemorat|memorializ|\bin (?:honor|memory|recognition|tribute) of\b|\bto honor\b|\bhonor the\b|\btribute\b|\bcongratulat|\bcommend(?:s|ing)?\b|gold medal|medal of valor|honorary (?:citizen|veteran|appointment|promotion)|posthumous|\b(?:award|awarding|confer|present)\w*\b.*\bmedal of honor/i,
  },
  {
    basis: "memorial",
    re: /\b(?:erect|construct|establish\w*|location of|site for|dedication of|approv\w+)\b.*\bmemorial\b|\bcommemorative (?:work|site|structure)\b|\b(?:statue|bust|portrait) (?:of|depicting)\b.*\b(?:capitol|display|place|accept)|\b(?:obtain|accept)\b.*\b(?:statue|bust)\b/i,
  },
];

/** Only a resolution is called "Recognizing ..." / "Commending ..." with no Act in the title; an Act of that name makes a program. */
const TITLE_START = /^(?:an? (?:joint )?resolution )?(?:recogniz|commend|congratulat|salut|mourn)\w*\b/i;

/** What a naming title says it designates, after "as the/a": land designations are protected-area law, not honorific naming. */
const LAND_TAIL = /wilderness|wild and scenic|component of|affiliated area|unit of|national trails? system|national historic trail\b|national (?:park|monument|preserve|recreation area|conservation area|heritage area|historic site|historical park|wildlife refuge|seashore|lakeshore|battlefield) (?:system|unit)/i;
const LAND_ANY = /\bstudy\b|\bboundar/i;
const NOT_A_YEAR_OF_OBSERVANCE = /fiscal year|calendar year|taxable year|school year|marketing year|crop year|plan year|program year|budget year|day care|day-care|years? of age/i;
/** "designate the Secretary of the Treasury as the lead agency" names an officer to a duty, not a place. */
const OFFICER_DESIGNATED = /\b(?:designat\w*|name)\s+(?:the\s+)?(?:secretary|administrator|director|commissioner|attorney general|comptroller|federal reserve|chairman|president)\b/i;
const AS = /\bas (?:the|an?|"|“|')/i;

/** The rule that makes `title` commemorative, or null. The first rule in the order above that fits is the basis. */
export function commemorativeBasis(title: string): CommemorativeBasis | null {
  const t = title.trim();
  for (const { basis, re } of RULES) {
    if (!re.test(t) && !(basis === "honor" && TITLE_START.test(t) && !/\bAct(?: of \d{4})?\.?$/.test(t))) continue;
    if (basis === "naming") {
      const m = AS.exec(t);
      if ((m && LAND_TAIL.test(t.slice(m.index))) || LAND_ANY.test(t) || OFFICER_DESIGNATED.test(t)) continue;
    }
    if (basis === "observance" && NOT_A_YEAR_OF_OBSERVANCE.test(t)) continue;
    if (basis === "memorial" && /national (?:memorial|monument|historic|park)|memorial (?:council|museum)/i.test(t)) continue;
    return basis;
  }
  return null;
}
