"use client";

import { useEffect, useState } from "react";
import type { DecisionCase } from "@/lib/decisions-types";

/** Fields per row in the current shape (see `DecisionCase`). An older cached copy has fewer, and would silently lack the landmark flag. */
const ROW_FIELDS = 10;

let cached: Promise<DecisionCase[]> | null = null;

async function get(version: string, cache: RequestCache): Promise<DecisionCase[]> {
  const r = await fetch(`/data/decisions/cases?v=${encodeURIComponent(version)}`, { cache });
  if (!r.ok) throw new Error(`cases ${r.status}`);
  return (await r.json()) as DecisionCase[];
}

/** The case list ships separately from the page (it is most of a megabyte): fetched once, on mount, then shared. */
function load(version: string): Promise<DecisionCase[]> {
  cached ??= get(version, "default").then((rows) => (rows[0]?.length === ROW_FIELDS ? rows : get(version, "reload")));
  cached.catch(() => (cached = null));
  return cached;
}

export function useDecisionCases(version: string): { cases: DecisionCase[] | null; failed: boolean } {
  const [cases, setCases] = useState<DecisionCase[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    load(version).then(
      (c) => live && setCases(c),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [version]);
  return { cases, failed };
}
