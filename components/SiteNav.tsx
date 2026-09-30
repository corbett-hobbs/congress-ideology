"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeSection, branches, sectionRow } from "@/lib/verticals";

/**
 * Persistent two-tier nav (see lib/verticals.ts), rendered as groups of the
 * single SiteHeader row. `SiteNav` is the branch tabs (Congress, Supreme
 * Court) — text tabs with an accent underline flush with the header's bottom
 * border. `SiteSectionNav` is the divider plus the section pills (Ideology,
 * Wealth), shown only for a branch with two or more sections, on that
 * branch's section pages. Below `md` the pills wrap onto their own slim row.
 */
export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      className="flex h-12 items-stretch gap-1 pr-2 md:h-auto md:gap-2 md:pr-0"
    >
      {branches
        .filter((b) => b.status === "live")
        .map((b) => {
          const active = b.owns(pathname);
          return (
            <Link
              key={b.id}
              href={b.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center whitespace-nowrap border-b-[3px] px-2 font-mono text-[0.68rem] uppercase tracking-[0.1em] transition-colors md:px-3.5 md:text-[0.8rem] md:tracking-[0.14em] ${
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
    <>
      <span
        aria-hidden
        className="mx-6 hidden h-7 w-px self-center bg-line md:block"
      />
      <nav
        aria-label={`${row.branch.label} views`}
        className="order-3 flex h-12 basis-full items-center gap-1 border-t border-line bg-surface-raised px-4 py-0.5 md:order-none md:h-auto md:basis-auto md:gap-1.5 md:border-t-0 md:bg-transparent md:p-0"
      >
        {row.branch.sections.map((s) => {
          const active = activeSection(row.branch, pathname)?.id === s.id;
          return (
            <Link
              key={s.id}
              href={s.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-11 items-center whitespace-nowrap rounded-[10px] px-4 font-mono text-[0.75rem] uppercase tracking-[0.14em] transition-colors md:h-9 md:text-[0.8rem] ${
                active
                  ? "bg-accent text-accent-ink"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {s.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
