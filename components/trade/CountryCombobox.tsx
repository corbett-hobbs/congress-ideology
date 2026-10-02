"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { filterCountries } from "@/lib/trade-country-search";
import type { TradeCountryRef } from "@/lib/trade-types";

const ALL = { code: "", name: "All countries" } as const;

/**
 * Country picker you can type into or open and scroll: typing filters the list (names that
 * start with the text first), arrows move, Enter picks, Escape cancels. "All countries" is
 * the first option. Standard combobox/listbox semantics.
 */
export function CountryCombobox({
  countries,
  value,
  onChange,
  className = "",
}: {
  countries: readonly TradeCountryRef[];
  /** `country_code`, or null for all countries. */
  value: string | null;
  onChange: (code: string | null) => void;
  className?: string;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  /** What the user has typed, or null when they are not editing (the input then shows the selection). */
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = value ? countries.find((c) => c.code === value) : undefined;
  const options = useMemo(() => {
    const found = filterCountries(countries, query ?? "");
    const all = !query || "all countries".includes(query.trim().toLowerCase()) ? [ALL] : [];
    return [...all, ...found];
  }, [countries, query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = (code: string) => {
    onChange(code || null);
    setQuery(null);
    setOpen(false);
  };
  const cancel = () => {
    setQuery(null);
    setOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${id}-opt-${active}` : undefined}
        aria-label="Country"
        autoComplete="off"
        spellCheck={false}
        placeholder="All countries"
        value={query ?? selected?.name ?? ""}
        onFocus={(e) => {
          e.currentTarget.select();
          setActive(0);
          setOpen(true);
        }}
        onBlur={cancel}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) setOpen(true);
            else setActive((a) => Math.min(options.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            if (open && options[active]) {
              e.preventDefault();
              pick(options[active].code);
            }
          } else if (e.key === "Escape") {
            if (open) {
              e.preventDefault();
              cancel();
            }
          }
        }}
        className="h-11 w-full min-w-0 rounded-md border border-line-strong bg-surface-raised px-[0.55rem] py-[0.42rem] text-[0.8rem] text-ink placeholder:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:h-auto"
      />
      {open && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label="Countries"
          className="absolute left-0 z-50 mt-1 max-h-64 w-full min-w-[12rem] overflow-y-auto rounded-md border border-line-strong bg-surface py-1 text-[0.82rem] shadow-lg"
        >
          {options.length === 0 && <li role="presentation" className="px-3 py-2 text-ink-muted">No country matches “{query}”.</li>}
          {options.map((o, i) => (
            <li
              key={o.code || "all"}
              id={`${id}-opt-${i}`}
              data-index={i}
              role="option"
              aria-selected={(value ?? "") === o.code}
              // mousedown, not click: the input's blur would close the list before a click lands.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o.code);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-1.5 ${i === active ? "bg-surface-raised" : ""} ${(value ?? "") === o.code ? "font-semibold text-ink" : "text-ink"}`}
            >
              {o.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
