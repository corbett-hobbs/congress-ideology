"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { decodeAid, type AidData } from "@/lib/foreign-aid-derive";
import type { AidPayload } from "@/lib/foreign-aid-types";

/**
 * The foreign-aid page's one source of truth: the selected fiscal year, president, country and
 * sector. Every chart reads these; none keeps its own copy. (Card-only controls that are not
 * filters, like the map's measure or the ranked list's sort, stay in their cards.)
 *
 * - `range` is the fiscal-year window every time series shows (the two-handle slider; its presidential-term band is the
 *   president filter). The selected year is always clamped into it.
 * - `country` is an index into `data.payload.countries` (-1 = all). Comparison charts highlight it
 *   and dim the rest; time series show that country's own dollars.
 * - `sector` is an index into `data.payload.sectors` (-1 = all).
 */
export interface AidState {
  data: AidData;
  year: number;
  /** Fiscal years the page shows, inclusive. */
  range: [number, number];
  country: number;
  sector: number;
  isPartial: (fy: number) => boolean;
  setYear: (fy: number) => void;
  /** Set the shown window (the two-handle slider); the selected year jumps to its last year. */
  setRange: (r: [number, number]) => void;
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
  const [country, setCountry] = useState(-1);
  const [sector, setSector] = useState(-1);
  const [range, setRangeRaw] = useState<[number, number]>([first, last]);

  const setYear = useCallback((fy: number) => setYearRaw(Math.min(range[1], Math.max(range[0], fy))), [range]);
  const setRange = useCallback((r: [number, number]) => {
    setRangeRaw(r);
    setYearRaw(r[1]); // the map's year follows the window's last year
  }, []);
  const toggleCountry = useCallback((ci: number) => setCountry((c) => (c === ci ? -1 : ci)), []);
  const partial = useMemo(() => new Set(payload.partialYears), [payload.partialYears]);

  const value = useMemo<AidState>(
    () => ({ data, year, range, country, sector, isPartial: (fy) => partial.has(fy), setYear, setRange, toggleCountry, setCountry, setSector }),
    [data, year, range, country, sector, partial, setYear, setRange, toggleCountry],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
