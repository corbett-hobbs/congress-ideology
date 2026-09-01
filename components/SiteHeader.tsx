"use client";

import Link from "next/link";
import { CHAMBERS, chamberLabel } from "@/lib/chamber";
import { useExplorerUrl } from "@/lib/use-chamber";

/**
 * Persistent site header: wordmark + the House / Senate switcher, on every
 * page. The switcher writes `?chamber=` on the explorer and navigates to the
 * explorer from anywhere else. See lib/use-chamber.ts.
 */
export function SiteHeader() {
  const { chamber, setChamber } = useExplorerUrl();

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-12 w-full max-w-[1180px] items-center justify-between px-6">
        <Link
          href="/"
          className="font-serif text-[0.95rem] font-semibold tracking-tight text-ink"
        >
          The Ideology Space
        </Link>

        <div
          role="group"
          aria-label="Chamber"
          className="flex overflow-hidden rounded-md border border-line-strong text-[0.75rem] font-medium"
        >
          {CHAMBERS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setChamber(c)}
              aria-pressed={chamber === c}
              className={`px-[0.7rem] py-[0.28rem] transition-colors ${
                chamber === c
                  ? "bg-accent text-accent-ink"
                  : "bg-surface text-ink-muted hover:text-ink"
              }`}
            >
              {chamberLabel(c)}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
