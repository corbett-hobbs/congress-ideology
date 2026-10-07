import { z } from "zod";

export const TROOPDATA_RAW_DIR = "pipeline/raw/troopdata";
export const TROOPDATA_MANIFEST_PATH = `${TROOPDATA_RAW_DIR}/manifest.json`;
export const TROOPDATA_REPO = "meflynn/troopdata";
/**
 * The commit the snapshot is pinned to (not `master`, so a rerun cannot silently change history). Bump it on purpose:
 * change this, run `pnpm fetch:troopdata`, review the diff of `troops_history*.json`.
 */
export const TROOPDATA_COMMIT = "338bbda879932ac86cb5ef7f83845254f2c94070";

/** `path` in the upstream repo -> file name committed under `TROOPDATA_RAW_DIR`. */
export const TROOPDATA_FILES: readonly { path: string; file: string }[] = [
  { path: "data-raw/troopdata-rebuild-country-year-quarter-format.csv", file: "country-year-quarter-format.csv" },
  { path: "data-raw/basedata.csv", file: "basedata.csv" },
  { path: "LICENSE.md", file: "LICENSE.md" },
  { path: "DESCRIPTION", file: "DESCRIPTION" },
];
export const troopdataRawPath = (file: string) => `${TROOPDATA_RAW_DIR}/${file}`;
export const troopdataUrl = (path: string) => `https://raw.githubusercontent.com/${TROOPDATA_REPO}/${TROOPDATA_COMMIT}/${path}`;

export const troopdataManifest = z
  .object({
    repo: z.literal(TROOPDATA_REPO),
    commit: z.string().regex(/^[0-9a-f]{40}$/),
    files: z.array(
      z
        .object({
          path: z.string().min(1),
          file: z.string().min(1),
          url: z.string().url(),
          size: z.number().int().positive(),
          sha256: z.string().regex(/^[0-9a-f]{64}$/),
          fetched_at: z.string(),
        })
        .strict(),
    ),
  })
  .strict();
export type TroopdataManifest = z.infer<typeof troopdataManifest>;
export const parseTroopdataManifest = (v: unknown): TroopdataManifest => troopdataManifest.parse(v);
