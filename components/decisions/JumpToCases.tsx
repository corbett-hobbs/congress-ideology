"use client";

import { useMemo, type MouseEvent } from "react";
import { fmtInt, filterCases } from "@/lib/decisions-derive";
import { useDecisionsValues } from "./DecisionsState";
import { useDecisionCases } from "./useDecisionCases";

/** The id of the wrapper around `CaseListCard`; the jump link scrolls to it. */
export const CASE_LIST_ID = "case-list";

/**
 * A link in the page intro to the case list at the bottom, so the list is found without scrolling past three charts. Its
 * count is the list's own count under the page-level filters (years, issue area, vote, landmark, pinned term); the list's
 * local outcome pills and search box are not counted. Scrolls so the card lands just under the pinned filter bar, which
 * would otherwise cover its title.
 */
export function JumpToCases() {
  const { data, range, area, band, pin, landmark } = useDecisionsValues();
  const { cases } = useDecisionCases(data.casesVersion);
  const n = useMemo(() => (cases ? filterCases(data, cases, { range, area, band, term: pin, landmark, direction: null }).length : null), [cases, data, range, area, band, pin, landmark]);
  const filtered = cases !== null && n !== cases.length;

  const jump = (e: MouseEvent<HTMLAnchorElement>) => {
    const el = document.getElementById(CASE_LIST_ID);
    if (!el) return;
    e.preventDefault();
    const bar = document.querySelector<HTMLElement>("[data-pinned-bar]");
    const top = el.getBoundingClientRect().top + window.scrollY - (bar?.offsetHeight ?? 0) - 12;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top, behavior: calm ? "auto" : "smooth" });
    el.querySelector<HTMLElement>("[aria-label='Cases, scrollable']")?.focus({ preventScroll: true });
  };

  return (
    <p>
      <a
        href={`#${CASE_LIST_ID}`}
        onClick={jump}
        className="font-medium text-accent underline decoration-line-strong underline-offset-2 hover:decoration-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {n === null ? "Browse every case" : filtered ? `Browse the ${fmtInt(n)} case${n === 1 ? "" : "s"} that match` : `Browse all ${fmtInt(n)} cases`} ↓
      </a>
    </p>
  );
}
