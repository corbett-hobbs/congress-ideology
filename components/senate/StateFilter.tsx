"use client";

import { stateName } from "@/lib/states";

const BASE_CLASS =
  "rounded-md border border-line-strong bg-surface-raised text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/**
 * State dropdown — a controlled select, no state of its own. The explorer
 * (components/senate/ExplorerToolbar.tsx) wires it to the shared URL state
 * (lib/use-chamber.ts); /wealth (components/wealth/WealthFilterBar.tsx)
 * wires it to page-level state instead. Same component either way — only the
 * value/onChange source differs.
 */
export function StateFilter({
  states,
  value,
  onChange,
  compact = false,
  disabled = false,
  disabledTitle,
}: {
  states: string[];
  /** Two-letter code, or `null` for "All states". */
  value: string | null;
  onChange: (state: string | null) => void;
  /** Smaller footprint for the site header vs. the explorer's own controls. */
  compact?: boolean;
  /** Kept in place but inert (committees view — a committee has no state). */
  disabled?: boolean;
  disabledTitle?: string;
}) {
  return (
    <select
      aria-label="Filter by state"
      value={value ?? ""}
      disabled={disabled}
      title={disabled ? disabledTitle : undefined}
      onChange={(e) => onChange(e.target.value || null)}
      className={`${BASE_CLASS} disabled:cursor-not-allowed disabled:opacity-40 ${
        compact
          ? "max-w-[7rem] px-[0.5rem] py-[0.42rem] text-[0.8rem] sm:max-w-[8.5rem] sm:px-[0.55rem]"
          : "w-full px-[0.6rem] py-[0.48rem] text-[0.8rem] sm:w-auto"
      }`}
    >
      <option value="">All states</option>
      {states.map((s) => (
        <option key={s} value={s}>
          {stateName(s)}
        </option>
      ))}
    </select>
  );
}
