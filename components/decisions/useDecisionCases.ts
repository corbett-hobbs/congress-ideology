"use client";

import { useEffect, useState } from "react";
import type { DecisionCase } from "@/lib/decisions-types";

let cached: Promise<DecisionCase[]> | null = null;

/** The case list ships separately from the page (it is most of a megabyte): fetched once, on mount, then shared. */
function load(): Promise<DecisionCase[]> {
  cached ??= fetch("/data/decisions/cases").then((r) => {
    if (!r.ok) throw new Error(`cases ${r.status}`);
    return r.json() as Promise<DecisionCase[]>;
  });
  cached.catch(() => (cached = null));
  return cached;
}

export function useDecisionCases(): { cases: DecisionCase[] | null; failed: boolean } {
  const [cases, setCases] = useState<DecisionCase[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    load().then(
      (c) => live && setCases(c),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);
  return { cases, failed };
}
