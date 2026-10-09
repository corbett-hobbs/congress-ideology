"use client";

import { useEffect, useState } from "react";
import type { LawsList } from "@/lib/laws-types";

let cached: Promise<LawsList> | null = null;

async function load(version: string): Promise<LawsList> {
  const r = await fetch(`/data/laws/list?v=${encodeURIComponent(version)}`);
  if (!r.ok) throw new Error(`laws list ${r.status}`);
  return (await r.json()) as LawsList;
}

/** The list ships separately from the page (it is several megabytes of JSON, a fraction of that gzipped): fetched once, on mount, then shared. */
export function useLawsList(version: string): { list: LawsList | null; failed: boolean } {
  const [list, setList] = useState<LawsList | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    cached ??= load(version);
    cached.catch(() => (cached = null));
    cached.then(
      (l) => live && setList(l),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [version]);
  return { list, failed };
}
