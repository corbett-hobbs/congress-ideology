"use client";

import { useCallback, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface TooltipState<T> {
  data: T;
  x: number;
  y: number;
}

interface PointerLike {
  clientX: number;
  clientY: number;
}

/**
 * Pointer-following tooltip state. `show` on enter, `move` on move, `hide` on
 * leave. Chart-agnostic — the content is supplied by <Tooltip>.
 */
export function useTooltip<T>() {
  const [state, setState] = useState<TooltipState<T> | null>(null);

  const show = useCallback((data: T, e: PointerLike) => {
    setState({ data, x: e.clientX, y: e.clientY });
  }, []);
  const move = useCallback((e: PointerLike) => {
    setState((s) => (s ? { ...s, x: e.clientX, y: e.clientY } : s));
  }, []);
  const hide = useCallback(() => setState(null), []);

  return { state, show, move, hide };
}

interface TooltipProps<T> {
  state: TooltipState<T> | null;
  children: (data: T) => ReactNode;
}

const OFFSET = 14;
const EST_W = 208;
const EST_H = 92;

export function Tooltip<T>({ state, children }: TooltipProps<T>) {
  // `state` starts null, so server and first client render both produce
  // nothing; the portal only appears after a client-side pointer interaction.
  if (!state || typeof document === "undefined") return null;

  let left = state.x + OFFSET;
  let top = state.y + OFFSET;
  if (left + EST_W > window.innerWidth) left = state.x - OFFSET - EST_W;
  if (top + EST_H > window.innerHeight) top = state.y - OFFSET - EST_H;

  return createPortal(
    <div className="chart-tooltip" style={{ left, top }}>
      {children(state.data)}
    </div>,
    document.body,
  );
}
