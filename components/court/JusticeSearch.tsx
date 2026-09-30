"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { CourtJustice } from "@/lib/court-types";

const MAX_RESULTS = 8;

/**
 * "Find a justice" combobox. Patterned on components/senate/SenatorSearch.tsx,
 * but a pick selects the justice in the shared explorer state instead of
 * navigating (there are no justice profile pages).
 */
export function JusticeSearch({
  justices,
  onPick,
}: {
  justices: CourtJustice[];
  onPick: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const listId = useId();
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return justices
      .filter((j) => j.name.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
  }, [justices, query]);

  const pick = (id: number) => {
    onPick(id);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="relative min-w-0 flex-1 sm:ml-auto sm:w-[12.5rem] sm:flex-none">
      <input
        type="text"
        value={query}
        placeholder="Find a justice…"
        autoComplete="off"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-label="Find a justice"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setQuery("");
            setOpen(false);
          } else if (e.key === "Enter" && results[0]) {
            e.preventDefault();
            pick(results[0].id);
          }
        }}
        className="w-full rounded-md border border-line-strong bg-surface-raised px-[0.7rem] py-[0.48rem] text-[0.8rem] text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      />

      {open && query.trim() && (
        <div
          id={listId}
          role="listbox"
          className="absolute right-0 top-[calc(100%+6px)] z-30 max-h-[15rem] w-full min-w-[16rem] overflow-y-auto rounded-lg border border-line bg-surface p-[0.3rem] shadow-[0_10px_26px_rgba(10,12,16,0.16)] sm:w-72"
        >
          {results.length === 0 ? (
            <p className="p-[0.55rem] text-[0.8rem] text-ink-faint">
              No justice matches “{query.trim()}”.
            </p>
          ) : (
            results.map((j) => (
              <button
                key={j.id}
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => pick(j.id)}
                className="flex w-full items-center gap-2 rounded-[5px] px-[0.55rem] py-[0.4rem] text-left text-[0.82rem] hover:bg-surface-raised focus-visible:bg-surface-raised"
              >
                <span
                  className="size-[0.55rem] flex-none rounded-full"
                  style={{ background: j.party === "D" ? "var(--dem)" : "var(--rep)" }}
                />
                {j.name}
                <span className="ml-auto font-mono text-[0.72rem] text-ink-faint">
                  {j.t0}–{j.t1}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
