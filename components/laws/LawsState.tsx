"use client";

import { sameRange, type YearRange } from "@/lib/year-range";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ALL_GROUPS, windowIndexes, yearSpan } from "@/lib/laws-derive";
import type { LawsPayload } from "@/lib/laws-types";

/**
 * The Laws page's one source of truth: the years-shown window, the policy-area filter ("" = all, a topic group's id, or
 * "other" = the groups without a colour), "major laws only", the support band picked on card 2, the party-control rows
 * toggle, and the hovered and pinned Congress, so one crosshair runs through both charts. Two contexts, so components that
 * only need the stable actions don't re-render on every hover frame (same shape as `DecisionsState`). Hover is rAF-throttled.
 */
export interface LawsValues {
  data: LawsPayload;
  range: YearRange;
  /** `ALL_GROUPS`, a topic group id, or `OTHER_GROUPS`. */
  group: string;
  /** Only laws on Mayhew's lists of important enactments (assessed through `data.majorThrough`). */
  major: boolean;
  /** Support band 0-4 (data order) picked on card 2; narrows card 1. */
  band: number | null;
  /** Show which party held the House and Senate under each chart. */
  control: boolean;
  /** Index range `[first, last]` into `data.congresses` the window shows; `first > last` = none. */
  window: [number, number];
  /** Congress numbers. */
  hover: number | null;
  pin: number | null;
}

export interface LawsActions {
  setRange: (r: YearRange) => void;
  setGroup: (g: string) => void;
  setMajor: (on: boolean) => void;
  setBand: (b: number | null) => void;
  setControl: (on: boolean) => void;
  moveHover: (congress: number) => void;
  leaveHover: () => void;
  togglePin: (congress: number) => void;
  pinCongress: (congress: number) => void;
  clearPin: () => void;
}

const ValuesCtx = createContext<LawsValues | null>(null);
const ActionsCtx = createContext<LawsActions | null>(null);

export function LawsStateProvider({ data, children }: { data: LawsPayload; children: ReactNode }) {
  const full = useMemo(() => yearSpan(data), [data]);
  const [range, setRangeState] = useState<YearRange>(full);
  const [group, setGroup] = useState(ALL_GROUPS);
  const [major, setMajor] = useState(false);
  const [band, setBand] = useState<number | null>(null);
  const [control, setControl] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [pin, setPin] = useState<number | null>(null);
  const pending = useRef<number | null>(null);
  const raf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const actions = useMemo<LawsActions>(
    () => ({
      setRange: (r) => setRangeState((cur) => (sameRange(cur, r) ? cur : r)),
      setGroup,
      setMajor,
      setBand,
      setControl,
      moveHover: (c) => {
        pending.current = c;
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
      togglePin: (c) => setPin((cur) => (cur === c ? null : c)),
      pinCongress: (c) => setPin(c),
      clearPin: () => setPin(null),
    }),
    [],
  );

  // A pin or hover that has left the window is simply not shown (and comes back if the window widens).
  const values = useMemo<LawsValues>(() => {
    const window = windowIndexes(data, range, major);
    const inWin = (c: number | null) => {
      const i = c === null ? -1 : data.congresses.indexOf(c);
      return i >= window[0] && i <= window[1] ? c : null;
    };
    return { data, range, group, major, band, control, window, hover: inWin(hover), pin: inWin(pin) };
  }, [data, range, group, major, band, control, hover, pin]);

  return (
    <ActionsCtx.Provider value={actions}>
      <ValuesCtx.Provider value={values}>{children}</ValuesCtx.Provider>
    </ActionsCtx.Provider>
  );
}

export function useLawsValues(): LawsValues {
  const v = useContext(ValuesCtx);
  if (!v) throw new Error("useLawsValues outside LawsStateProvider");
  return v;
}

export function useLawsActions(): LawsActions {
  const a = useContext(ActionsCtx);
  if (!a) throw new Error("useLawsActions outside LawsStateProvider");
  return a;
}
