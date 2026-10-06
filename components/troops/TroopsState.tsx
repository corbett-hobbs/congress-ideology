"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { decodeTroops, type TroopsData } from "@/lib/troops-derive";
import type { TroopsPayload, TroopsTerm } from "@/lib/troops-types";

/**
 * The troops page's one source of truth: selected period, president, country and branch. Every chart reads these.
 *
 * - `president` narrows time series: the period window is that administration's periods, and the selected period is
 *   clamped into it.
 * - `country` is a place index (-1 = all). The time series shows that place's own troops; the map, list and
 *   the callouts highlight it and dim the rest (the list always keeps every place).
 * - `measure` indexes `MEASURES` (0 = all branches).
 */
export interface TroopsState {
  data: TroopsData;
  /** Selected period index. */
  pi: number;
  president: string;
  term: TroopsTerm | null;
  /** Period indices shown, inclusive. */
  range: [number, number];
  country: number;
  measure: number;
  setPeriod: (pi: number) => void;
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
  const last = payload.periods.length - 1;
  const [pi, setPiRaw] = useState(payload.defaultPeriod);
  const [president, setPresidentRaw] = useState("all");
  const [country, setCountry] = useState(-1);
  const [measure, setMeasure] = useState(0);

  const term = useMemo(() => payload.terms.find((t) => t.termId === president) ?? null, [payload.terms, president]);
  const range = useMemo<[number, number]>(() => (term ? [term.from, term.to] : [0, last]), [term, last]);
  const clamp = useCallback((i: number) => Math.min(range[1], Math.max(range[0], i)), [range]);
  const setPeriod = useCallback((i: number) => setPiRaw(clamp(i)), [clamp]);
  const setPresident = useCallback(
    (id: string) => {
      const t = payload.terms.find((x) => x.termId === id) ?? null;
      const [a, b] = t ? [t.from, t.to] : [0, last];
      setPresidentRaw(t ? id : "all");
      // A president narrows to their years; the newest of them is the natural pick when the current one falls outside.
      setPiRaw((p) => (p < a || p > b ? b : p));
    },
    [payload.terms, last],
  );
  const toggleCountry = useCallback((p: number) => setCountry((c) => (c === p ? -1 : p)), []);

  const value = useMemo<TroopsState>(
    () => ({ data, pi, president, term, range, country, measure, setPeriod, setPresident, toggleCountry, setCountry, setMeasure }),
    [data, pi, president, term, range, country, measure, setPeriod, setPresident, toggleCountry],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
