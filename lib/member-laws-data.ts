import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getLawsList } from "./laws-data";
import { lawCosponsorsFile, lawRow, lawsMeta } from "./laws-entities";
import type { MemberLaws } from "./laws-types";
import { buildMemberLaws, indexMemberRoles } from "./member-laws";

/**
 * Build-time reader for the laws on a member's page: the Laws list cut down to the laws a member sponsored (`laws.json`) or
 * cosponsored (`laws_cosponsors.json`). Served at `/data/members/[bioguide_id]/laws`; the page's laws table fetches it on mount.
 */
const OUT = join(process.cwd(), "pipeline", "output");
const read = (file: string): unknown => JSON.parse(readFileSync(join(OUT, file), "utf8"));

let roles: ReturnType<typeof indexMemberRoles> | null = null;
let areas: z.infer<typeof lawsMeta>["areas"] | null = null;

function load() {
  if (!roles || !areas) {
    roles = indexMemberRoles(z.array(lawRow).parse(read("laws.json")), lawCosponsorsFile.parse(read("laws_cosponsors.json")));
    areas = lawsMeta.parse(read("laws_meta.json")).areas;
  }
  return { roles, areas };
}

export function getMemberLaws(bioguideId: string): MemberLaws {
  const l = load();
  return buildMemberLaws(getLawsList(), l.areas, l.roles.get(bioguideId));
}
