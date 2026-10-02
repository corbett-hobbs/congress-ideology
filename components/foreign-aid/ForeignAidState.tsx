"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { decodeAid, type AidData } from "@/lib/foreign-aid-derive";
import type { AidPayload, AidTerm } from "@/lib/foreign-aid-types";

/**
 * The foreign-aid page's one source of truth: the selected fiscal year, president, country and
 * sector. Every chart reads these; none keeps its own copy. (Card-only controls that are not
 * filters, like the map's measure or the ranked list's sort, stay in their cards.)
 *
 * - `president` narrows time series: the year window is that administration's fiscal years, and the
 *   selected year is clamped into it.
 * - `country` is an index into `data.payload.countries` (-1 = all). Comparison charts highlight it
 *   and dim the rest; time series show that country's own dollars.
 * - `sector` is an index into `data.payload.sectors` (-1 = all).
 */
export interface AidState {
  data: AidData;
  year: number;
  /** "all" or an `AidTerm.termId`. */
  president: string;
  term: AidTerm | null;
  /** Fiscal years the page shows, inclusive. */
  range: [number, number];
  country: number;
  sector: number;
  isPartial: (fy: number) => boolean;
  setYear: (fy: number) => void;
  setPresident: (id: string) => void;
  /** Select `ci`, or clear it when it is already selected. */
  toggleCountry: (ci: number) => void;
  setCountry: (ci: number) => void;
  setSector: (si: number) => void;
}

const Ctx = createContext<AidState | null>(null);

export function useAidState(): AidState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAidState must be used inside <AidStateProvider>");
  return v;
}

export function AidStateProvider({ payload, children }: { payload: AidPayload; children: ReactNode }) {
  const data = useMemo(() => decodeAid(payload), [payload]);
  const first = payload.years[0];
  const last = payload.years[payload.years.length - 1];
  const [year, setYearRaw] = useState(payload.defaultYear);
  const [president, setPresidentRaw] = useState("all");
  const [country, setCountry] = useState(-1);
  const [sector, setSector] = useState(-1);

  const term = useMemo(() => payload.terms.find((t) => t.termId === president) ?? null, [payload.terms, president]);
  const range = useMemo<[number, number]>(() => (term ? [term.fromFy, term.toFy] : [first, last]), [term, first, last]);
  const clamp = useCallback((fy: number) => Math.min(range[1], Math.max(range[0], fy)), [range]);

  const setYear = useCallback((fy: number) => setYearRaw(clamp(fy)), [clamp]);
  const setPresident = useCallback(
    (id: string) => {
      const t = payload.terms.find((x) => x.termId === id) ?? null;
      const [a, b] = t ? [t.fromFy, t.toFy] : [first, last];
      setPresidentRaw(t ? id : "all");
      setYearRaw((y) => Math.min(b, Math.max(a, y)));
    },
    [payload.terms, first, last],
  );
  const toggleCountry = useCallback((ci: number) => setCountry((c) => (c === ci ? -1 : ci)), []);
  const partial = useMemo(() => new Set(payload.partialYears), [payload.partialYears]);

  const value = useMemo<AidState>(
    () => ({ data, year, president, term, range, country, sector, isPartial: (fy) => partial.has(fy), setYear, setPresident, toggleCountry, setCountry, setSector }),
    [data, year, president, term, range, country, sector, partial, setYear, setPresident, toggleCountry],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
