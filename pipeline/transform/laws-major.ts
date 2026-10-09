import { LawsDataError, ordinal, type LawMajorFile, type MayhewFile } from "../../lib/laws-entities";

/**
 * Major laws: David Mayhew's lists of important enactments, matched to public laws by hand in
 * `pipeline/reference/mayhew-major-laws.json` (his lists give a title and a year, never a Public Law number). This module checks the
 * hand matching against the data and says, for each law, whether it is major, not major, or not yet assessed (its Congress has no list yet).
 */

/** Share of list entries that name a public law which must be matched to one (the plan proposed 97%; the hand matching reaches 100%). */
export const MIN_JOIN_SHARE = 0.97;

export interface MajorResult {
  /** law id -> the entries that name it. */
  byLaw: Map<string, { entry_id: string; scope: "whole" | "part"; capitals: boolean }[]>;
  file: LawMajorFile;
  report: {
    source: string;
    covered_through_congress: number;
    entries: number;
    entries_without_a_public_law: string[];
    entries_matched: number;
    join_share: number;
    entries_naming_part_of_a_law: number;
    entries_naming_several_laws: string[];
    major_laws: number;
    laws_named_by_more_than_one_entry: string[];
    entries_by_congress: Record<string, number>;
  };
}

/** A short label for an entry: its first sentence ("War Powers Act of 1973."), trailing full stop dropped. */
export function entryTitle(quote: string): string {
  const first = quote.split(/(?<=[.;])\s+/)[0]!.replace(/[.;]$/, "").trim();
  return first.length > 110 ? first.slice(0, 107).trimEnd() + "…" : first;
}

export function buildMajor(ref: MayhewFile, laws: ReadonlyMap<string, { congress: number }>, lastCongress: number): MajorResult {
  const seen = new Set<string>();
  const byLaw: MajorResult["byLaw"] = new Map();
  const noLaw: string[] = [];
  const several: string[] = [];
  const perCongress = new Map<number, number>();
  let matched = 0;
  let part = 0;
  if (ref.covered_through_congress > lastCongress) throw new LawsDataError(`Mayhew's lists are said to cover through the ${ordinal(ref.covered_through_congress)} Congress, but the data ends at the ${ordinal(lastCongress)}`);
  for (const e of ref.entries) {
    if (seen.has(e.entry_id)) throw new LawsDataError(`Mayhew entry ${e.entry_id} appears twice`);
    seen.add(e.entry_id);
    if (!e.entry_id.startsWith(`${e.congress}-`)) throw new LawsDataError(`Mayhew entry ${e.entry_id} is filed under the ${ordinal(e.congress)} Congress`);
    if (e.congress < ref.first_congress || e.congress > ref.covered_through_congress) throw new LawsDataError(`Mayhew entry ${e.entry_id} is outside the Congresses the lists cover (${ref.first_congress}-${ref.covered_through_congress})`);
    perCongress.set(e.congress, (perCongress.get(e.congress) ?? 0) + 1);
    if (e.scope === "none") {
      if (e.law_ids.length > 0) throw new LawsDataError(`Mayhew entry ${e.entry_id} is scoped "none" but names ${e.law_ids.join(", ")}`);
      noLaw.push(`${e.entry_id} ${entryTitle(e.quote)}`);
      continue;
    }
    if (e.law_ids.length === 0) throw new LawsDataError(`Mayhew entry ${e.entry_id} ("${entryTitle(e.quote)}") names no law; match it, or scope it "none" if it is a treaty`);
    for (const id of e.law_ids) {
      const l = laws.get(id);
      if (!l) throw new LawsDataError(`Mayhew entry ${e.entry_id} names ${id}, which is not in the laws data`);
      if (l.congress !== e.congress) throw new LawsDataError(`Mayhew entry ${e.entry_id} (${ordinal(e.congress)} Congress) names ${id}, a law of the ${ordinal(l.congress)}`);
      byLaw.set(id, [...(byLaw.get(id) ?? []), { entry_id: e.entry_id, scope: e.scope, capitals: e.capitals }]);
    }
    matched++;
    if (e.scope === "part") part++;
    if (e.law_ids.length > 1) several.push(`${e.entry_id}: ${e.law_ids.join(", ")}`);
  }
  for (let c = ref.first_congress; c <= ref.covered_through_congress; c++) if (!perCongress.has(c)) throw new LawsDataError(`Mayhew's lists have no entry for the ${ordinal(c)} Congress`);
  const needing = ref.entries.length - noLaw.length;
  const share = matched / needing;
  if (share < MIN_JOIN_SHARE) throw new LawsDataError(`only ${(100 * share).toFixed(1)}% of Mayhew's entries that name a public law are matched to one (bar ${(100 * MIN_JOIN_SHARE).toFixed(0)}%)`);

  const entries: LawMajorFile["entries"] = {};
  for (const e of ref.entries) if (e.law_ids.length > 0) entries[e.entry_id] = { title: entryTitle(e.quote), list: e.list };
  const lawsOut: LawMajorFile["laws"] = {};
  for (const id of [...byLaw.keys()].sort()) lawsOut[id] = byLaw.get(id)!.map((x) => [x.entry_id, x.scope === "whole" ? 0 : 1, x.capitals ? 1 : 0]);
  return {
    byLaw,
    file: { entries, laws: lawsOut },
    report: {
      source: `${ref.source.author}, ${ref.source.title}`,
      covered_through_congress: ref.covered_through_congress,
      entries: ref.entries.length,
      entries_without_a_public_law: noLaw,
      entries_matched: matched,
      join_share: Number(share.toFixed(4)),
      entries_naming_part_of_a_law: part,
      entries_naming_several_laws: several,
      major_laws: byLaw.size,
      laws_named_by_more_than_one_entry: [...byLaw].filter(([, v]) => v.length > 1).map(([id, v]) => `${id}: ${v.map((x) => x.entry_id).join(", ")}`),
      entries_by_congress: Object.fromEntries([...perCongress].sort((a, b) => a[0] - b[0]).map(([c, n]) => [c, n])),
    },
  };
}
