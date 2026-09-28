"use client";

import { CHAMBER_VIEWS, viewLabel, type ChamberView } from "@/lib/chamber";

/**
 * The three-way Both / Senate / House pill switch — a controlled component,
 * no state of its own. Used by the explorer's toolbar
 * (components/senate/ExplorerToolbar.tsx, wired to the shared URL state) and
 * /wealth's filter bar (components/wealth/WealthFilterBar.tsx, wired to
 * page-level state).
 */
export function ChamberSwitch({
  value,
  onChange,
}: {
  value: ChamberView;
  onChange: (v: ChamberView) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Chamber"
      className="flex flex-none overflow-hidden rounded-lg border border-line-strong text-[0.8rem] font-medium"
    >
      {CHAMBER_VIEWS.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={`px-2 py-[0.35rem] transition-colors sm:px-[0.85rem] ${
            value === v
              ? "bg-accent text-accent-ink"
              : "bg-surface-raised text-ink-muted hover:text-ink"
          }`}
        >
          {viewLabel(v)}
        </button>
      ))}
    </div>
  );
}
