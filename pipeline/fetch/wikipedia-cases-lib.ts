/**
 * Wikipedia's case indexes -> one row per listed case with its article (or none). Two kinds of page, both rendered HTML
 * from the MediaWiki parse API:
 *   - "List of United States Supreme Court cases, volume N": a row per case with the article link (a red link when the
 *     case has no article), a Justia link that carries the volume and the page (older volumes) or the docket (newer),
 *     and the year decided.
 *   - "<YYYY> term opinions of the Supreme Court of the United States": the same cases by term, with the U.S. Reports
 *     cite beside the link ("609 U.S. 30", or "609 U.S. ___" before the page is assigned). It covers decisions too new
 *     for a volume list.
 * Pure parsing; `wikipedia-cases.ts` does the requests.
 */
export interface WikiCaseEntry {
  /** Article title, or null when the list links a page that does not exist (a red link). */
  title: string | null;
  /** The name as the list prints it. */
  name: string;
  volume: number | null;
  /** U.S. Reports page, when the list gives one. */
  page: number | null;
  docket: string | null;
  /** Year decided, when the row says. */
  year: number | null;
  /** Which page it came from. */
  source: string;
}

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", "#39": "'", lt: "<", gt: ">", nbsp: " ", "#32": " " };
const decode = (s: string): string => s.replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e] ?? (e.startsWith("#x") ? String.fromCodePoint(parseInt(e.slice(2), 16)) : /^#\d+$/.test(e) ? String.fromCodePoint(Number(e.slice(1))) : m));
const stripTags = (s: string): string => decode(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

/** The first article link in a cell: its title (null for a red link) and the text it shows. */
function firstLink(cell: string): { title: string | null; text: string } | null {
  const m = /<a\s([^>]*)>([\s\S]*?)<\/a>/i.exec(cell);
  if (!m) return null;
  const attrs = m[1]!;
  const text = stripTags(m[2]!);
  if (/class="[^"]*\bnew\b/.test(attrs)) return { title: null, text };
  const href = /href="\/wiki\/([^"#]+)/.exec(attrs)?.[1];
  if (!href) return null;
  return { title: decodeURIComponent(href).replaceAll("_", " "), text };
}

const yearIn = (s: string): number | null => {
  const y = /\b(1[789]\d\d|20\d\d)\b/.exec(s)?.[1];
  return y ? Number(y) : null;
};

/** Rows of a "List of United States Supreme Court cases, volume N" page (a table, or a bullet list on some volumes). `volume` is the page's own number. */
export function parseVolumePage(html: string, volume: number, source: string): WikiCaseEntry[] {
  const out: WikiCaseEntry[] = [];
  if (!html.includes('<tr class="vevent">')) {
    for (const m of html.matchAll(/<li>(<i>[\s\S]*?)<\/li>/g)) {
      const link = firstLink(m[1]!);
      const j = /\/us\/(\d+)\/([^/"]+)\//.exec(m[1]!);
      if (!link || !j) continue;
      out.push({ title: link.title, name: link.text, volume: Number(j[1]), page: /^\d+$/.test(j[2]!) ? Number(j[2]) : null, docket: /-/.test(j[2]!) ? j[2]! : null, year: yearIn(stripTags(m[1]!).replace(/^.*?\bU\.S\.\s*\S+/, "")), source });
    }
    return out;
  }
  for (const row of html.split(/<tr class="vevent">/).slice(1)) {
    const end = row.indexOf("</tr>");
    const body = end < 0 ? row : row.slice(0, end);
    const cells = body.split(/<\/td>/);
    const link = firstLink(cells[0] ?? "");
    if (!link) continue;
    // /us/<volume>/<page-or-docket>/ in the Justia link; docket numbers carry a hyphen.
    const j = /\/us\/(\d+)\/([^/"]+)\//.exec(cells[1] ?? "");
    const key = j?.[2] ?? null;
    out.push({
      title: link.title,
      name: link.text,
      volume: j ? Number(j[1]) : volume,
      page: key && /^\d+$/.test(key) ? Number(key) : null,
      docket: key && /-/.test(key) ? key : null,
      year: yearIn(stripTags(cells[2] ?? "")),
      source,
    });
  }
  return out;
}

/** Rows of a "<YYYY> term opinions ..." page. */
export function parseTermPage(html: string, source: string): WikiCaseEntry[] {
  const out: WikiCaseEntry[] = [];
  for (const row of html.split(/<tr>/).slice(1)) {
    const m = /<td class="scotus-termlist-case">([\s\S]*?)<\/td>/.exec(row);
    if (!m) continue;
    const link = firstLink(m[1]!);
    if (!link) continue;
    const cite = /(\d+)\s+U\.S\.\s+(\d+|_+)/.exec(stripTags(m[1]!));
    const dates = [...row.matchAll(/<td class="scotus-termlist-date">([\s\S]*?)<\/td>/g)].map((d) => stripTags(d[1]!));
    out.push({
      title: link.title,
      name: link.text,
      volume: cite ? Number(cite[1]) : null,
      page: cite && /^\d+$/.test(cite[2]!) ? Number(cite[2]) : null,
      docket: null,
      year: yearIn(dates[1] ?? "") ?? yearIn(dates[0] ?? ""),
      source,
    });
  }
  return out;
}
