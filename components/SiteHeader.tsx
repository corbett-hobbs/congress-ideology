"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SiteNav, SiteSectionNav } from "./SiteNav";
import { useBackLinkHref } from "./BackLinkContext";

/** Pages where the primary nav is itself the way around: the wordmark is a
 *  plain link to "/" with no arrow. Every other page is a detail page. */
const SECTION_PAGES = new Set(["/", "/congress", "/congress/wealth", "/supreme-court"]);

/**
 * Slim bar at the very top of every page: the wordmark plus the primary
 * branch nav (SiteNav), and — for a branch with two or more sections — the
 * secondary section row (SiteSectionNav). Each explorer/section renders its
 * own controls below this — e.g. components/senate/ExplorerToolbar.tsx. The
 * header is not sticky; only those toolbars pin.
 *
 * On detail pages (member profiles, committee pages) the wordmark doubles as
 * the back affordance: "← InsideGov", going to whatever the page registered
 * via `SetBackLink` (falls back to "/") — see components/BackLinkContext.tsx.
 * On the hub and section pages it is a plain link to "/".
 */
export function SiteHeader() {
  const pathname = usePathname();
  const backHref = useBackLinkHref();
  const isDetail = !SECTION_PAGES.has(pathname);

  return (
    <header>
      <div className="border-b border-line bg-surface">
        <div className="mx-auto flex min-h-12 w-full max-w-[1180px] flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-1.5 sm:px-6">
          <Link
            href={isDetail ? backHref : "/"}
            title={isDetail ? "Back to InsideGov" : undefined}
            className="group flex items-center gap-1.5 whitespace-nowrap font-serif text-[0.95rem] font-semibold tracking-tight text-ink sm:text-[1.1rem]"
          >
            {isDetail && (
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
      </div>
      <SiteSectionNav />
    </header>
  );
}
