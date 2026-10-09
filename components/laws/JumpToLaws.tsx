"use client";

import type { MouseEvent } from "react";
import { fmtInt } from "@/lib/decisions-derive";
import { LAW_LIST_ID, useFilteredLaws } from "./LawsListCard";

/**
 * A link in the page intro to the list at the bottom, so the list is found without scrolling past three charts. Its count is
 * the list's own count under the page-level filters (years, policy area, major laws, vote band, pinned Congress); the search
 * box is not counted. Scrolls so the card lands just under the pinned filter bar, which would otherwise cover its title.
 */
export function JumpToLaws() {
  const { list, rows } = useFilteredLaws();
  const n = list ? rows.length : null;
  const filtered = list !== null && n !== list.rows.length;
  const jump = (e: MouseEvent<HTMLAnchorElement>) => {
    const el = document.getElementById(LAW_LIST_ID);
    if (!el) return;
    e.preventDefault();
    const bar = document.querySelector<HTMLElement>("[data-pinned-bar]");
    const top = el.getBoundingClientRect().top + window.scrollY - (bar?.offsetHeight ?? 0) - 12;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top, behavior: calm ? "auto" : "smooth" });
    el.querySelector<HTMLElement>("[aria-label='Laws, scrollable']")?.focus({ preventScroll: true });
  };
  return (
    <p>
      <a
        href={`#${LAW_LIST_ID}`}
        onClick={jump}
        className="font-medium text-accent underline decoration-line-strong underline-offset-2 hover:decoration-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {n === null ? "Browse every law" : filtered ? `Browse the ${fmtInt(n)} law${n === 1 ? "" : "s"} that match` : `Browse all ${fmtInt(n)} laws`} ↓
      </a>
    </p>
  );
}
