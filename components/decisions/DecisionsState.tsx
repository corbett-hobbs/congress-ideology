"use client";

import { sameRange, type YearRange } from "@/lib/year-range";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DecisionsPayload } from "@/lib/decisions-types";

/**
 * The Decisions page's one source of truth: the years-shown window, the issue area (-1 = all; set by the pinned bar's
 * dropdown or a click on a row in card 3, one value), and the hovered and pinned term, so one crosshair runs through
 * cards 1 and 2. Two contexts, so components that only need the stable actions don't re-render on every hover frame
 * (same shape as `EnergyState`). Hover is rAF-throttled.
 */
export interface DecisionsValues {
  data: DecisionsPayload;
  range: YearRange;
  /** Index into `data.areas`, or -1 for All issue areas. */
  area: number;
  hover: number | null;
  pin: number | null;
}

export interface DecisionsActions {
  setRange: (r: YearRange) => void;
  setArea: (a: number) => void;
  moveHover: (term: number) => void;
  leaveHover: () => void;
  /** Pin `term`, or clear the pin when it is already pinned. */
  togglePin: (term: number) => void;
  /** Pin `term` (keyboard stepping); never clears. */
  pinTerm: (term: number) => void;
  clearPin: () => void;
}

const ValuesCtx = createContext<DecisionsValues | null>(null);
const ActionsCtx = createContext<DecisionsActions | null>(null);

export function DecisionsStateProvider({ data, children }: { data: DecisionsPayload; children: ReactNode }) {
  const full = useMemo<YearRange>(() => [data.terms[0], data.terms[data.terms.length - 1]], [data.terms]);
  const [range, setRangeState] = useState<YearRange>(full);
  const [area, setAreaState] = useState(-1);
  const [hover, setHover] = useState<number | null>(null);
  const [pin, setPin] = useState<number | null>(null);
  const pending = useRef<number | null>(null);
  const raf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const actions = useMemo<DecisionsActions>(
    () => ({
      setRange: (r) => setRangeState((cur) => (sameRange(cur, r) ? cur : r)),
      setArea: (a) => setAreaState(a),
      moveHover: (term) => {
        pending.current = term;
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
      togglePin: (term) => setPin((cur) => (cur === term ? null : term)),
      pinTerm: (term) => setPin(term),
      clearPin: () => setPin(null),
    }),
    [],
  );

  // A pin or hover that has left the window is simply not shown (and comes back if the window widens).
  const values = useMemo<DecisionsValues>(() => {
    const inWin = (t: number | null) => (t !== null && t >= range[0] && t <= range[1] ? t : null);
    return { data, range, area, hover: inWin(hover), pin: inWin(pin) };
  }, [data, range, area, hover, pin]);

  return (
    <ActionsCtx.Provider value={actions}>
      <ValuesCtx.Provider value={values}>{children}</ValuesCtx.Provider>
    </ActionsCtx.Provider>
  );
}

export function useDecisionsValues(): DecisionsValues {
  const v = useContext(ValuesCtx);
  if (!v) throw new Error("useDecisionsValues outside DecisionsStateProvider");
  return v;
}

export function useDecisionsActions(): DecisionsActions {
  const a = useContext(ActionsCtx);
  if (!a) throw new Error("useDecisionsActions outside DecisionsStateProvider");
  return a;
}
