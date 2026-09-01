"use client";

import { useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { MemberSearchEntry } from "@/lib/congress-types";
import { memberPath } from "@/lib/member-url";
import { memberTitleAbbr } from "@/lib/chamber";
import { GROUP_VAR, seatLabel, stateName } from "./format";

const MAX_RESULTS = 8;

interface SenatorSearchProps {
  entries: MemberSearchEntry[];
  /** "senator" / "representative" for the active chamber (placeholder copy). */
  noun: string;
}

/** Case-insensitive substring match on name and state (abbr or full). */
function match(entries: MemberSearchEntry[], raw: string) {
  const q = raw.trim().toLowerCase();
  if (!q) return [];
  return entries
    .filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.state.toLowerCase().includes(q) ||
        stateName(e.state).toLowerCase().includes(q),
    )
    .slice(0, MAX_RESULTS);
}

export function SenatorSearch({ entries, noun }: SenatorSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const listId = useId();
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const results = useMemo(() => match(entries, query), [entries, query]);

  return (
    <div className="relative ml-auto flex-none">
      <input
        type="text"
        value={query}
        placeholder={`Find a ${noun}…`}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-label={`Find a ${noun}`}
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
          }
        }}
        className="w-[12.5rem] rounded-md border border-line-strong bg-surface-raised px-[0.7rem] py-[0.48rem] text-[0.8rem] text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      />

      {open && query.trim() && (
        <div
          id={listId}
          role="listbox"
          className="absolute right-0 top-[calc(100%+6px)] z-30 max-h-[15rem] w-64 overflow-y-auto rounded-lg border border-line bg-surface p-[0.3rem] shadow-[0_10px_26px_rgba(10,12,16,0.16)]"
        >
          {results.length === 0 ? (
            <p className="p-[0.55rem] text-[0.8rem] text-ink-faint">
              No member of Congress matches “{query.trim()}”.
            </p>
          ) : (
            results.map((e) => (
              <Link
                key={e.bioguideId}
                href={memberPath(e)}
                role="option"
                aria-selected={false}
                onMouseDown={(ev) => ev.preventDefault()}
                className="flex w-full items-center gap-2 rounded-[5px] px-[0.55rem] py-[0.4rem] text-left text-[0.82rem] hover:bg-surface-raised"
              >
                <span
                  className="size-[0.55rem] flex-none rounded-full"
                  style={{ background: GROUP_VAR[e.group] }}
                />
                {e.name}
                <span className="ml-auto font-mono text-[0.72rem] text-ink-faint">
                  {memberTitleAbbr(e.chamber)} {seatLabel(e)}
                </span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
