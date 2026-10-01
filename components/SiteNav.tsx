"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { branches, sectionRow } from "@/lib/verticals";

/**
 * Persistent two-level nav (see lib/verticals.ts), rendered as groups of the
 * single SiteHeader row. `SiteNav` is the vertical tabs (Congress, Supreme
 * Court, Presidency) — text tabs with an accent underline flush with the
 * header's bottom border; `soon` verticals render as disabled text.
 * `SiteSectionNav` is the divider plus the section pills of the active
 * vertical, shown for any live vertical (even with one section) and on its
 * profile pages, where no pill is highlighted. `soon` sections are disabled.
 * Below `md` the pills wrap onto their own slim row, a single row that
 * scrolls horizontally.
 */
export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      className="flex h-12 min-w-0 flex-1 items-stretch justify-end gap-0 overflow-x-auto pr-1 md:flex-none md:justify-start md:overflow-visible md:h-auto md:gap-2 md:pr-0"
    >
      {branches.map((b) => {
          if (b.status !== "live") {
            return (
              <span
                key={b.id}
                aria-disabled="true"
                className="flex items-center gap-1.5 whitespace-nowrap border-b-[3px] border-transparent px-1.5 font-mono text-[0.72rem] uppercase tracking-[0.04em] text-ink-faint md:px-3.5 md:text-[0.8rem] md:tracking-[0.14em]"
              >
                {b.label}
                <SoonTag />
              </span>
            );
          }
          const active = b.owns(pathname);
          return (
            <Link
              key={b.id}
              href={b.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center whitespace-nowrap border-b-[3px] px-1.5 font-mono text-[0.72rem] uppercase tracking-[0.04em] transition-colors md:px-3.5 md:text-[0.8rem] md:tracking-[0.14em] ${
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

function SoonTag() {
  return (
    <span className="rounded border border-line px-1 text-[0.55rem] tracking-[0.08em]">
      soon
    </span>
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
        className="order-3 flex h-12 min-w-0 basis-full items-center gap-1 overflow-x-auto border-t border-line bg-surface-raised px-4 py-0.5 md:order-none md:h-auto md:basis-auto md:gap-1.5 md:border-t-0 md:bg-transparent md:p-0"
      >
        {row.branch.sections.map((s) => {
          const base =
            "flex h-11 flex-none items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 md:px-4 font-mono text-[0.66rem] uppercase tracking-[0.08em] transition-colors md:tracking-[0.14em] md:h-9 md:text-[0.8rem]";
          if (s.status !== "live") {
            return (
              <span
                key={s.id}
                aria-disabled="true"
                className={`${base} text-ink-faint`}
              >
                {s.label}
                <SoonTag />
              </span>
            );
          }
          const active = row.active?.id === s.id;
          return (
            <Link
              key={s.id}
              href={s.href}
              aria-current={active ? "page" : undefined}
              className={`${base} ${
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
