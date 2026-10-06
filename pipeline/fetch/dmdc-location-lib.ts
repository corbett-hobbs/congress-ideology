import { z } from "zod";

export const DMDC_RAW_DIR = "pipeline/raw/dmdc-location";
export const DMDC_MANIFEST_PATH = `${DMDC_RAW_DIR}/manifest.json`;
export const dmdcRawPath = (period: string) => `${DMDC_RAW_DIR}/${period}.xlsx`;

export const DMDC_ORIGIN = "https://dwp.dmdc.osd.mil";
export const DMDC_PAGE_URL = `${DMDC_ORIGIN}/dwp/api/page?pageId=27`;
export const DMDC_GROUP = "milRegionCountry";
export const dmdcDownloadUrl = (fileId: string) => `${DMDC_ORIGIN}/dwp/api/downloadZ?fileId=${encodeURIComponent(fileId)}&groupName=${DMDC_GROUP}`;

/** First period of the 2008+ xlsx location tables. Older DMDC material is PDF/xls and is out of scope here. */
export const DMDC_FIRST_PERIOD = "2008-09";

export const period = z.string().regex(/^\d{4}-(03|06|09|12)$/);

export const manifestFile = z
  .object({
    period,
    fileName: z.string().min(1),
    fileId: z.string().min(1),
    groupName: z.literal(DMDC_GROUP),
    uploadDate: z.string().min(1),
    size: z.number().int().positive(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    fetched_at: z.string(),
  })
  .strict();
export type ManifestFile = z.infer<typeof manifestFile>;

export const manifest = z.object({ files: z.array(manifestFile) }).strict();
export type Manifest = z.infer<typeof manifest>;

export interface PageFile {
  period: string;
  fileName: string;
  fileId: string;
  uploadDate: string;
  size: number;
}

/**
 * `DMDC_Website_Location_Report_YYMM[_old].xlsx` -> `YYYY-MM`. The YYMM in the name is the quarter-end month
 * (`0809` = September 2008). Returns null for a name that does not follow the pattern.
 */
export function periodFromFileName(name: string): string | null {
  const m = /^DMDC_Website_Location_Report_(\d{2})(\d{2})(?:_old)?\.xlsx$/.exec(name);
  if (!m) return null;
  const p = `20${m[1]}-${m[2]}`;
  return period.safeParse(p).success ? p : null;
}

/**
 * Every `milRegionCountry` xlsx on the page JSON, 2008-09 onward, oldest first. The page nests its file lists, so
 * this walks the whole document. `fileId`s change every quarter, so they are always read from here, never hard-coded.
 * Throws on a malformed file name or two files for one period (the caller must not guess which is current).
 */
export function selectLocationFiles(doc: unknown): PageFile[] {
  const found: Record<string, unknown>[] = [];
  const walk = (o: unknown) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") {
      const r = o as Record<string, unknown>;
      if (r.groupName === DMDC_GROUP) found.push(r);
      Object.values(r).forEach(walk);
    }
  };
  walk(doc);
  const byPeriod = new Map<string, PageFile>();
  for (const r of found) {
    const fileName = String(r.fileName ?? "");
    if (String(r.extension ?? "") !== "xlsx") continue;
    const p = periodFromFileName(fileName);
    if (!p) throw new Error(`DMDC page: unrecognised location file name ${JSON.stringify(fileName)}`);
    if (p < DMDC_FIRST_PERIOD) continue;
    const file: PageFile = { period: p, fileName, fileId: String(r.fileId), uploadDate: String(r.uploadDate ?? ""), size: Number(r.size) };
    if (!file.fileId || !Number.isFinite(file.size)) throw new Error(`DMDC page: ${fileName} has no fileId/size`);
    if (byPeriod.has(p)) throw new Error(`DMDC page lists two files for ${p}: ${byPeriod.get(p)!.fileName} and ${fileName}`);
    byPeriod.set(p, file);
  }
  return [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period));
}

export const parseManifest = (v: unknown): Manifest => manifest.parse(v);
