"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { isChamber, type Chamber } from "./chamber";
import type { ChamberHistory } from "./congress-types";

/**
 * The active chamber and state filter live in the URL (`?chamber=house&state=CA`)
 * so a view is shareable and survives a refresh. Absent `chamber` = Senate.
 */

export function useChamber(): Chamber {
  const params = useSearchParams();
  const raw = params.get("chamber");
  return isChamber(raw) ? raw : "senate";
}

export function useStateFilter(): string | null {
  return useSearchParams().get("state") || null;
}

interface ExplorerUrl {
  chamber: Chamber;
  stateFilter: string | null;
  setChamber: (c: Chamber) => void;
  setStateFilter: (s: string | null) => void;
  /** Absolute path to the explorer for a given chamber/state, e.g. for links. */
  explorerHref: (opts: { chamber?: Chamber; state?: string | null }) => string;
}

export function useExplorerUrl(): ExplorerUrl {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const chamber = useChamber();
  const stateFilter = useStateFilter();

  const buildQuery = useCallback(
    (next: { chamber?: Chamber; state?: string | null }) => {
      const sp = new URLSearchParams(params.toString());
      const c = next.chamber ?? chamber;
      if (c === "house") sp.set("chamber", "house");
      else sp.delete("chamber");

      const s = next.state === undefined ? stateFilter : next.state;
      if (s) sp.set("state", s);
      else sp.delete("state");

      const q = sp.toString();
      return q ? `?${q}` : "";
    },
    [params, chamber, stateFilter],
  );

  const explorerHref = useCallback(
    (opts: { chamber?: Chamber; state?: string | null }) => {
      const sp = new URLSearchParams();
      const c = opts.chamber ?? chamber;
      if (c === "house") sp.set("chamber", "house");
      if (opts.state) sp.set("state", opts.state);
      const q = sp.toString();
      return `/${q ? `?${q}` : ""}`;
    },
    [chamber],
  );

  const replace = useCallback(
    (query: string) => {
      router.replace(`${pathname}${query}`, { scroll: false });
    },
    [router, pathname],
  );

  const onExplorer = pathname === "/";

  return {
    chamber,
    stateFilter,
    // On the explorer, flip the URL in place. Elsewhere (a profile page), the
    // switcher navigates back to the explorer in that chamber.
    setChamber: (c) =>
      onExplorer
        ? replace(buildQuery({ chamber: c }))
        : router.push(explorerHref({ chamber: c })),
    setStateFilter: (s) => replace(buildQuery({ state: s })),
    explorerHref,
  };
}

const historyCache = new Map<Chamber, ChamberHistory>();

/**
 * Lazily fetch the full scrub-through-time history for a chamber (the
 * `/data/{chamber}` static asset). `enabled` gates the request — the homepage
 * only needs it once the user scrubs off the current Congress or hits play.
 * Cached across chamber switches and component remounts.
 */
export function useChamberHistory(
  chamber: Chamber,
  enabled: boolean,
): { history: ChamberHistory | null; loading: boolean } {
  const [, force] = useState(0);
  const cached = historyCache.get(chamber) ?? null;

  useEffect(() => {
    if (!enabled || historyCache.has(chamber)) return;
    let cancelled = false;
    fetch(`/data/${chamber}`)
      .then((r) => (r.ok ? (r.json() as Promise<ChamberHistory>) : null))
      .then((h) => {
        if (h && !cancelled) {
          historyCache.set(chamber, h);
          force((n) => n + 1);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [chamber, enabled]);

  return { history: cached, loading: enabled && !cached };
}
