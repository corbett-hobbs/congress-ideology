"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { verticals } from "@/lib/verticals";

/**
 * Persistent top-level section nav, one entry per vertical (see
 * lib/verticals.ts). Rendered in SiteHeader on every page.
 */
export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Sections" className="flex items-center gap-1">
      {verticals.map((v) => {
        const active = v.owns(pathname);
        return (
          <Link
            key={v.key}
            href={v.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-md px-1.5 py-1 font-mono text-[0.68rem] uppercase tracking-[0.06em] transition-colors sm:px-2 sm:text-[0.7rem] sm:tracking-[0.08em] ${
              active
                ? "bg-accent text-accent-ink"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            {v.label}
            {v.upcoming && (
              <span className="ml-1 text-[0.9em] opacity-70">soon</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
