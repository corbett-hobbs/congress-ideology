import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { run } from "./lib";

/**
 * Official member photos from @unitedstates/images (GitHub Pages, CC0 GPO
 * photos). Keyed by the same `bioguide_id` everything else joins on, so no new
 * crosswalk is needed.
 *
 * Current members only — matches the project's scope everywhere else. Two sizes
 * are committed: 225x275 for the scatter-dot tooltip, 450x550 for the profile
 * page. Fetched here at build time and committed to `public/`, exactly like the
 * ideology data: the app never touches the network at request time.
 *
 * Missing photos are expected (not every current member has one in the source).
 * Those bioguide ids are recorded in the manifest and the app falls back to a
 * single generic silhouette (`public/images/member-placeholder.svg`).
 *
 * Run after `pnpm transform` — it reads the current roster from
 * `pipeline/output/terms.json`.
 */
const IMAGES_BASE = "https://unitedstates.github.io/images/congress";
const OUT_DIR = "public/images/members";
const MANIFEST = "pipeline/output/member-photos.json";
const TERMS = "pipeline/output/terms.json";

/** File-name suffix -> source size directory. */
const SIZES = { small: "225x275", large: "450x550" } as const;
type SizeKey = keyof typeof SIZES;

const CONCURRENCY = 8;

interface TermRow {
  bioguide_id: string;
  congress_number: number;
  chamber: string;
}

/** Distinct bioguide ids serving in the latest Congress, sorted. */
async function currentRoster(): Promise<string[]> {
  if (!existsSync(TERMS)) {
    throw new Error(`${TERMS} not found — run \`pnpm transform\` first.`);
  }
  const terms: TermRow[] = JSON.parse(await readFile(TERMS, "utf8"));
  const latest = Math.max(...terms.map((t) => t.congress_number));
  const ids = new Set<string>();
  for (const t of terms) {
    if (t.congress_number === latest) ids.add(t.bioguide_id);
  }
  return [...ids].sort();
}

/** A real JPEG starts with the SOI marker; guards against 200-with-HTML. */
function isJpeg(buf: Buffer): boolean {
  return buf.length > 1024 && buf[0] === 0xff && buf[1] === 0xd8;
}

/**
 * Fetch every size for one member. A member counts as "has a photo" only if
 * every size downloads cleanly; a partial result is discarded so the committed
 * set is all-or-nothing per member.
 */
async function fetchMember(bioguide: string): Promise<boolean> {
  const written: string[] = [];
  for (const [key, dim] of Object.entries(SIZES) as [SizeKey, string][]) {
    const dest = `${OUT_DIR}/${bioguide}-${key}.jpg`;
    let res: Response;
    try {
      res = await fetch(`${IMAGES_BASE}/${dim}/${bioguide}.jpg`);
    } catch {
      break;
    }
    if (!res.ok) break;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!isJpeg(buf)) break;
    await writeFile(dest, buf);
    written.push(dest);
  }

  if (written.length === Object.keys(SIZES).length) return true;
  await Promise.all(written.map((f) => rm(f, { force: true })));
  return false;
}

/** Drop any committed photo whose member is no longer in the roster. */
async function pruneStale(roster: Set<string>): Promise<number> {
  if (!existsSync(OUT_DIR)) return 0;
  const suffixes = Object.keys(SIZES).map((k) => `-${k}.jpg`);
  let removed = 0;
  for (const name of await readdir(OUT_DIR)) {
    const suffix = suffixes.find((s) => name.endsWith(s));
    if (!suffix) continue;
    const id = name.slice(0, -suffix.length);
    if (!roster.has(id)) {
      await rm(`${OUT_DIR}/${name}`, { force: true });
      removed += 1;
    }
  }
  return removed;
}

async function pool<T>(
  items: T[],
  n: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(n, queue.length) }, async () => {
      let item: T | undefined;
      while ((item = queue.shift()) !== undefined) await fn(item);
    }),
  );
}

await run("photos", async () => {
  await mkdir(OUT_DIR, { recursive: true });
  const roster = await currentRoster();
  console.log(`  roster: ${roster.length} current members`);

  const pruned = await pruneStale(new Set(roster));
  if (pruned) console.log(`  pruned ${pruned} stale photo file(s)`);

  const withPhoto: string[] = [];
  const missing: string[] = [];
  let done = 0;
  await pool(roster, CONCURRENCY, async (bioguide) => {
    (await fetchMember(bioguide) ? withPhoto : missing).push(bioguide);
    done += 1;
    if (done % 100 === 0) console.log(`  ${done}/${roster.length}`);
  });
  withPhoto.sort();
  missing.sort();

  await writeFile(
    MANIFEST,
    JSON.stringify(
      {
        generated: new Date().toISOString().slice(0, 10),
        source: IMAGES_BASE,
        sizes: SIZES,
        counts: {
          roster: roster.length,
          withPhoto: withPhoto.length,
          missing: missing.length,
        },
        withPhoto,
        missing,
      },
      null,
      2,
    ) + "\n",
  );

  console.log(
    `  ${withPhoto.length} with a photo, ${missing.length} missing (placeholder)`,
  );
  if (missing.length) console.log(`  missing: ${missing.join(", ")}`);
});
