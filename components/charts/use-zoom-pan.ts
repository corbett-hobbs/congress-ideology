"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

/**
 * Zoom + pan for a square-domain scatter. The view is a window into the base
 * domain `[-extent, extent]` on both axes: zoom `k` shrinks the window, `cx/cy`
 * is its centre. Zooming the *domain* (rather than scaling the SVG) keeps dots
 * and text at constant pixel size and gridlines crisp.
 *
 * Inputs: +/- buttons, Ctrl/⌘ + wheel (also what a trackpad pinch emits),
 * two-finger pinch, drag to pan, double-click to zoom in. Plain wheel is left
 * alone so the page still scrolls past the chart.
 */

export interface ZoomView {
  k: number;
  cx: number;
  cy: number;
}

export const FIT_VIEW: ZoomView = { k: 1, cx: 0, cy: 0 };

/** Client-px rectangle of the plot area (inside the margins). */
export interface PlotBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

const BUTTON_STEP = 1.6;
const DRAG_THRESHOLD_PX = 4;

export function clampView(v: ZoomView, extent: number, maxK: number): ZoomView {
  const k = Math.min(maxK, Math.max(1, v.k));
  const slack = extent - extent / k;
  return {
    k,
    cx: Math.min(slack, Math.max(-slack, v.cx)),
    cy: Math.min(slack, Math.max(-slack, v.cy)),
  };
}

/** Visible `[min, max]` on each axis for a view (y is domain-up). */
export function viewDomains(v: ZoomView, extent: number) {
  const h = extent / v.k;
  return {
    x: [v.cx - h, v.cx + h] as [number, number],
    y: [v.cy - h, v.cy + h] as [number, number],
  };
}

/** Zoom by `factor` keeping the domain point at plot fraction (fx, fy from the
 *  top-left) fixed under the cursor. */
function zoomAt(
  v: ZoomView,
  factor: number,
  fx: number,
  fy: number,
  extent: number,
  maxK: number,
): ZoomView {
  const k = Math.min(maxK, Math.max(1, v.k * factor));
  const h = extent / v.k;
  const h2 = extent / k;
  const ax = v.cx - h + 2 * h * fx;
  const ay = v.cy + h - 2 * h * fy;
  return clampView({ k, cx: ax + h2 - 2 * h2 * fx, cy: ay - h2 + 2 * h2 * fy }, extent, maxK);
}

interface Options {
  svgRef: RefObject<SVGSVGElement | null>;
  /** Base domain is `[-extent, extent]` on both axes. */
  extent: number;
  maxK?: number;
  /** Current plot-area rectangle in client px (read inside event handlers). */
  getPlotBox: () => PlotBox | null;
  /** Fires on any zoom/pan input — used to drop stale tooltips. */
  onViewChange?: () => void;
}

export function useZoomPan({
  svgRef,
  extent,
  maxK = 16,
  getPlotBox,
  onViewChange,
}: Options) {
  const [view, setViewState] = useState<ZoomView>(FIT_VIEW);
  const viewRef = useRef(view);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startX: number; startY: number; dragging: boolean } | null>(null);
  const justDragged = useRef(false);
  const getBoxRef = useRef(getPlotBox);
  const onChangeRef = useRef(onViewChange);
  useEffect(() => {
    getBoxRef.current = getPlotBox;
    onChangeRef.current = onViewChange;
  });

  const setView = useCallback(
    (next: ZoomView) => {
      const clamped = clampView(next, extent, maxK);
      viewRef.current = clamped;
      setViewState(clamped);
      onChangeRef.current?.();
    },
    [extent, maxK],
  );

  const fractionOf = useCallback((clientX: number, clientY: number) => {
    const box = getBoxRef.current();
    if (!box || box.width <= 0 || box.height <= 0) return { fx: 0.5, fy: 0.5 };
    return {
      fx: Math.min(1, Math.max(0, (clientX - box.left) / box.width)),
      fy: Math.min(1, Math.max(0, (clientY - box.top) / box.height)),
    };
  }, []);

  const zoomBy = useCallback(
    (factor: number, at?: { clientX: number; clientY: number }) => {
      const { fx, fy } = at ? fractionOf(at.clientX, at.clientY) : { fx: 0.5, fy: 0.5 };
      setView(zoomAt(viewRef.current, factor, fx, fy, extent, maxK));
    },
    [extent, maxK, fractionOf, setView],
  );

  const zoomIn = useCallback(() => zoomBy(BUTTON_STEP), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(1 / BUTTON_STEP), [zoomBy]);
  const reset = useCallback(() => setView(FIT_VIEW), [setView]);
  /** Pan (keeping the zoom) so a domain point sits at the centre. */
  const centerOn = useCallback(
    (x: number, y: number) => setView({ ...viewRef.current, cx: x, cy: y }),
    [setView],
  );

  // Wheel needs a non-passive native listener to preventDefault page zoom.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.01));
      zoomBy(factor, e);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [svgRef, zoomBy]);

  const panByPx = useCallback(
    (dx: number, dy: number) => {
      const box = getBoxRef.current();
      if (!box || box.width <= 0 || box.height <= 0) return;
      const v = viewRef.current;
      const span = (2 * extent) / v.k;
      setView({
        ...v,
        cx: v.cx - (dx / box.width) * span,
        cy: v.cy + (dy / box.height) * span,
      });
    },
    [extent, setView],
  );

  const svgProps = {
    onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 1) {
        gesture.current = { startX: e.clientX, startY: e.clientY, dragging: false };
      }
    },
    onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => {
      const prev = pointers.current.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };
      const all = [...pointers.current.values()];

      if (all.length >= 2) {
        // Pinch: zoom about the midpoint, pan by its drift.
        const [a, b] = all;
        const oldDist = Math.hypot(a.x - b.x, a.y - b.y);
        const oldMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        pointers.current.set(e.pointerId, cur);
        const [c, d] = [...pointers.current.values()];
        const newDist = Math.hypot(c.x - d.x, c.y - d.y);
        const newMid = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 };
        if (gesture.current) gesture.current.dragging = true;
        panByPx(newMid.x - oldMid.x, newMid.y - oldMid.y);
        if (oldDist > 0 && newDist > 0) {
          zoomBy(newDist / oldDist, { clientX: newMid.x, clientY: newMid.y });
        }
        return;
      }

      const g = gesture.current;
      if (!g) return;
      if (!g.dragging) {
        if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < DRAG_THRESHOLD_PX) return;
        // Nothing to pan at full fit; leave the gesture a plain click/hover.
        if (viewRef.current.k <= 1) return;
        g.dragging = true;
        svgRef.current?.setPointerCapture(e.pointerId);
      }
      pointers.current.set(e.pointerId, cur);
      panByPx(cur.x - prev.x, cur.y - prev.y);
    },
    onPointerUp: endPointer,
    onPointerCancel: endPointer,
    onDoubleClick: (e: React.MouseEvent<SVGSVGElement>) => {
      zoomBy(BUTTON_STEP * 1.25, e);
    },
    // Swallow the click that ends a drag so it doesn't open a dot's profile.
    onClickCapture: (e: React.MouseEvent<SVGSVGElement>) => {
      if (justDragged.current) {
        justDragged.current = false;
        e.stopPropagation();
        e.preventDefault();
      }
    },
  };

  function endPointer(e: React.PointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId);
    if (svgRef.current?.hasPointerCapture(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }
    if (pointers.current.size === 0) {
      justDragged.current = gesture.current?.dragging ?? false;
      gesture.current = null;
      // A drag that ends off the svg produces no click; don't let the flag
      // linger and eat the next real one.
      if (justDragged.current) setTimeout(() => (justDragged.current = false), 0);
    }
  }

  return useMemo(
    () => ({
      view,
      svgProps,
      zoomIn,
      zoomOut,
      reset,
      centerOn,
      setView,
      zoomed: view.k > 1,
      canZoomIn: view.k < maxK,
    }),
    // svgProps handlers only close over refs and stable callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, zoomIn, zoomOut, reset, centerOn, setView, maxK],
  );
}
