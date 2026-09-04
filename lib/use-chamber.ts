"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { isChamber, isChamberView, type Chamber, type ChamberView } from "./chamber";
import type { ChamberHistory, ChamberMember } from "./congress-types";

/**
 * The explorer's chamber view and state filter live in the URL
 * (`?chamber=house&state=CA`) so a view is shareable and survives a refresh.
 * Absent `chamber` = the blended "both" view (the default).
 */

/** The active chamber for a member profile page (from the URL path). */
export function useChamber(): Chamber {
  const params = useSearchParams();
  const pathname = usePathname();
  const raw = params.get("chamber");
  if (isChamber(raw)) return raw;
  if (pathname.startsWith("/congress/house")) return "house";
  return "senate";
}

/** The explorer's chamber view — "both" unless the URL says otherwise. */
export function useChamberView(): ChamberView {
  const raw = useSearchParams().get("chamber");
  return isChamberView(raw) ? raw : "both";
}

export function useStateFilter(): string | null {
  return useSearchParams().get("state") || null;
}

/** Members vs. committees on the explorer — `?show=committees`, else members. */
export type ExplorerEntity = "members" | "committees";

export function useExplorerEntity(): ExplorerEntity {
  return useSearchParams().get("show") === "committees" ? "committees" : "members";
}

interface ExplorerUrl {
  view: ChamberView;
  stateFilter: string | null;
  entity: ExplorerEntity;
  setView: (v: ChamberView) => void;
  setStateFilter: (s: string | null) => void;
  setEntity: (e: ExplorerEntity) => void;
  explorerHref: (opts: { view?: ChamberView; state?: string | null }) => string;
}

export function useExplorerUrl(): ExplorerUrl {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = useChamberView();
  const stateFilter = useStateFilter();
  const entity = useExplorerEntity();

  const buildQuery = useCallback(
    (next: {
      view?: ChamberView;
      state?: string | null;
      entity?: ExplorerEntity;
    }) => {
      const sp = new URLSearchParams(params.toString());
      const v = next.view ?? view;
      if (v === "senate" || v === "house") sp.set("chamber", v);
      else sp.delete("chamber");

      const e = next.entity ?? entity;
      // Committees aren't scoped to a state — switching to them drops the filter.
      const s =
        e === "committees"
          ? null
          : next.state === undefined
            ? stateFilter
            : next.state;
      if (s) sp.set("state", s);
      else sp.delete("state");

      if (e === "committees") sp.set("show", "committees");
      else sp.delete("show");

      const q = sp.toString();
      return q ? `?${q}` : "";
    },
    [params, view, stateFilter, entity],
  );

  const explorerHref = useCallback(
    (opts: { view?: ChamberView; state?: string | null }) => {
      const sp = new URLSearchParams();
      const v = opts.view ?? view;
      if (v === "senate" || v === "house") sp.set("chamber", v);
      if (opts.state) sp.set("state", opts.state);
      const q = sp.toString();
      return `/${q ? `?${q}` : ""}`;
    },
    [view],
  );

  const replace = useCallback(
    (query: string) => {
      router.replace(`${pathname}${query}`, { scroll: false });
    },
    [router, pathname],
  );

  const onExplorer = pathname === "/";

  return {
    view,
    stateFilter,
    entity,
    setView: (v) =>
      onExplorer
        ? replace(buildQuery({ view: v }))
        : router.push(explorerHref({ view: v })),
    setStateFilter: (s) =>
      onExplorer
        ? replace(buildQuery({ state: s }))
        : router.push(explorerHref({ state: s })),
    setEntity: (e) => replace(buildQuery({ entity: e })),
    explorerHref,
  };
}

// --- lazy history --------------------------------------------------------

const rawCache = new Map<Chamber, ChamberHistory>();
const viewCache = new Map<ChamberView, ChamberHistory>();

async function fetchChamberHistory(chamber: Chamber): Promise<ChamberHistory | null> {
  const cached = rawCache.get(chamber);
  if (cached) return cached;
  try {
    const r = await fetch(`/data/${chamber}`);
    if (!r.ok) return null;
    const h = (await r.json()) as ChamberHistory;
    rawCache.set(chamber, h);
    return h;
  } catch {
    return null;
  }
}

function mergeHistories(a: ChamberHistory, b: ChamberHistory): ChamberHistory {
  const congresses = [
    ...new Set([...a.congresses, ...b.congresses]),
  ].sort((x, y) => x - y);
  const allByCongress: Record<number, ChamberMember[]> = {};
  for (const c of congresses) {
    allByCongress[c] = [
      ...(a.allByCongress[c] ?? []),
      ...(b.allByCongress[c] ?? []),
    ];
  }
  return { chamber: "both", congresses, allByCongress };
}

/**
 * Lazily fetch the full scrub-through-time history for a view. Single chambers
 * pull `/data/{chamber}`; "both" pulls both and merges them. `enabled` gates
 * the request. Cached across view switches and remounts.
 */
export function useChamberHistory(
  view: ChamberView,
  enabled: boolean,
): { history: ChamberHistory | null; loading: boolean } {
  const [, force] = useState(0);
  const cached = viewCache.get(view) ?? null;

  useEffect(() => {
    if (!enabled || viewCache.has(view)) return;
    let cancelled = false;
    const chambers: Chamber[] = view === "both" ? ["house", "senate"] : [view];
    Promise.all(chambers.map(fetchChamberHistory)).then((results) => {
      if (cancelled || results.some((r) => !r)) return;
      const merged =
        view === "both"
          ? mergeHistories(results[0] as ChamberHistory, results[1] as ChamberHistory)
          : (results[0] as ChamberHistory);
      viewCache.set(view, merged);
      force((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [view, enabled]);

  return { history: cached, loading: enabled && !cached };
}
