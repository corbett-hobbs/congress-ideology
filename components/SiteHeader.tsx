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
 * Persistent site header: wordmark + the state filter + the House/Senate
 * switcher, on every page. Both filters write to the URL
 * (`?chamber=house&state=CA`) and are read the same way everywhere
 * (lib/use-chamber.ts) — selecting either one on a profile page navigates
 * back to the explorer, since that's the only view a state/chamber filters.
 */
export function SiteHeader({ statesByChamber }: SiteHeaderProps) {
  const { chamber, setChamber } = useExplorerUrl();

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-2 sm:h-12 sm:flex-nowrap sm:py-0">
        <Link
          href="/"
          className="font-serif text-[0.95rem] font-semibold tracking-tight text-ink"
        >
          The Ideology Space
        </Link>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <StateFilter states={statesByChamber[chamber]} compact />

          <div
            role="group"
            aria-label="Chamber"
            className="flex flex-none overflow-hidden rounded-md border border-line-strong text-[0.75rem] font-medium"
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
      </div>
    </header>
  );
}
