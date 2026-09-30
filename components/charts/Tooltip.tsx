"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
// Rough tooltip footprint, for the flip-at-edge heuristic. The member tooltip
// adds a ~40px photo, so the box runs a little wider and taller than the text.
const EST_W = 240;
const EST_H = 120;

const EDGE = 8;

export function Tooltip<T>({ state, children }: TooltipProps<T>) {
  // `state` starts null, so server and first client render both produce
  // nothing; the portal only appears after a client-side pointer interaction.
  if (!state || typeof document === "undefined") return null;
  return createPortal(
    <TooltipBox x={state.x} y={state.y}>
      {children(state.data)}
    </TooltipBox>,
    document.body,
  );
}

/** Positions itself from the pointer using the estimate, then measures its real
 *  size and clamps fully inside the viewport (narrow phones, tall cards). */
function TooltipBox({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  let left = x + OFFSET;
  let top = y + OFFSET;
  if (left + EST_W > window.innerWidth) left = x - OFFSET - EST_W;
  if (top + EST_H > window.innerHeight) top = y - OFFSET - EST_H;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    let l = x + OFFSET;
    let t = y + OFFSET;
    if (l + width > vw - EDGE) l = x - OFFSET - width;
    if (t + height > vh - EDGE) t = y - OFFSET - height;
    el.style.left = `${Math.max(EDGE, Math.min(l, vw - width - EDGE))}px`;
    el.style.top = `${Math.max(EDGE, Math.min(t, vh - height - EDGE))}px`;
  });

  return (
    <div ref={ref} className="chart-tooltip" style={{ left, top }}>
      {children}
    </div>
  );
}
