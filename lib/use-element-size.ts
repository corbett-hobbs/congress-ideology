"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * An element's rendered content box (width and height, CSS px), for a chart
 * that must FILL a box whose size the layout decides — the justice page's left
 * chart fills whatever height the grid row gives it. Sibling of
 * `use-element-width.ts` (width only), kept separate so that hook's return shape
 * doesn't change. `{0, 0}` until the first measurement (before hydration).
 */
export function useElementSize<T extends HTMLElement>(): [
  RefObject<T | null>,
  { width: number; height: number },
] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      setSize((s) =>
        Math.round(width) === s.width && Math.round(height) === s.height
          ? s
          : { width: Math.round(width), height: Math.round(height) },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, size];
}
