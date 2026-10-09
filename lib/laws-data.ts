import "server-only";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { congressControlFile } from "./congress-control";
import { getCurrentMemberIndex } from "./congress-data";
import { displayName } from "./display-name";
import { legislator, term } from "./entities";
import { administration } from "./executive-orders-entities";
import { buildLawsList, buildLawsPayload } from "./laws-derive";
import { lawCountRow, lawRow, lawsMeta } from "./laws-entities";
import type { LawSponsor, LawsList, LawsPayload } from "./laws-types";
import { memberPath } from "./member-url";
import { HISTORICAL_ADMINISTRATIONS } from "./troops-presidents";

/**
 * Build-time reader for the Congress Laws page: parses `laws_counts.json`, `laws.json` and `laws_meta.json` at the boundary
 * (a bad file fails the build) and hands the page one dense payload. Shaping is the pure, unit-tested `lib/laws-derive.ts`.
 * The case-grain list (`laws.json`) is served to the browser separately, at `/data/laws/list` (`getLawsList`).
 */
const OUT = join(process.cwd(), "pipeline", "output");
const read = (file: string): unknown => JSON.parse(readFileSync(join(OUT, file), "utf8"));

let cache: LawsPayload | null = null;
let listCache: LawsList | null = null;

export function getLawsPageData(): LawsPayload {
  if (cache) return cache;
  const counts = z.array(lawCountRow).parse(read("laws_counts.json"));
  const laws = z.array(lawRow).parse(read("laws.json"));
  const meta = lawsMeta.parse(read("laws_meta.json"));
  const admins = [...HISTORICAL_ADMINISTRATIONS, ...z.array(administration).parse(read("administrations.json"))];
  const control = congressControlFile.parse(JSON.parse(readFileSync(join(process.cwd(), "pipeline", "reference", "congress-control.json"), "utf8")));
  cache = { ...buildLawsPayload(counts, laws, meta, admins, control.rows), listVersion: listVersion() };
  return cache;
}

const INDEPENDENT = /^(independent|ind\.)/i;
const partyOf = (caucus: string | null): "D" | "R" | "I" => (caucus === "Democrat" || caucus?.startsWith("Democrat") ? "D" : caucus === "Republican" ? "R" : INDEPENDENT.test(caucus ?? "") ? "I" : caucus?.includes("Democrat") ? "D" : caucus?.includes("Republican") ? "R" : "I");

/**
 * Every public law as a compact tuple, newest first, with the sponsor table (name, party-state, and a profile path only for
 * a member of the current Congress: those are the only members with a page) and the signer table. The browser fetches this
 * once, on mount; it is served as static JSON by `app/data/laws/list/route.ts`.
 */
export function getLawsList(): LawsList {
  if (listCache) return listCache;
  const laws = z.array(lawRow).parse(read("laws.json"));
  const meta = lawsMeta.parse(read("laws_meta.json"));
  const admins = [...HISTORICAL_ADMINISTRATIONS, ...z.array(administration).parse(read("administrations.json"))];
  listCache = buildLawsList(laws, meta, admins, getLawSponsorResolver());
  return listCache;
}

let resolver: ((id: string, congress: number, origin: "House" | "Senate" | null) => LawSponsor | null) | null = null;

/**
 * Resolves a bioguide id to how a law shows a member: name, party-state, party and a profile path (only for a member of the
 * current Congress, the only members with a page). Shared by the Laws list and the individual law pages.
 */
export function getLawSponsorResolver() {
  if (resolver) return resolver;
  const meta = lawsMeta.parse(read("laws_meta.json"));
  const people = new Map(z.array(legislator).parse(read("legislators.json")).map((l) => [l.bioguide_id, l]));
  const terms = new Map<string, ReturnType<typeof term.parse>[]>();
  for (const t of z.array(term).parse(read("terms.json"))) {
    if (t.congress_number < meta.first_congress) continue;
    const key = `${t.bioguide_id}|${t.congress_number}`;
    terms.set(key, [...(terms.get(key) ?? []), t]);
  }
  const current = getCurrentMemberIndex();
  resolver = (id, congress, origin): LawSponsor | null => {
    const person = people.get(id);
    if (!person) return null;
    const mine = terms.get(`${id}|${congress}`) ?? [];
    const t = mine.find((x) => x.chamber === origin?.toLowerCase()) ?? mine[0];
    const name = displayName(person.name, id);
    const party = partyOf(t?.caucus ?? t?.party ?? null);
    const place = t ? `${t.state}${t.chamber === "house" && t.district ? `-${t.district}` : ""}` : "";
    const cur = current.get(id);
    return [`${t?.chamber === "senate" ? "Sen." : t ? "Rep." : ""} ${name}`.trim(), place ? `${party}-${place}` : party, party, cur ? memberPath({ bioguideId: id, chamber: cur.chamber, name: cur.name }) : null];
  };
  return resolver;
}

/** A short hash of the list, for the fetch URL. */
function listVersion(): string {
  return createHash("sha1").update(JSON.stringify(getLawsList())).digest("hex").slice(0, 10);
}
