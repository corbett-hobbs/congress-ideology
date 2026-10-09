"use client";

import { useEffect, useState } from "react";
import type { CommitteeBillsPayload, CommitteeBillsSummary } from "@/lib/committee-bills-types";

const cache = new Map<string, Promise<CommitteeBillsPayload>>();

async function load(s: CommitteeBillsSummary): Promise<CommitteeBillsPayload> {
  const r = await fetch(`/data/committees/${s.committeeId}/bills?v=${encodeURIComponent(s.version)}`);
  if (!r.ok) throw new Error(`committee bills ${r.status}`);
  return (await r.json()) as CommitteeBillsPayload;
}

/** One committee's bills ship separately from the page (a few hundred KB of JSON, a fraction of that gzipped): fetched once, on mount, then shared. */
export function useCommitteeBills(summary: CommitteeBillsSummary): { payload: CommitteeBillsPayload | null; failed: boolean } {
  const [payload, setPayload] = useState<CommitteeBillsPayload | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    const key = `${summary.committeeId}|${summary.version}`;
    const p = cache.get(key) ?? load(summary);
    cache.set(key, p);
    p.catch(() => cache.delete(key));
    p.then(
      (v) => live && setPayload(v),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [summary]);
  return { payload, failed };
}
