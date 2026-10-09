import "server-only";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { committeeBillsMeta, committeeBillsShard, type CommitteeBillsMeta } from "./committee-bills-entities";
import type { BillSponsorCell, CommitteeBillsPayload, CommitteeBillsSummary } from "./committee-bills-types";
import { getCurrentMemberIndex } from "./congress-data";
import { memberPath } from "./member-url";

/**
 * Build-time reader for the legislation card on a committee page: parses `committee_bills_meta.json` and one
 * `committee_bills/<COMMITTEE_ID>.json` shard at the boundary (a bad file fails the build). The page gets a small summary;
 * the rows ship to the browser separately, at `/data/committees/<id>/bills`, fetched when the card mounts. Stages, filters and
 * counts are the pure `lib/committee-bills-derive.ts`. A checkout with no bills file yet has no card (the reader returns null).
 */
const OUT = join(process.cwd(), "pipeline", "output");

let meta: CommitteeBillsMeta | null | undefined;
const payloads = new Map<string, CommitteeBillsPayload | null>();

function readMeta(): CommitteeBillsMeta | null {
  if (meta !== undefined) return meta;
  const file = join(OUT, "committee_bills_meta.json");
  meta = existsSync(file) ? committeeBillsMeta.parse(JSON.parse(readFileSync(file, "utf8"))) : null;
  return meta;
}

/** Committees that have at least one bill this Congress: the ids the data route prerenders. */
export function committeeBillsIds(): string[] {
  return Object.keys(readMeta()?.committees ?? {}).sort();
}

/** "Biggs, Andy" -> "Andy Biggs": how the source prints a former member. */
const firstLast = (name: string): string => {
  const i = name.indexOf(", ");
  return i < 0 ? name : `${name.slice(i + 2)} ${name.slice(0, i)}`;
};

/** One committee's rows with the sponsor table the list shows; null when the committee holds no bills. */
export function getCommitteeBillsPayload(committeeId: string): CommitteeBillsPayload | null {
  const cached = payloads.get(committeeId);
  if (cached !== undefined) return cached;
  const m = readMeta();
  const file = join(OUT, "committee_bills", `${committeeId}.json`);
  if (!m || !(committeeId in m.committees) || !existsSync(file)) {
    payloads.set(committeeId, null);
    return null;
  }
  const shard = committeeBillsShard.parse(JSON.parse(readFileSync(file, "utf8")));
  const current = getCurrentMemberIndex();
  // A profile link only for a member of the current Congress: those are the only members with a page.
  const sponsors = shard.sponsors.map(([id, name, party, place]): BillSponsorCell => {
    const cur = current.get(id);
    return [cur?.name ?? firstLast(name), party ? `${party}${place ? `-${place}` : ""}` : place, party, cur ? memberPath({ bioguideId: id, chamber: cur.chamber, name: cur.name }) : null];
  });
  const payload: CommitteeBillsPayload = { committeeId, congress: shard.congress, chamber: shard.chamber, dataThrough: m.data_through, areas: shard.areas, subs: shard.subs, sponsors, rows: shard.rows };
  payloads.set(committeeId, payload);
  return payload;
}

/** What the committee page needs before the rows arrive; null when the committee holds no bills (no card). */
export function getCommitteeBillsSummary(committeeId: string): CommitteeBillsSummary | null {
  const p = getCommitteeBillsPayload(committeeId);
  if (!p) return null;
  return {
    committeeId,
    congress: p.congress,
    total: p.rows.length,
    dataThrough: p.dataThrough,
    version: createHash("sha1").update(JSON.stringify(p.rows)).digest("hex").slice(0, 10),
  };
}
