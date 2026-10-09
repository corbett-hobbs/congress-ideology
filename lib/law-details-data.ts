import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getAllCommittees } from "./committee-data";
import { committeePath } from "./committee-url";
import { administration } from "./executive-orders-entities";
import { timeline } from "./law-details-derive";
import { lawDetailsShard } from "./law-details-entities";
import type { LawCommitteeEntry, LawPageData, LawPerson } from "./law-details-types";
import { congressGovBillUrl, parseLawId } from "./law-url";
import { getLawSponsorResolver } from "./laws-data";
import { administrationOn, billLabel } from "./laws-derive";
import { lawCommitteesFile, lawCosponsorsFile, lawRow, lawsMeta } from "./laws-entities";
import type { LawRow } from "./laws-entities";
import { HISTORICAL_ADMINISTRATIONS } from "./troops-presidents";

/**
 * Build-time reader for the individual law pages. One law is its row in `laws.json`, its record in the Congress's
 * `law_details/<congress>.json` shard (summary and actions), its cosponsors (`laws_cosponsors.json`) and committees
 * (`laws_committees.json`); the signing president is derived from the date, never stored.
 */
const OUT = join(process.cwd(), "pipeline", "output");
const read = (file: string): unknown => JSON.parse(readFileSync(join(OUT, file), "utf8"));

let rows: Map<string, LawRow> | null = null;
let all: LawRow[] | null = null;
const shards = new Map<number, z.infer<typeof lawDetailsShard>>();

function loadRows() {
  if (!rows) {
    all = z.array(lawRow).parse(read("laws.json"));
    rows = new Map(all.map((l) => [l.law_id, l]));
  }
  return { rows: rows!, all: all! };
}

/** Every law as the page and the sitemap need it: id, title, Congress and date. Newest first. */
export function getLawRefs(): { lawId: string; title: string; congress: number; date: string; major: boolean | null }[] {
  return [...loadRows().all]
    .sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number)
    .map((l) => ({ lawId: l.law_id, title: l.title, congress: l.congress, date: l.date, major: l.major }));
}

export function getLawRef(lawId: string): { lawId: string; title: string } | null {
  const l = loadRows().rows.get(lawId);
  return l ? { lawId: l.law_id, title: l.title } : null;
}

function shardFor(congress: number) {
  let s = shards.get(congress);
  if (!s) {
    s = lawDetailsShard.parse(read(`law_details/${congress}.json`));
    shards.set(congress, s);
  }
  return s;
}

let cosponsors: Record<string, string[]> | null = null;
let committees: z.infer<typeof lawCommitteesFile> | null = null;
let meta: z.infer<typeof lawsMeta> | null = null;
let admins: z.infer<typeof administration>[] | null = null;
let committeeNames: Map<string, string> | null = null;

export function getLawPage(lawId: string): LawPageData | null {
  const parsed = parseLawId(lawId);
  const law = parsed ? loadRows().rows.get(lawId) : undefined;
  if (!law) return null;
  const detail = shardFor(law.congress).laws[lawId];
  if (!detail) throw new Error(`law_details/${law.congress}.json has no record for ${lawId}`);

  cosponsors ??= lawCosponsorsFile.parse(read("laws_cosponsors.json"));
  committees ??= lawCommitteesFile.parse(read("laws_committees.json"));
  meta ??= lawsMeta.parse(read("laws_meta.json"));
  admins ??= [...HISTORICAL_ADMINISTRATIONS, ...z.array(administration).parse(read("administrations.json"))];
  committeeNames ??= new Map(getAllCommittees().map((c) => [c.committeeId, c.shortName]));

  const resolve = getLawSponsorResolver();
  const person = (id: string): LawPerson | null => {
    const s = resolve(id, law.congress, law.origin_chamber);
    return s ? { name: s[0], label: s[1], party: s[2], path: s[3] } : null;
  };
  const sponsor = law.sponsor_bioguide_id ? person(law.sponsor_bioguide_id) : null;
  const people = (cosponsors[lawId] ?? []).map(person);
  const a = administrationOn(law.date, admins);
  if (!a) throw new Error(`${lawId} is dated ${law.date}, which no administration covers`);

  const entries: LawCommitteeEntry[] = (committees.laws[lawId] ?? []).map(([id, subs, steps]) => {
    const c = committees!.committees[id];
    const short = committeeNames!.get(id);
    return {
      name: c?.name ?? id,
      chamber: c?.chamber ?? null,
      path: c?.page && short ? committeePath({ committeeId: id, shortName: short }) : null,
      subcommittees: subs.map((s) => committees!.committees[s]?.name ?? s),
      steps,
    };
  });

  return {
    lawId,
    congress: law.congress,
    number: law.number,
    title: law.title,
    publicLaw: `Public Law ${law.congress}-${law.number}`,
    date: law.date,
    billLabel: billLabel(law),
    originChamber: law.origin_chamber,
    president: { name: a.president, party: a.party === "Democratic" ? "D" : "R" },
    veto: law.veto_override,
    area: meta.areas.find((x) => x.id === law.area_id)?.name ?? null,
    major: law.major,
    summary: detail.summary,
    summaryCut: detail.cut === true,
    actions: timeline(detail.actions),
    sponsor,
    cosponsors: people.filter((p): p is LawPerson => p !== null),
    cosponsorsUnresolved: people.filter((p) => p === null).length,
    passage: { house: [law.house[0], law.house[1], law.house[2]], senate: [law.senate[0], law.senate[1], law.senate[2]], override: law.override_votes },
    committees: entries,
    congressGovUrl: congressGovBillUrl(law.congress, law.bill_type, law.bill_number),
    dataThrough: meta.data_through,
  };
}
