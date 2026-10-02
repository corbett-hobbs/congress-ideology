import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EO_TOPICS,
  administration,
  executiveOrder,
  type ExecutiveOrder,
} from "./executive-orders-entities";
import {
  emptyCounts,
  type EoPayload,
  type EoYear,
  type EoYearTerm,
} from "./executive-orders-types";

/**
 * Build-time executive-orders dataset: reads `executive_orders.json` and
 * `administrations.json` and aggregates year x topic x president. Year is the
 * SIGNING year (a late-December signing never lands in January). Mirrors
 * `lib/committee-data.ts`; the client-safe shapes live in
 * `lib/executive-orders-types.ts`.
 */

const OUT = join(process.cwd(), "pipeline", "output");

function readRows<T>(file: string, parse: (row: unknown) => T): T[] {
  return (JSON.parse(readFileSync(join(OUT, file), "utf8")) as unknown[]).map(parse);
}

export function aggregateByYear(
  orders: readonly ExecutiveOrder[],
  currentYear: number,
): EoYear[] {
  const first = Math.min(...orders.map((o) => Number(o.signing_date.slice(0, 4))));
  const last = Math.max(...orders.map((o) => Number(o.signing_date.slice(0, 4))));
  const years: EoYear[] = [];
  for (let year = first; year <= last; year++) {
    const inYear = orders.filter((o) => o.signing_date.startsWith(`${year}-`));
    const counts = emptyCounts();
    const terms = new Map<string, EoYearTerm>();
    for (const o of inYear) {
      counts[o.topic]++;
      let t = terms.get(o.term_id);
      if (!t) terms.set(o.term_id, (t = { termId: o.term_id, total: 0, counts: emptyCounts() }));
      t.total++;
      t.counts[o.topic]++;
    }
    years.push({
      year,
      total: inYear.length,
      counts,
      byTerm: [...terms.values()].sort((a, b) => a.termId.localeCompare(b.termId)),
      partial: year === currentYear,
      items: inYear
        .map((o) => ({
          n: o.eo_number,
          title: o.title,
          topic: o.topic,
          doc: o.document_number,
          signed: o.signing_date,
          termId: o.term_id,
        }))
        .sort((a, b) => b.n - a.n), // newest first, everywhere the orders are listed
    });
  }
  return years;
}

export function getExecutiveOrdersData(): EoPayload {
  const orders = readRows("executive_orders.json", (r) => executiveOrder.parse(r));
  const admins = readRows("administrations.json", (r) => administration.parse(r));
  const topics = new Set<string>(EO_TOPICS);
  for (const o of orders) if (!topics.has(o.topic)) throw new Error(`EO ${o.eo_number}: unknown topic ${o.topic}`);
  return {
    years: aggregateByYear(orders, new Date().getFullYear()),
    administrations: admins.map((a) => ({
      termId: a.term_id,
      president: a.president,
      party: a.party,
      start: a.start,
      end: a.end,
    })),
    total: orders.length,
    throughDate: orders.reduce((m, o) => (o.signing_date > m ? o.signing_date : m), ""),
  };
}
