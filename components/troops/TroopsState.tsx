"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { decodeTroops, type TroopsData } from "@/lib/troops-derive";
import type { TroopsPayload, TroopsTerm } from "@/lib/troops-types";

/**
 * The troops page's one source of truth: selected fiscal year, president, country and branch. Every chart reads these.
 *
 * - `yi` indexes `payload.years` (fiscal years, each shown as its Sep 30 table; the year in progress shows its latest
 *   quarter). `pi` is the period index of that snapshot, for the map and list.
 * - `president` narrows time series: the year window is that administration's fiscal years, and the selected year is
 *   clamped into it.
 * - `country` is a place index (-1 = all). The time series shows that place's own troops; the map, list and
 *   the callouts highlight it and dim the rest (the list always keeps every place).
 * - `measure` indexes `MEASURES` (0 = all branches).
 */
export interface TroopsState {
  data: TroopsData;
  /** Selected fiscal-year index (into `payload.years`). */
  yi: number;
  /** Period index of the selected year's snapshot. */
  pi: number;
  president: string;
  term: TroopsTerm | null;
  /** Fiscal-year indices shown, inclusive. */
  range: [number, number];
  country: number;
  measure: number;
  setYear: (yi: number) => void;
  setPresident: (id: string) => void;
  toggleCountry: (place: number) => void;
  setCountry: (place: number) => void;
  setMeasure: (m: number) => void;
}

const Ctx = createContext<TroopsState | null>(null);

export function useTroopsState(): TroopsState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTroopsState must be used inside <TroopsStateProvider>");
  return v;
}

export function TroopsStateProvider({ payload, children }: { payload: TroopsPayload; children: ReactNode }) {
  const data = useMemo(() => decodeTroops(payload), [payload]);
  const last = payload.years.length - 1;
  const [yi, setYiRaw] = useState(payload.defaultYear);
  const [president, setPresidentRaw] = useState("all");
  const [country, setCountry] = useState(-1);
  const [measure, setMeasure] = useState(0);

  const term = useMemo(() => payload.terms.find((t) => t.termId === president) ?? null, [payload.terms, president]);
  const range = useMemo<[number, number]>(() => (term ? [term.from, term.to] : [0, last]), [term, last]);
  const clamp = useCallback((i: number) => Math.min(range[1], Math.max(range[0], i)), [range]);
  const setYear = useCallback((i: number) => setYiRaw(clamp(i)), [clamp]);
  const setPresident = useCallback(
    (id: string) => {
      const t = payload.terms.find((x) => x.termId === id) ?? null;
      const [a, b] = t ? [t.from, t.to] : [0, last];
      setPresidentRaw(t ? id : "all");
      // A president narrows to their years; the newest of them is the natural pick when the current one falls outside.
      setYiRaw((p) => (p < a || p > b ? b : p));
    },
    [payload.terms, last],
  );
  const toggleCountry = useCallback((p: number) => setCountry((c) => (c === p ? -1 : p)), []);

  const value = useMemo<TroopsState>(
    () => ({ data, yi, pi: payload.years[yi].period, president, term, range, country, measure, setYear, setPresident, toggleCountry, setCountry, setMeasure }),
    [data, payload.years, yi, president, term, range, country, measure, setYear, setPresident, toggleCountry],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
