import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildBasesPayload } from "./bases-derive";
import { baseRow } from "./bases-entities";
import type { BasesPayload } from "./bases-types";

/** Build-time reader for the bases layer: Zod at the boundary, then the pure `buildBasesPayload`. */
let cache: BasesPayload | null = null;

export function getBasesPayload(): BasesPayload {
  if (!cache) {
    const raw = JSON.parse(readFileSync(join(process.cwd(), "pipeline", "output", "bases.json"), "utf8")) as unknown[];
    cache = buildBasesPayload(raw.map((r) => baseRow.parse(r)));
  }
  return cache;
}
