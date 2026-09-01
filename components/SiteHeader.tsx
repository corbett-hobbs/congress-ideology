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
      <div className="mx-auto flex h-12 w-full max-w-[1180px] items-center justify-between gap-2 px-4 sm:px-6">
        <Link
          href="/"
          className="min-w-0 shrink truncate font-serif text-[0.85rem] font-semibold tracking-tight text-ink sm:text-[0.95rem]"
        >
          The Ideology Space
        </Link>

        <div className="flex shrink-0 items-center gap-2">
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

          <StateFilter states={statesByChamber[chamber]} compact />
        </div>
      </div>
    </header>
  );
}
