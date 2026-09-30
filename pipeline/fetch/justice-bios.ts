import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import {
  justice as justiceSchema,
  justiceBio,
  type Justice,
  type JusticeBio,
} from "../../lib/court-entities";
import { wikipediaApiSummary } from "../validate/schemas";
import { trimExtract } from "../wikipedia/trim";
import { run } from "./lib";

/**
 * A short Wikipedia bio (and, when public domain, a portrait) per justice in
 * `pipeline/output/court/justices.json`, written to
 * `pipeline/output/court/justice_bios.json` keyed by `justice_id`. Build-time
 * only; the app never calls Wikipedia at request time. Modeled on
 * `fetch/wikipedia.ts` (members) with one extra problem: justices have no
 * `id.wikipedia`, so the article must be FOUND, and a wrong match (a namesake,
 * a disambiguation page) is worse than none.
 *
 * Matching is defensive. A candidate title from the justice's name (or a
 * reviewed override below) is accepted only if ALL hold:
 *   - a standard article, not a disambiguation page;
 *   - the lead names the Supreme Court and a justice;
 *   - the lead carries FJC's birth year (and death year, if any).
 * No candidate passing is FATAL — the run stops and lists what it tried, so a
 * human adds an entry to TITLE_OVERRIDES. Nothing is guessed.
 *
 * Photo: only when the Commons/Wikipedia file-page license metadata says public
 * domain or CC0. Anything else (CC BY-SA, fair use, no metadata) -> no photo.
 * Accepted photos are downloaded to `public/images/justices/<id>.<ext>`.
 */
const JUSTICES = "pipeline/output/court/justices.json";
const OUT = "pipeline/output/court/justice_bios.json";
const PHOTO_DIR = "public/images/justices";

const USER_AGENT =
  "congress-ideology/0.1 (https://github.com/corbett-hobbs/congress-ideology)";
const API = "https://en.wikipedia.org/api/rest_v1/page/summary";
const MAX_ATTEMPTS = 6;

/** Hand-reviewed article titles where the name-derived candidates don't land. */
const TITLE_OVERRIDES: Readonly<Record<number, string>> = {
  87: "Fred M. Vinson",
  83: "James F. Byrnes",
  102: "William Rehnquist",
  91: "John Marshall Harlan II", // the bare name is his grandfather, John Marshall Harlan (b. 1833)
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const headers = { "User-Agent": USER_AGENT, Accept: "application/json" };

async function getJson(url: string): Promise<{ status: number; body: unknown }> {
  let lastError = "";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let wait = 1000 * 2 ** attempt;
    try {
      const res = await fetch(url, { headers });
      if (res.ok) return { status: 200, body: await res.json() };
      if (res.status === 404) return { status: 404, body: null };
      lastError = `${res.status} ${res.statusText}`;
      if (res.status !== 429 && res.status < 500) throw new Error(`GET ${url} -> ${lastError}`);
      const retryAfter = Number(res.headers.get("retry-after"));
      if (Number.isFinite(retryAfter) && retryAfter > 0) wait = Math.max(wait, retryAfter * 1000);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("GET ")) throw err;
      lastError = err instanceof Error ? err.message : String(err);
    }
    await sleep(wait);
  }
  throw new Error(`GET ${url} -> gave up after ${MAX_ATTEMPTS} attempts (${lastError})`);
}

/** Name-derived article titles, most specific first. */
export function candidateTitles(j: Justice): string[] {
  const { first, middle, last, suffix } = j.name;
  const initial = middle ? `${middle[0]}.` : null;
  const parts = (...p: (string | null | undefined)[]) => p.filter(Boolean).join(" ");
  const out = [
    parts(first, middle, last, suffix),
    parts(first, initial, last, suffix),
    parts(first, middle, last),
    parts(first, initial, last),
    parts(first, last, suffix),
    parts(first, last),
    `${parts(first, last)} (justice)`,
  ];
  return [...new Set(out)];
}

export interface Verdict {
  ok: boolean;
  reason?: string;
}

/** The match rules above, pure so they are unit-tested. */
export function judgeMatch(
  j: Pick<Justice, "birth_year" | "death_year">,
  api: { type: string; extract: string; description?: string },
  /** Birth/death years from the article's Wikidata item (the REST lead strips the "(born …)" parenthetical). */
  wikidata: { birth: number | null; death: number | null },
): Verdict {
  if (api.type !== "standard") return { ok: false, reason: `page type "${api.type}"` };
  const text = `${api.description ?? ""} ${api.extract}`;
  if (!/supreme court|(chief|associate) justice/i.test(text)) {
    return { ok: false, reason: "lead does not describe a Supreme Court justice" };
  }
  if (wikidata.birth !== j.birth_year) {
    return { ok: false, reason: `Wikidata birth year ${wikidata.birth ?? "missing"} != FJC ${j.birth_year}` };
  }
  if (j.death_year !== null && wikidata.death !== j.death_year) {
    return { ok: false, reason: `Wikidata death year ${wikidata.death ?? "missing"} != FJC ${j.death_year}` };
  }
  return { ok: true };
}

/** Birth/death year from a Wikidata entity's P569/P570 claims. */
export async function wikidataYears(qid: string): Promise<{ birth: number | null; death: number | null }> {
  const { body } = await getJson(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
  const claims = (body as { entities?: Record<string, { claims?: Record<string, { mainsnak?: { datavalue?: { value?: { time?: string } } } }[]> }> })
    ?.entities?.[qid]?.claims;
  const year = (prop: string) => {
    const t = claims?.[prop]?.[0]?.mainsnak?.datavalue?.value?.time;
    const m = t ? /^[+-](\d{4})-/.exec(t) : null;
    return m ? Number(m[1]) : null;
  };
  return { birth: year("P569"), death: year("P570") };
}

/** "public domain" / "CC0" license strings only. */
export function isPublicDomainLicense(meta: {
  LicenseShortName?: string;
  Copyrighted?: string;
  UsageTerms?: string;
}): boolean {
  const name = `${meta.LicenseShortName ?? ""} ${meta.UsageTerms ?? ""}`.trim();
  if (/^\s*(CC0|CC[- ]?Zero)/i.test(name) || /public domain|^pd\b|\bpd-/i.test(name)) return true;
  return false;
}

interface PhotoResult {
  photo: JusticeBio["photo"];
  note: string;
}

async function findPhoto(id: number, api: z.infer<typeof apiPhoto>): Promise<PhotoResult> {
  const src = api.thumbnail?.source ?? api.originalimage?.source;
  const orig = api.originalimage?.source ?? api.thumbnail?.source;
  if (!src || !orig) return { photo: null, note: "no image on article" };
  const isCommons = orig.includes("/wikipedia/commons/");
  const m = /\/wikipedia\/(?:commons|en)\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?]+)/.exec(orig);
  if (!m) return { photo: null, note: "could not parse image file name" };
  const fileName = decodeURIComponent(m[1]);
  const host = isCommons ? "commons.wikimedia.org" : "en.wikipedia.org";
  const infoUrl = `https://${host}/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata&titles=${encodeURIComponent("File:" + fileName)}`;
  const { body } = await getJson(infoUrl);
  const pages = (body as { query?: { pages?: Record<string, { imageinfo?: { extmetadata?: Record<string, { value: string }> }[] }> } })?.query?.pages ?? {};
  const meta = Object.values(pages)[0]?.imageinfo?.[0]?.extmetadata;
  if (!meta) return { photo: null, note: `no license metadata for ${fileName}` };
  const license = meta.LicenseShortName?.value ?? meta.UsageTerms?.value ?? "";
  const pd = isPublicDomainLicense({
    LicenseShortName: meta.LicenseShortName?.value,
    Copyrighted: meta.Copyrighted?.value,
    UsageTerms: meta.UsageTerms?.value,
  });
  if (!pd) return { photo: null, note: `license "${license}" is not public domain/CC0` };

  const res = await fetch(src, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return { photo: null, note: `image download ${res.status}` };
  const buf = Buffer.from(await res.arrayBuffer());
  const jpeg = buf.length > 1024 && buf[0] === 0xff && buf[1] === 0xd8;
  const png = buf.length > 1024 && buf.subarray(1, 4).toString() === "PNG";
  if (!jpeg && !png) return { photo: null, note: "image is not a JPEG/PNG" };
  const ext = jpeg ? "jpg" : "png";
  await mkdir(PHOTO_DIR, { recursive: true });
  await writeFile(`${PHOTO_DIR}/${id}.${ext}`, buf);
  return {
    photo: {
      path: `/images/justices/${id}.${ext}`,
      source_url: `https://${host}/wiki/File:${encodeURIComponent(fileName.replace(/ /g, "_"))}`,
      license,
    },
    note: `photo ok (${license})`,
  };
}

const apiPhoto = z.looseObject({
  thumbnail: z.looseObject({ source: z.string() }).optional(),
  originalimage: z.looseObject({ source: z.string() }).optional(),
  description: z.string().optional(),
  wikibase_item: z.string().optional(),
});

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(n, queue.length) }, async () => {
      let item: T | undefined;
      while ((item = queue.shift()) !== undefined) await fn(item);
    }),
  );
}

if (process.argv[1]?.endsWith("justice-bios.ts")) {
  await run("justice-bios", async () => {
    const justices = (JSON.parse(await readFile(JUSTICES, "utf8")) as unknown[]).map((r) =>
      justiceSchema.parse(r),
    );
    const previous = new Map<number, JusticeBio>();
    if (existsSync(OUT)) {
      for (const r of JSON.parse(await readFile(OUT, "utf8")) as unknown[]) {
        const rec = justiceBio.parse(r);
        previous.set(rec.justice_id, rec);
      }
    }
    const today = new Date().toISOString().slice(0, 10);
    const records: JusticeBio[] = [];
    const failures: string[] = [];
    const notes: string[] = [];

    await pool(justices, 4, async (j) => {
      const label = `${j.name.full} (justice ${j.justice_id}, born ${j.birth_year})`;
      const titles = TITLE_OVERRIDES[j.justice_id]
        ? [TITLE_OVERRIDES[j.justice_id]]
        : candidateTitles(j);
      const tried: string[] = [];
      for (const title of titles) {
        const { status, body } = await getJson(`${API}/${encodeURIComponent(title.replace(/ /g, "_"))}`);
        if (status === 404) {
          tried.push(`${title}: 404`);
          continue;
        }
        const parsed = wikipediaApiSummary.safeParse(body);
        if (!parsed.success) throw new Error(`${label}: unexpected response shape for "${title}"`);
        const api = parsed.data;
        const extra = apiPhoto.parse(body);
        const years = extra.wikibase_item
          ? await wikidataYears(extra.wikibase_item)
          : { birth: null, death: null };
        const verdict = judgeMatch(j, { ...api, description: extra.description }, years);
        if (!verdict.ok) {
          tried.push(`${title}: ${verdict.reason}`);
          continue;
        }
        const extract = trimExtract(api.extract, { maxSentences: 3, maxChars: 440 });
        if (!extract) {
          tried.push(`${title}: empty extract`);
          continue;
        }
        const prev = previous.get(j.justice_id);
        const { photo, note } = await findPhoto(j.justice_id, extra);
        notes.push(`${j.name.last}: ${title} — ${note}`);
        const unchanged =
          prev && prev.title === api.title && prev.extract === extract && prev.url === api.content_urls.desktop.page;
        const rec = justiceBio.safeParse({
          justice_id: j.justice_id,
          title: api.title,
          extract,
          url: api.content_urls.desktop.page,
          revision: unchanged ? prev.revision : api.revision,
          fetched_at: unchanged ? prev.fetched_at : today,
          needs_review: false,
          photo,
        });
        if (!rec.success) throw new Error(`${label}: record failed schema\n${z.prettifyError(rec.error)}`);
        records.push(rec.data);
        return;
      }
      failures.push(`${label}: no acceptable article. Tried ${tried.join("; ")}`);
    });

    if (failures.length) {
      throw new Error(
        `${failures.length} justice(s) have no safely matched Wikipedia article; ${OUT} left untouched. Add the right title to TITLE_OVERRIDES in pipeline/fetch/justice-bios.ts (after checking it is the justice):\n  ${failures.sort().join("\n  ")}`,
      );
    }
    records.sort((a, b) => a.justice_id - b.justice_id);
    await writeFile(OUT, JSON.stringify(records, null, 2) + "\n");
    for (const n of notes.sort()) console.log(`  ${n}`);
    console.log(`  ${records.length} bios, ${records.filter((r) => r.photo).length} photos`);
  });
}
