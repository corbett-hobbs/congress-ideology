"use client";

import Link from "next/link";
import { CHAMBERS, chamberLabel, type Chamber } from "@/lib/chamber";
import { useExplorerUrl } from "@/lib/use-chamber";
import { StateFilter } from "@/components/senate/StateFilter";

interface SiteHeaderProps {
  /** Every state (+ territory, for the House) with a current member, by chamber. */
  statesByChamber: Record<Chamber, string[]>;
}

/**
 * Persistent site header: wordmark + the House/Senate switcher + the state
 * filter, on every page. Both controls write the URL (`?chamber=house&state=CA`)
 * and are read the same way everywhere (lib/use-chamber.ts) — selecting either
 * one on a profile page navigates back to the explorer, since that's the only
 * view a state/chamber filters. Stacks on a phone so nothing is cramped.
 */
export function SiteHeader({ statesByChamber }: SiteHeaderProps) {
  const { chamber, setChamber } = useExplorerUrl();

  return (
    <header className="sticky top-0 z-50 border-b border-line-strong bg-surface">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-2 px-4 py-2.5 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-0 sm:px-6">
        <Link
          href="/"
          className="font-serif text-[1.05rem] font-semibold tracking-tight text-ink sm:text-[1.15rem]"
        >
          Congressional Ideology
        </Link>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="hidden font-mono text-[0.62rem] uppercase tracking-[0.08em] text-ink-faint sm:inline">
              Chamber
            </span>
            <div
              role="group"
              aria-label="Chamber"
              className="flex overflow-hidden rounded-lg border border-line-strong text-[0.82rem] font-medium"
            >
              {CHAMBERS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChamber(c)}
                  aria-pressed={chamber === c}
                  className={`px-[0.9rem] py-[0.42rem] transition-colors ${
                    chamber === c
                      ? "bg-accent text-accent-ink"
                      : "bg-surface-raised text-ink-muted hover:text-ink"
                  }`}
                >
                  {chamberLabel(c)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden font-mono text-[0.62rem] uppercase tracking-[0.08em] text-ink-faint sm:inline">
              State
            </span>
            <StateFilter states={statesByChamber[chamber]} compact />
          </div>
        </div>
      </div>
    </header>
  );
}
