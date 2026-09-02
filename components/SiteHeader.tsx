import Link from "next/link";
import { SiteNav } from "./SiteNav";

/**
 * Slim bar at the very top of every page: the wordmark plus the top-level
 * section nav (SiteNav). Each explorer/section renders its own controls below
 * this — e.g. components/senate/ExplorerToolbar.tsx.
 */
export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex min-h-12 w-full max-w-[1180px] flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-1.5 sm:px-6">
        <Link
          href="/"
          className="whitespace-nowrap font-serif text-[0.95rem] font-semibold tracking-tight text-ink sm:text-[1.1rem]"
        >
          InsideGov
        </Link>
        <SiteNav />
      </div>
    </header>
  );
}
