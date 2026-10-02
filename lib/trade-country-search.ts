import type { TradeCountryRef } from "./trade-types";

/** Lowercase, accents stripped, so "turkiye" finds "Türkiye" and "cote" finds "Côte". */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Countries matching what was typed: names that START with it first, then names where a
 * later WORD starts with it, then any other substring match. Order inside each group is
 * the input order (alphabetical). An empty query returns everything.
 */
export function filterCountries(countries: readonly TradeCountryRef[], query: string): TradeCountryRef[] {
  const q = fold(query.trim());
  if (!q) return [...countries];
  const starts: TradeCountryRef[] = [];
  const word: TradeCountryRef[] = [];
  const inside: TradeCountryRef[] = [];
  for (const c of countries) {
    const n = fold(c.name);
    if (n.startsWith(q)) starts.push(c);
    else if (n.split(/[\s(),-]+/).some((w) => w.startsWith(q))) word.push(c);
    else if (n.includes(q)) inside.push(c);
  }
  return [...starts, ...word, ...inside];
}
