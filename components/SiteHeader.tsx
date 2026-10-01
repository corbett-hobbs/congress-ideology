"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SiteNav, SiteSectionNav } from "./SiteNav";
import { useBackLinkHref } from "./BackLinkContext";

/** Pages where the primary nav is itself the way around: the wordmark is a
 *  plain link to "/" with no arrow. Every other page is a detail page. */
const SECTION_PAGES = new Set(["/", "/congress", "/congress/wealth", "/supreme-court", "/executive-orders"]);

/**
 * One header row at `md`+ (two slim rows below): wordmark, branch tabs
 * (SiteNav), then — for a branch with two or more sections — a divider and
 * the section pills (SiteSectionNav), all left-aligned; the right is empty. Each explorer/section renders its
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
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-stretch md:h-14 md:flex-nowrap md:px-6">
        <Link
          href={isDetail ? backHref : "/"}
          title={isDetail ? "Back to InsideGov" : undefined}
          className="group flex h-12 flex-1 items-center gap-1.5 whitespace-nowrap pl-4 font-serif text-[1.1rem] font-semibold tracking-tight text-ink md:mr-8 md:h-auto md:flex-none md:pl-0 md:text-[1.35rem]"
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
        <SiteSectionNav />
      </div>
    </header>
  );
}
