"use client";

import { useSyncExternalStore } from "react";

/**
 * Tracks a CSS media query. The server snapshot is `false`, so the first paint matches
 * the desktop markup and a phone corrects itself right after hydration; use it only for
 * progressive trimming (like collapsing a long list), never for layout that CSS can do.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", notify);
      return () => m.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
