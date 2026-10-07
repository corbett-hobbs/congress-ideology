"use client";

import { useState, type ReactNode } from "react";

/** Which one line of a multi-line chart is isolated (null = all shown). Clicking the isolated key again shows all. */
export function useIsolate<K extends string>(): [K | null, (k: K) => void] {
  const [only, setOnly] = useState<K | null>(null);
  return [only, (k: K) => setOnly((cur) => (cur === k ? null : k))];
}

/**
 * A legend entry that keeps only its own line on the chart when clicked, and brings the others back when
 * clicked again. While another line is isolated this one is dimmed. Reads as plain legend text otherwise.
 */
export function LegendToggle({ active, dimmed, onClick, children }: { active: boolean; dimmed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={active ? "Click to show every line again" : "Click to show only this line"}
      className={`inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-sm border-0 bg-transparent p-0 text-left font-[inherit] text-[length:inherit] text-inherit transition-opacity hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${dimmed ? "opacity-40" : ""} ${active ? "font-semibold text-ink" : ""}`}
    >
      {children}
    </button>
  );
}
