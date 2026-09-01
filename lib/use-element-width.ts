"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

// useLayoutEffect warns during SSR (no DOM to measure); useEffect is a no-op
// there anyway, so swap in the browser only.
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Tracks an element's rendered content width. Used to size a chart's SVG
 * viewBox to its actual container instead of a fixed logical width that then
 * gets stretched or shrunk by the browser — the latter is what makes chart
 * text unreadably small on a narrow phone screen (a viewBox built for a
 * ~1100px desktop panel, displayed at 1:1 via `width: 100%`, renders 3x
 * smaller on a 330px mobile card).
 *
 * Measures synchronously on mount (a plain `getBoundingClientRect`, so it's
 * correct even for the very first paint — no flash of the fallback width) and
 * re-measures on ResizeObserver, window resize, and the tab becoming visible
 * (a page can finish loading in a background tab, where some browsers
 * deprioritize layout-observer callbacks until it's actually shown).
 *
 * Returns a ref to attach to the measured wrapper and its current width in
 * CSS px (0 until the first measurement, i.e. before mount/hydration).
 */
export function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w) setWidth(Math.round(w));
    };
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    document.addEventListener("visibilitychange", measure);
    // A couple of deferred re-checks catch anything the effects above miss
    // (e.g. a web font swap reflowing the row just after first paint).
    const raf = requestAnimationFrame(measure);
    const timer = setTimeout(measure, 300);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("visibilitychange", measure);
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, []);

  return [ref, width];
}
