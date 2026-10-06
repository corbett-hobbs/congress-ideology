"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { decodeTroops, type TroopsData } from "@/lib/troops-derive";
import type { TroopsPayload, TroopsTerm } from "@/lib/troops-types";

/**
 * The troops page's one source of truth: selected fiscal year, president, country and branch. Every chart reads these.
 *
 * - `yi` indexes `payload.years` (fiscal years, each shown as its Sep 30 table; the year in progress shows its latest
 *   quarter). `pi` is the period index of that snapshot, for the map and list.
 * - `range` is the year window the time series show (the two-handle slider). `president` is a preset for it: choosing
 *   one sets the window to that administration's fiscal years; it reads "all" once the window is anything else.
 *   The selected year is always clamped into the window.
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
  /** Set the shown window directly (the two-handle slider); the selected year is clamped into it. */
  setRange: (r: [number, number]) => void;
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
  const [country, setCountry] = useState(-1);
  const [measure, setMeasure] = useState(0);
  const [range, setRangeRaw] = useState<[number, number]>([0, last]);

  // A preset reads as selected only while the window still matches it exactly.
  const term = useMemo(() => payload.terms.find((t) => t.from === range[0] && t.to === range[1]) ?? null, [payload.terms, range]);
  const president = term ? term.termId : "all";
  const clampTo = useCallback((i: number, r: readonly [number, number]) => Math.min(r[1], Math.max(r[0], i)), []);
  const setYear = useCallback((i: number) => setYiRaw(clampTo(i, range)), [clampTo, range]);
  const setRange = useCallback(
    (r: [number, number]) => {
      setRangeRaw(r);
      setYiRaw((p) => (p < r[0] || p > r[1] ? r[1] : p));
    },
    [],
  );
  const setPresident = useCallback(
    (id: string) => {
      const t = payload.terms.find((x) => x.termId === id) ?? null;
      setRange(t ? [t.from, t.to] : [0, last]);
    },
    [payload.terms, last, setRange],
  );
  const toggleCountry = useCallback((p: number) => setCountry((c) => (c === p ? -1 : p)), []);

  const value = useMemo<TroopsState>(
    () => ({ data, yi, pi: payload.years[yi].period, president, term, range, country, measure, setYear, setPresident, setRange, toggleCountry, setCountry, setMeasure }),
    [data, payload.years, yi, president, term, range, country, measure, setYear, setPresident, setRange, toggleCountry],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
