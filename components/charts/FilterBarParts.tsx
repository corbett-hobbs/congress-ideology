"use client";

import { useEffect, useRef, useState } from "react";

/** The pinned filter bars' dropdown and caption styles (Decisions, Laws). */
export const FILTER_SELECT =
  "min-w-0 rounded-md border border-line-strong bg-surface-raised px-[0.55rem] py-[0.42rem] text-[0.8rem] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
export const FILTER_LABEL = "font-mono text-[0.62rem] uppercase tracking-[0.08em] text-ink-faint";


/**
 * A small "?" button beside a filter checkbox (Landmark cases, Major laws). The label still toggles the filter; this only explains it. A mouse
 * previews on hover; a tap (or click) keeps the note open until a tap elsewhere, Esc or a scroll, so it works on phones.
 */
export function HelpTip({ label, text }: { label: string; text: string }) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const open = hover || pinned;
  useEffect(() => {
    if (!pinned) return;
    const close = () => setPinned(false);
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", close, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", close);
    };
  }, [pinned]);
  return (
    <span ref={ref} onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)} onPointerLeave={() => setHover(false)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setPinned((p) => !p)}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-line-strong font-mono text-[0.65rem] leading-none text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        ?
      </button>
      {open && (
        <span role="note" className="absolute left-4 top-full z-50 mt-1 w-[min(19rem,calc(100vw-2rem))] rounded-md border border-line-strong bg-surface-raised p-2.5 text-[0.78rem] leading-snug text-ink shadow-md sm:left-6">
          {text}
        </span>
      )}
    </span>
  );
}

