"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
      className="[scrollbar-width:none] [&::-webkit-scrollbar]:hidden flex h-12 min-w-0 flex-1 items-stretch justify-end gap-0 overflow-x-auto pr-1 md:flex-none md:justify-start md:overflow-visible md:h-auto md:gap-2 md:pr-0"
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
    <>
      {/* The visible tag costs ~35px, which pushes the last section pill off a 390px phone; screen readers still hear it. */}
      <span aria-hidden className="hidden rounded border border-line px-1 text-[0.55rem] tracking-[0.08em] md:inline">
        soon
      </span>
      <span className="sr-only">coming soon</span>
    </>
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
      <ScrollRow label={`${row.branch.label} views`}>
        {row.branch.sections.map((s) => {
          const base =
            "flex h-11 flex-none items-center gap-1.5 whitespace-nowrap px-2 md:px-2.5 font-mono text-[0.66rem] uppercase tracking-[0.08em] transition-colors md:tracking-[0.09em] md:h-9 md:text-[0.8rem]";
          if (s.status !== "live") {
            return (
              <span
                key={s.id}
                aria-disabled="true"
                className={`${base} border-b-2 border-transparent text-ink-faint`}
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
                  ? "border-b-2 border-accent text-ink"
                  : "border-b-2 border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {s.label}
            </Link>
          );
        })}
      </ScrollRow>
    </>
  );
}

/**
 * The section pills. The row scrolls sideways when it doesn't fit (phones, and desktop widths where the tabs crowd it). While pills are cut off on the
 * right, a raised "+N ›" button over a fade names how many are hidden and scrolls the row on click; a "‹" button mirrors it once the row has been
 * scrolled. The active pill is scrolled into view on load.
 */
function ScrollRow({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [hiddenRight, setHiddenRight] = useState(0);
  const [canBack, setCanBack] = useState(false);
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const edge = el.scrollLeft + el.clientWidth;
    let n = 0;
    for (const c of Array.from(el.children) as HTMLElement[]) {
      if (c.offsetLeft + c.offsetWidth > edge + 4) n++;
    }
    setHiddenRight(n);
    setCanBack(el.scrollLeft > 4);
  }, []);
  const scrollBy = (dir: 1 | -1) =>
    ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.6, behavior: "smooth" });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>('[aria-current="page"]');
    if (active && active.offsetLeft + active.offsetWidth > el.clientWidth) el.scrollLeft = active.offsetLeft - 16;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, children]);
  const btn =
    "flex h-7 items-center justify-center rounded-full border border-line bg-surface-raised font-mono text-[0.72rem] text-ink shadow-sm transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent md:bg-surface";
  return (
    <div className="relative order-3 min-w-0 basis-full md:order-none md:basis-auto md:self-center">
      <nav
        ref={ref}
        aria-label={label}
        onScroll={measure}
        className="flex h-12 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-t border-line bg-surface-raised px-4 py-0.5 md:h-auto md:gap-1.5 md:border-t-0 md:bg-transparent md:p-1"
      >
        {children}
      </nav>
      {canBack && (
        <span className="pointer-events-none absolute inset-y-0 left-0 flex w-14 items-center bg-gradient-to-r from-surface-raised from-50% to-transparent pl-2 md:from-surface">
          <button type="button" aria-label="Scroll sections back" onClick={() => scrollBy(-1)} className={`pointer-events-auto w-7 text-[1rem] ${btn}`}>
            ‹
          </button>
        </span>
      )}
      {hiddenRight > 0 && (
        <span className="pointer-events-none absolute inset-y-0 right-0 flex w-20 items-center justify-end bg-gradient-to-l from-surface-raised from-55% to-transparent pr-2 md:from-surface">
          <button
            type="button"
            aria-label={`Show ${hiddenRight} more ${hiddenRight === 1 ? "section" : "sections"}`}
            onClick={() => scrollBy(1)}
            className={`pointer-events-auto gap-1 px-2.5 ${btn}`}
          >
            +{hiddenRight} <span aria-hidden className="text-[1rem] leading-none">›</span>
          </button>
        </span>
      )}
    </div>
  );
}
