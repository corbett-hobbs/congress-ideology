"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SiteNav } from "./SiteNav";
import { useBackLinkHref } from "./BackLinkContext";

/**
 * Slim bar at the very top of every page: the wordmark plus the top-level
 * section nav (SiteNav). Each explorer/section renders its own controls below
 * this — e.g. components/senate/ExplorerToolbar.tsx.
 *
 * The wordmark doubles as the back-to-home affordance on sub-pages (member
 * profiles, committee pages): "← InsideGov" there, plain "InsideGov" on the
 * homepage itself, where a back-arrow pointing at itself would be confusing.
 * The destination is whatever the current page registered via `SetBackLink`
 * (falls back to "/") — see components/BackLinkContext.tsx. This replaces a
 * second, separate "← INSIDEGOV" link that used to sit below the header on
 * every sub-page and did the exact same thing as the wordmark already did.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const backHref = useBackLinkHref();
  const isHome = pathname === "/";

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex min-h-12 w-full max-w-[1180px] flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-1.5 sm:px-6">
        <Link
          href={isHome ? "/" : backHref}
          title={isHome ? undefined : "Back to InsideGov"}
          className="group flex items-center gap-1.5 whitespace-nowrap font-serif text-[0.95rem] font-semibold tracking-tight text-ink sm:text-[1.1rem]"
        >
          {!isHome && (
            <span
              aria-hidden
              className="font-sans text-[0.85em] font-medium text-ink-muted transition-colors group-hover:text-accent"
            >
              ←
            </span>
          )}
          InsideGov
        </Link>
        <SiteNav />
      </div>
    </header>
  );
}
