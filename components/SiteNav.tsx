"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeSection, branches, sectionRow } from "@/lib/verticals";

/**
 * Persistent two-tier nav (see lib/verticals.ts). `SiteNav` is the primary
 * row — one underlined entry per live branch, rendered in SiteHeader on every
 * page. `SiteSectionNav` is the secondary row of section tabs, shown only for
 * a branch with two or more sections, on that branch's section pages.
 */
export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Branches" className="flex items-center gap-3 sm:gap-4">
      {branches
        .filter((b) => b.status === "live")
        .map((b) => {
          const active = b.owns(pathname);
          return (
            <Link
              key={b.id}
              href={b.href}
              aria-current={active ? "true" : undefined}
              className={`whitespace-nowrap border-b-2 py-1 font-mono text-[0.68rem] uppercase tracking-[0.06em] transition-colors sm:text-[0.7rem] sm:tracking-[0.08em] ${
                active
                  ? "border-accent text-ink"
                  : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {b.label}
            </Link>
          );
        })}
    </nav>
  );
}

export function SiteSectionNav() {
  const pathname = usePathname();
  const row = sectionRow(pathname);
  if (!row) return null;

  return (
    <div className="border-b border-line bg-surface">
      <nav
        aria-label={`${row.branch.label} sections`}
        className="mx-auto flex w-full max-w-[1180px] items-center gap-1 px-4 py-1.5 sm:px-6"
      >
        <div role="group" className="flex items-center gap-1">
          {row.branch.sections.map((s) => {
            const active = activeSection(row.branch, pathname)?.id === s.id;
            return (
              <Link
                key={s.id}
                href={s.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-md px-2 py-1 font-mono text-[0.68rem] uppercase tracking-[0.06em] transition-colors sm:text-[0.7rem] sm:tracking-[0.08em] ${
                  active
                    ? "bg-accent text-accent-ink"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {s.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
