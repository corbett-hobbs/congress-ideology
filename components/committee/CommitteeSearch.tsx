"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CommitteeSearchEntry } from "@/lib/committee-types";
import { committeePath } from "@/lib/committee-url";
import { GROUP_VAR } from "@/components/senate/format";

const MAX_RESULTS = 8;

const CHAMBER_TAG = { house: "House", senate: "Senate", joint: "Joint" } as const;

/** Case-insensitive substring match on committee name / short name. */
function match(entries: CommitteeSearchEntry[], raw: string) {
  const q = raw.trim().toLowerCase();
  if (!q) return [];
  return entries
    .filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.shortName.toLowerCase().includes(q),
    )
    .slice(0, MAX_RESULTS);
}

/**
 * The committees-view analogue of `SenatorSearch` — same dropdown chrome, but a
 * committee name is self-sufficient so the rows carry only a control-party dot
 * and a chamber/size tag.
 */
export function CommitteeSearch({ entries }: { entries: CommitteeSearchEntry[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const listId = useId();

  const results = useMemo(() => match(entries, query), [entries, query]);

  return (
    <div className="relative min-w-0 flex-1 sm:ml-auto sm:w-[12.5rem] sm:flex-none">
      <input
        type="text"
        value={query}
        placeholder="Find a committee…"
        autoComplete="off"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-label="Find a committee"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setQuery("");
            setOpen(false);
          }
        }}
        className="w-full rounded-md border border-line-strong bg-surface-raised px-[0.7rem] py-[0.48rem] text-[0.8rem] text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      />

      {open && query.trim() && (
        <div
          id={listId}
          role="listbox"
          className="absolute right-0 top-[calc(100%+6px)] z-30 max-h-[15rem] w-full min-w-[16rem] overflow-y-auto rounded-lg border border-line bg-surface p-[0.3rem] shadow-[0_10px_26px_rgba(10,12,16,0.16)] sm:w-64"
        >
          {results.length === 0 ? (
            <p className="p-[0.55rem] text-[0.8rem] text-ink-faint">
              No committee matches “{query.trim()}”.
            </p>
          ) : (
            results.map((e) => (
              <button
                key={e.committeeId}
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => {
                  router.push(committeePath(e));
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center gap-2 rounded-[5px] px-[0.55rem] py-[0.4rem] text-left text-[0.82rem] hover:bg-surface-raised"
              >
                <span
                  className="size-[0.55rem] flex-none rounded-full"
                  style={{ background: GROUP_VAR[e.controlGroup] }}
                />
                <span className="min-w-0 truncate">{e.shortName}</span>
                <span className="ml-auto flex-none font-mono text-[0.72rem] text-ink-faint">
                  {CHAMBER_TAG[e.chamber]} · {e.memberCount}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
