import { mkdir, rename, writeFile } from "node:fs/promises";
import { RAW_DIR, run } from "./lib";

/**
 * Executive orders, 1994-present, from the Federal Register API
 * (federalregister.gov/api/v1, free, no key). Fetched directly from the source.
 *
 * `executive_order_number`, `executive_order_notes` and `president` are NOT in
 * the API's default field set — they only come back when asked for with
 * `fields[]`, which is why the field list below is explicit. The snapshot is
 * one row per EO, sorted by EO number, one row per line, so a refresh diffs as
 * added/changed lines. Volatile fields (page views, image URLs, public-
 * inspection links) are deliberately not requested.
 *
 * Freshness: .github/workflows/executive-orders-freshness.yml.
 */
const API = "https://www.federalregister.gov/api/v1/documents.json";
const FIELDS = [
  "executive_order_number",
  "document_number",
  "title",
  "abstract",
  "signing_date",
  "publication_date",
  "president",
  "agencies",
  "executive_order_notes",
  "html_url",
  "pdf_url",
  "citation",
] as const;

export const FIRST_SIGNING_DATE = "1994-01-01";
export const DEST = `${RAW_DIR}/federal-register/executive_orders.json`;

function firstUrl(): string {
  const q = new URLSearchParams();
  q.append("conditions[presidential_document_type][]", "executive_order");
  q.append("conditions[type][]", "PRESDOCU");
  q.append("conditions[signing_date][gte]", FIRST_SIGNING_DATE);
  q.set("order", "oldest");
  q.set("per_page", "1000");
  for (const f of FIELDS) q.append("fields[]", f);
  return `${API}?${q.toString()}`;
}

interface Page {
  count: number;
  next_page_url?: string | null;
  results: Record<string, unknown>[];
}

async function getPage(url: string): Promise<Page> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (res.ok) return (await res.json()) as Page;
    if (attempt >= 3 || (res.status < 500 && res.status !== 429)) {
      throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
    }
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
}

await run("executive-orders", async () => {
  const rows: Record<string, unknown>[] = [];
  let url: string | null | undefined = firstUrl();
  let expected = 0;
  while (url) {
    const page = await getPage(url);
    expected = page.count;
    rows.push(...page.results);
    url = page.next_page_url;
  }
  if (rows.length !== expected) {
    throw new Error(`API reported ${expected} executive orders but ${rows.length} were fetched`);
  }
  rows.sort((a, b) => Number(a.executive_order_number) - Number(b.executive_order_number));

  const body = "[\n" + rows.map((r) => JSON.stringify(r)).join(",\n") + "\n]\n";
  await mkdir(`${RAW_DIR}/federal-register`, { recursive: true });
  await writeFile(`${DEST}.download`, body);
  await rename(`${DEST}.download`, DEST);
  console.log(`  ${DEST}  ${rows.length} executive orders, ${(Buffer.byteLength(body) / 1024).toFixed(0)} KiB`);
});
