/**
 * Wikipedia's "List of acts of the Nth United States Congress" -> one row per public law with its article title (null when
 * the act has no article of its own). Rendered HTML from the MediaWiki parse API. Pure parsing; `wikipedia-laws.ts` does the
 * requests.
 */
export interface WikiLawRow {
  /** "117-2", from the law-number cell. */
  law_id: string;
  /** Article title, or null (no link, or a red link). */
  title: string | null;
  /** The short title as the list prints it ("(No short title)" gives null). */
  name: string | null;
}

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", "#39": "'", lt: "<", gt: ">", nbsp: " " };
const decode = (s: string): string => s.replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e] ?? m);
const stripTags = (s: string): string => decode(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

export function parseActList(html: string): WikiLawRow[] {
  const out: WikiLawRow[] = [];
  for (const row of html.split("<tr>").slice(1)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]!);
    if (cells.length < 3) continue;
    const id = /^\s*(\d+)[-–](\d+)\s*$/.exec(stripTags(cells[0]!));
    if (!id) continue;
    const cell = cells[2]!;
    const text = stripTags(cell);
    const a = /<a\s([^>]*)>/i.exec(cell);
    let title: string | null = null;
    if (a && !/class="[^"]*\bnew\b/.test(a[1]!)) {
      const href = /href="\/wiki\/([^"#]+)/.exec(a[1]!)?.[1];
      if (href) title = decodeURIComponent(href).replaceAll("_", " ");
    }
    out.push({ law_id: `${id[1]}-${id[2]}`, title, name: /^\(No short title\)$/i.test(text) || text === "" ? null : text });
  }
  return out;
}
