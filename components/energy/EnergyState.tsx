"use client";

import { sameRange, type YearRange } from "@/lib/year-range";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * The energy page's one source of truth: hovered and pinned date (axis days) and the visible year window. No
 * chart keeps its own copy, so one crosshair runs through all four cards. Two contexts, so charts that only
 * need the stable actions don't re-render on every hover frame (same shape as `EconomyState` / `TradeState`).
 */
export interface EnergyValues {
  hover: number | null;
  pin: number | null;
  /** Visible calendar years `[first, last]`, or null for the whole axis. */
  range: YearRange | null;
}

export interface EnergyActions {
  moveHover: (day: number) => void;
  leaveHover: () => void;
  pinDay: (day: number) => void;
  clearPin: () => void;
  setRange: (r: YearRange | null) => void;
  /** Show `next`, or go back to the whole axis if it is already showing. */
  toggleRange: (next: YearRange, full: YearRange) => void;
}

const ValuesCtx = createContext<EnergyValues | null>(null);
const ActionsCtx = createContext<EnergyActions | null>(null);

export function EnergyStateProvider({ children }: { children: ReactNode }) {
  const [hover, setHover] = useState<number | null>(null);
  const [pin, setPin] = useState<number | null>(null);
  const [range, setRangeState] = useState<YearRange | null>(null);
  const pending = useRef<number | null>(null);
  const raf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const actions = useMemo<EnergyActions>(
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
    }),
    [],
  );
  const values = useMemo(() => ({ hover, pin, range }), [hover, pin, range]);
  return (
    <ActionsCtx.Provider value={actions}>
      <ValuesCtx.Provider value={values}>{children}</ValuesCtx.Provider>
    </ActionsCtx.Provider>
  );
}

export function useEnergyValues(): EnergyValues {
  const v = useContext(ValuesCtx);
  if (!v) throw new Error("useEnergyValues outside EnergyStateProvider");
  return v;
}
export function useEnergyActions(): EnergyActions {
  const a = useContext(ActionsCtx);
  if (!a) throw new Error("useEnergyActions outside EnergyStateProvider");
  return a;
}

/** The date every readout and crosshair shows: hover previews over the pin. */
export const activeDay = (v: Pick<EnergyValues, "hover" | "pin">): number | null => v.hover ?? v.pin;
