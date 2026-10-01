"use client";

import { sameRange, type YearRange } from "@/lib/year-range";
import type { Measure } from "@/lib/trade-chart";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * The trade page's one source of truth: hovered and pinned date (axis days), the
 * visible year window, the selected country and measure, the Congress-control
 * toggle, and the year the partners chart shows. No chart keeps its own copy.
 * Two contexts, so charts that only need the stable actions don't re-render on
 * every hover frame (same shape as `EconomyState`).
 */
export interface TradeValues {
  hover: number | null;
  pin: number | null;
  /** Visible calendar years `[first, last]`, or null for the whole axis. */
  range: YearRange | null;
  /** `country_code`, or null for all countries. */
  country: string | null;
  measure: Measure;
  showCong: boolean;
  /** The year the partners chart shows (picked in that chart's own dropdown). */
  year: number;
}

export interface TradeActions {
  moveHover: (day: number) => void;
  leaveHover: () => void;
  pinDay: (day: number) => void;
  clearPin: () => void;
  setRange: (r: YearRange | null) => void;
  /** Show `next`, or go back to the whole axis if it is already showing. */
  toggleRange: (next: YearRange, full: YearRange) => void;
  setCountry: (code: string | null) => void;
  setMeasure: (m: Measure) => void;
  setShowCong: (on: boolean) => void;
  setYear: (y: number) => void;
}

const ValuesCtx = createContext<TradeValues | null>(null);
const ActionsCtx = createContext<TradeActions | null>(null);

export function TradeStateProvider({ lastYear, children }: { lastYear: number; children: ReactNode }) {
  const [hover, setHover] = useState<number | null>(null);
  const [pin, setPin] = useState<number | null>(null);
  const [range, setRangeState] = useState<YearRange | null>(null);
  const [country, setCountryState] = useState<string | null>(null);
  const [measure, setMeasureState] = useState<Measure>("balance");
  const [showCong, setShowCongState] = useState(false);
  const [year, setYearState] = useState(lastYear);
  const pending = useRef<number | null>(null);
  const raf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const actions = useMemo<TradeActions>(
    () => ({
      moveHover: (day) => {
        pending.current = day;
        if (!raf.current)
          raf.current = requestAnimationFrame(() => {
            raf.current = 0;
            if (pending.current !== null) setHover(pending.current);
          });
      },
      leaveHover: () => {
        pending.current = null;
        setHover(null);
      },
      pinDay: (day) => setPin(day),
      clearPin: () => {
        pending.current = null;
        setPin(null);
        setHover(null);
      },
      setRange: (r) => setRangeState(r),
      toggleRange: (next, full) => setRangeState((cur) => (sameRange(cur ?? full, next) ? null : next)),
      setCountry: setCountryState,
      setMeasure: setMeasureState,
      setShowCong: setShowCongState,
      setYear: setYearState,
    }),
    [],
  );
  const values = useMemo(
    () => ({ hover, pin, range, country, measure, showCong, year }),
    [hover, pin, range, country, measure, showCong, year],
  );
  return (
    <ActionsCtx.Provider value={actions}>
      <ValuesCtx.Provider value={values}>{children}</ValuesCtx.Provider>
    </ActionsCtx.Provider>
  );
}

export function useTradeValues(): TradeValues {
  const v = useContext(ValuesCtx);
  if (!v) throw new Error("useTradeValues outside TradeStateProvider");
  return v;
}
export function useTradeActions(): TradeActions {
  const a = useContext(ActionsCtx);
  if (!a) throw new Error("useTradeActions outside TradeStateProvider");
  return a;
}

/** The date every readout and crosshair shows: hover previews over the pin. */
export const activeDay = (v: Pick<TradeValues, "hover" | "pin">): number | null => v.hover ?? v.pin;
