"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * The page's one source of truth for the hovered date, the pinned date and the
 * selected president (the site's "no chart keeps its own copy" convention).
 * Dates are axis days. Two contexts, so the 9 charts' static layers — which
 * only need the stable actions — don't re-render on every hover frame.
 */
export interface EconomyValues {
  hover: number | null;
  pin: number | null;
  /** Index into the terms array, or null for all presidents. */
  term: number | null;
  /** Visible calendar years `[first, last]`, or null for the whole axis. One window for every chart. */
  range: [number, number] | null;
}

export interface EconomyActions {
  /** Throttled to one update per animation frame. */
  moveHover: (day: number) => void;
  leaveHover: () => void;
  pinDay: (day: number) => void;
  clearPin: () => void;
  setTerm: (i: number | null) => void;
  toggleTerm: (i: number) => void;
  setRange: (r: [number, number] | null) => void;
}

const ValuesCtx = createContext<EconomyValues | null>(null);
const ActionsCtx = createContext<EconomyActions | null>(null);

export function EconomyStateProvider({ children }: { children: ReactNode }) {
  const [hover, setHover] = useState<number | null>(null);
  const [pin, setPin] = useState<number | null>(null);
  const [term, setTermState] = useState<number | null>(null);
  const [range, setRangeState] = useState<[number, number] | null>(null);
  const pending = useRef<number | null>(null);
  const raf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const actions = useMemo<EconomyActions>(
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
      setTerm: (i) => setTermState(i),
      toggleTerm: (i) => setTermState((t) => (t === i ? null : i)),
      setRange: (r) => setRangeState(r),
    }),
    [],
  );
  const values = useMemo(() => ({ hover, pin, term, range }), [hover, pin, term, range]);
  return (
    <ActionsCtx.Provider value={actions}>
      <ValuesCtx.Provider value={values}>{children}</ValuesCtx.Provider>
    </ActionsCtx.Provider>
  );
}

export function useEconomyValues(): EconomyValues {
  const v = useContext(ValuesCtx);
  if (!v) throw new Error("useEconomyValues outside EconomyStateProvider");
  return v;
}
export function useEconomyActions(): EconomyActions {
  const a = useContext(ActionsCtx);
  if (!a) throw new Error("useEconomyActions outside EconomyStateProvider");
  return a;
}

/** The date every readout and crosshair shows: hover previews over the pin. */
export const activeDay = (v: Pick<EconomyValues, "hover" | "pin">): number | null => v.hover ?? v.pin;
