"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const W = 288;
const EDGE = 8;

/**
 * A small numbered circle that opens a note, the same idiom as the timeline's definition-change markers
 * (numbered, hover or focus opens, Esc closes, tap toggles, tap outside closes) but for inline use in a
 * card header or lede. The note is fixed-positioned from the button and clamped inside the viewport, so
 * it never overflows a phone and is never clipped by the card.
 */
export function InfoMarker({ n, label, children }: { n: number; label: string; children: ReactNode }) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const open = hover || pinned;

  const close = useCallback(() => {
    setHover(false);
    setPinned(false);
  }, []);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const w = Math.min(W, document.documentElement.clientWidth - 2 * EDGE);
    const left = Math.max(EDGE, Math.min(r.left + r.width / 2 - w / 2, document.documentElement.clientWidth - w - EDGE));
    setPos({ left, top: r.bottom + 8 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: PointerEvent) => !btn.current?.contains(e.target as Node) && close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", close, { passive: true, capture: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", close, true);
    };
  }, [open, close]);

  return (
    <span className="relative inline-flex align-middle">
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setPinned((p) => !p)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        className="grid h-[1.15rem] w-[1.15rem] cursor-help place-items-center rounded-full border border-line-strong bg-transparent p-0 font-mono text-[0.62rem] font-medium leading-none text-ink-muted hover:border-accent hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {n}
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="pointer-events-none fixed z-50 box-border rounded-lg border border-line-strong bg-surface px-3.5 py-3 text-[0.8rem] font-normal leading-[1.5] text-ink-muted shadow-[0_6px_20px_rgba(26,34,51,0.14)]"
          style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: `min(${W}px, calc(100vw - ${2 * EDGE}px))` }}
        >
          {children}
        </span>
      )}
    </span>
  );
}
