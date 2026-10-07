import { BASES_DATA_THROUGH, type BaseRow } from "./bases-entities";
import { SITE_ORDER, type BaseCluster, type BasesPayload } from "./bases-types";

/** Pure shaping for the bases layer: the dense payload, and clustering that depends on zoom. */
export function buildBasesPayload(rows: readonly BaseRow[]): BasesPayload {
  const countries: BasesPayload["countries"] = [];
  const index = new Map<string, number>();
  const sites = rows.map((r) => {
    const key = `${r.iso3}|${r.country}`;
    let c = index.get(key);
    if (c === undefined) {
      c = countries.length;
      index.set(key, c);
      countries.push({ name: r.country, iso3: r.iso3 });
    }
    return { name: r.name, c, t: SITE_ORDER.indexOf(r.site_type), x: r.x, y: r.y, review: r.needs_review ? r.review_note : null };
  });
  return { through: BASES_DATA_THROUGH, countries, sites };
}

/**
 * Merge sites of the same country that sit within `minDist` map units of a group's centre. Greedy over the sites in
 * a fixed order, so the result is deterministic. Sites with a `review` note are left out (not drawn).
 */
export function clusterSites(payload: BasesPayload, minDist: number): BaseCluster[] {
  const order = payload.sites.map((s, i) => i).filter((i) => !payload.sites[i].review);
  order.sort((a, b) => payload.sites[a].x - payload.sites[b].x || payload.sites[a].y - payload.sites[b].y || a - b);
  const out: BaseCluster[] = [];
  const byIso = new Map<string, BaseCluster[]>();
  const sums = new Map<BaseCluster, [number, number]>();
  for (const i of order) {
    const s = payload.sites[i];
    const iso3 = payload.countries[s.c].iso3;
    const list = byIso.get(iso3) ?? [];
    byIso.set(iso3, list);
    const hit = list.find((c) => Math.hypot(c.x - s.x, c.y - s.y) <= minDist);
    if (hit) {
      const sum = sums.get(hit)!;
      sum[0] += s.x;
      sum[1] += s.y;
      hit.members.push(i);
      hit.x = sum[0] / hit.members.length;
      hit.y = sum[1] / hit.members.length;
    } else {
      const c: BaseCluster = { x: s.x, y: s.y, iso3, members: [i] };
      sums.set(c, [s.x, s.y]);
      list.push(c);
      out.push(c);
    }
  }
  return out;
}
